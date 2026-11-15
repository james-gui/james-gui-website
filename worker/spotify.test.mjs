import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleRequest, setAssets } from './index.js';

const origin = 'https://example.chatgpt.site';
const ownerHeaders = { 'oai-authenticated-user-id': 'site-owner-123', 'oai-authenticated-user-email': 'owner@example.com' };
const track = { id: '7rXke3ttpL2uXel9Nesf4u', name: 'a song', artists: [{ name: 'an artist' }], album: { name: 'an album', images: [{ width: 300, url: 'https://i.scdn.co/image/test' }] } };
setAssets({
  '/music-fallback.json': { body: Buffer.from(JSON.stringify({ mode: 'recent', items: [], updatedAt: null })).toString('base64') },
  '/good-things.html': { body: readFileSync(new URL('../public/good-things.html', import.meta.url)).toString('base64') },
  '/styles.css': { type: 'text/css; charset=utf-8', body: Buffer.from('.recognition-event { display: block; }').toString('base64'), version: 'current-style-version' },
});

test('only matching versioned stylesheets stay cached across deployments', async () => {
  for (const path of ['/styles.css', '/styles.css?v=old-style-version']) {
    const response = await handleRequest(req(path), {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-cache');
  }
  const current = await handleRequest(req('/styles.css?v=current-style-version'), {});
  assert.equal(current.status, 200);
  assert.equal(current.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal(await current.text(), '.recognition-event { display: block; }');
});

class Store {
  values = new Map();
  async put(key, value) { this.values.set(key, value); }
  async get(key) { const value = this.values.get(key); return value ? { json: async () => JSON.parse(value) } : null; }
  async delete(key) { this.values.delete(key); }
}
function env() {
  return { SITE_ORIGIN: origin, SITE_OWNER_EMAIL: 'owner@example.com', SPOTIFY_CLIENT_ID: 'test-client-id', SPOTIFY_ENCRYPTION_KEY: 'a1'.repeat(32), SPOTIFY_STORE: new Store() };
}
function req(path, options = {}) { return new Request(origin + path, options); }
async function start(config) {
  const response = await handleRequest(req('/api/spotify/connect', { method: 'POST', headers: { ...ownerHeaders, Origin: origin } }), config);
  assert.equal(response.status, 303);
  const auth = new URL(response.headers.get('Location'));
  return { auth, state: auth.searchParams.get('state'), cookie: response.headers.get('Set-Cookie').split(';')[0] };
}
async function authorize(config, options = {}) {
  const state = await start(config);
  const response = await handleRequest(req(`/api/spotify/callback?state=${state.state}&code=one-time-code`, { headers: { ...ownerHeaders, Cookie: state.cookie } }), config, async (url, init) => {
    assert.equal(url, 'https://accounts.spotify.com/api/token');
    assert.equal(init.body.get('grant_type'), 'authorization_code');
    assert.equal(init.body.get('redirect_uri'), origin + '/api/spotify/callback');
    assert.ok(init.body.get('code_verifier'));
    assert.equal(init.body.has('client_secret'), false);
    return Response.json({ access_token: 'private-access-token', refresh_token: 'private-refresh-token', expires_in: options.expires || 3600, scope: options.scope || 'user-top-read' });
  });
  return { response, ...state };
}

test('only the owner may connect and cross-origin POSTs are rejected', async () => {
  const config = env();
  for (const headers of [{}, ownerHeaders, { ...ownerHeaders, Origin: 'null' }, { ...ownerHeaders, Origin: 'https://attacker.example' }, { ...ownerHeaders, 'oai-authenticated-user-email': 'viewer@example.com', Origin: origin }]) {
    const response = await handleRequest(req('/api/spotify/connect', { method: 'POST', headers }), config);
    assert.equal(response.status, 403);
  }
  assert.equal(config.SPOTIFY_STORE.values.size, 0);
});

test('setup preserves the native form POST origin without disclosing off-site referrers', async () => {
  const config = env();
  const setup = await handleRequest(req('/spotify/setup', { headers: ownerHeaders }), config);
  assert.equal(setup.status, 200);
  assert.equal(setup.headers.get('Referrer-Policy'), 'same-origin');
  assert.equal(setup.headers.get('Cache-Control'), 'no-store');
  const html = await setup.text();
  assert.match(html, /<form method="post" action="\/api\/spotify\/connect">/);
  assert.doesNotMatch(html, /<meta[^>]+name=["']referrer["'][^>]+no-referrer/i);
  const connected = await handleRequest(req('/api/spotify/connect', { method: 'POST', headers: {
    ...ownerHeaders, Origin: origin, Referer: origin + '/spotify/setup',
    'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate',
    'Content-Type': 'application/x-www-form-urlencoded',
  } }), config);
  assert.equal(connected.status, 303);
  assert.equal(new URL(connected.headers.get('Location')).origin, 'https://accounts.spotify.com');
  // OAuth redirects still suppress referrers, including callback query data.
  assert.equal(connected.headers.get('Referrer-Policy'), 'no-referrer');
  assert.match(connected.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
});

test('OAuth uses PKCE and only the top-tracks scope', async () => {
  const { auth, cookie } = await start(env());
  assert.equal(auth.origin, 'https://accounts.spotify.com');
  assert.equal(auth.searchParams.get('scope'), 'user-top-read');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.match(auth.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.match(cookie, /^__Host-spotify-state=/);
});

test('callback rejects missing cookie and a different signed-in user', async () => {
  const config = env();
  const flow = await start(config);
  const failFetch = async () => { throw new Error('must not exchange a token'); };
  for (const headers of [ownerHeaders, { ...ownerHeaders, 'oai-authenticated-user-id': 'another-user', Cookie: flow.cookie }]) {
    const response = await handleRequest(req(`/api/spotify/callback?state=${flow.state}&code=test`, { headers }), config, failFetch);
    assert.equal(response.headers.get('Location'), '/spotify/setup?error=expired');
  }
  assert.equal(config.SPOTIFY_STORE.values.has('spotify/account.enc'), false);
});

test('callback stores encrypted credentials, consumes state, and prevents replay', async () => {
  const config = env();
  const { response, state, cookie } = await authorize(config);
  assert.equal(response.headers.get('Location'), '/good-things.html?spotify=connected#music-title');
  assert.equal(config.SPOTIFY_STORE.values.has(`spotify/oauth/${state}`), false);
  assert.ok(config.SPOTIFY_STORE.values.has('spotify/account.enc'));
  for (const value of config.SPOTIFY_STORE.values.values()) {
    assert.equal(value.includes('private-access-token'), false);
    assert.equal(value.includes('private-refresh-token'), false);
  }
  const replay = await handleRequest(req(`/api/spotify/callback?state=${state}&code=one-time-code`, { headers: { ...ownerHeaders, Cookie: cookie } }), config);
  assert.equal(replay.headers.get('Location'), '/spotify/setup?error=expired');
});

test('callback rejects authorization without user-top-read', async () => {
  const config = env();
  const { response } = await authorize(config, { scope: 'user-read-recently-played' });
  assert.equal(response.headers.get('Location'), '/spotify/setup?error=scope');
  assert.equal(config.SPOTIFY_STORE.values.has('spotify/account.enc'), false);
});

test('top tracks use short_term, cache responses, and never return credentials', async () => {
  const config = env();
  await authorize(config);
  let calls = 0;
  const fetcher = async (url, init) => {
    calls++;
    assert.equal(new URL(url).searchParams.get('time_range'), 'short_term');
    assert.equal(init.headers.Authorization, 'Bearer private-access-token');
    return Response.json({ items: [track] });
  };
  for (let i = 0; i < 2; i++) {
    const response = await handleRequest(req('/api/spotify/top'), config, fetcher);
    const text = await response.text();
    assert.equal(text.includes('private-'), false);
    const data = JSON.parse(text);
    assert.equal(data.mode, 'top');
    assert.equal(data.canManage, false);
    assert.equal(data.items[0].spotifyUrl, `https://open.spotify.com/track/${track.id}`);
  }
  assert.equal(calls, 1);
});

test('expired access tokens refresh without exposing refresh tokens', async () => {
  const config = env();
  await authorize(config, { expires: 1 });
  const calls = [];
  const response = await handleRequest(req('/api/spotify/top', { headers: ownerHeaders }), config, async (url, init) => {
    calls.push(url);
    if (url.includes('/api/token')) {
      assert.equal(init.body.get('grant_type'), 'refresh_token');
      assert.equal(init.body.get('refresh_token'), 'private-refresh-token');
      return Response.json({ access_token: 'refreshed-token', expires_in: 3600 });
    }
    assert.equal(init.headers.Authorization, 'Bearer refreshed-token');
    return Response.json({ items: [track] });
  });
  const data = await response.json();
  assert.equal(calls.length, 2);
  assert.equal(data.canManage, true);
  assert.equal(data.mode, 'top');
});

test('expired refresh credentials request reconnection instead of repeating failures', async () => {
  const config = env();
  await authorize(config, { expires: 1 });
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json({ error: 'invalid_grant' }, { status: 400 }); };
  for (let i = 0; i < 2; i++) {
    const response = await handleRequest(req('/api/spotify/top'), config, fetcher);
    const data = await response.json();
    assert.equal(data.needsReconnect, true);
    assert.equal(data.connected, false);
  }
  assert.equal(calls, 1);
});

test('Spotify outage preserves cached songs and labels them stale', async () => {
  const config = env();
  await authorize(config);
  await config.SPOTIFY_STORE.put('spotify/top.json', JSON.stringify({ mode: 'top', items: [track], expiresAt: 0, updatedAt: '2026-11-15T00:00:00Z' }));
  const response = await handleRequest(req('/api/spotify/top'), config, async () => new Response('', { status: 429 }));
  const data = await response.json();
  assert.equal(data.stale, true);
  assert.equal(data.items.length, 1);
});

test('unconnected site labels songs as recent rather than monthly top tracks', async () => {
  const response = await handleRequest(req('/api/spotify/top'), env());
  const data = await response.json();
  assert.equal(data.mode, 'recent');
  assert.equal(data.connected, false);
  assert.equal(data.canManage, false);
});
