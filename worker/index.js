let assets = {};
export function setAssets(value) { assets = value; }

const ACCOUNT_KEY = 'spotify/account.enc';
const CACHE_KEY = 'spotify/top.json';
const COOKIE = '__Host-spotify-state';
const AUTH_TTL = 10 * 60 * 1000;
const CACHE_TTL = 60 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
function escape(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unbase64(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}
function randomToken() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
function isOwner(request, env) {
  const userId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  return Boolean(userId && env.SITE_OWNER_EMAIL && email?.toLowerCase() === env.SITE_OWNER_EMAIL.toLowerCase());
}
function configured(env) {
  return Boolean(env.SPOTIFY_STORE && env.SPOTIFY_CLIENT_ID && env.SITE_ORIGIN && /^[0-9a-f]{64}$/i.test(env.SPOTIFY_ENCRYPTION_KEY || ''));
}
function origin(env) { return new URL(env.SITE_ORIGIN).origin; }
function callbackUrl(env) { return `${origin(env)}/api/spotify/callback`; }
function sameOrigin(request, env) { return request.headers.get('Origin') === origin(env); }
function cookie(request) {
  return (request.headers.get('Cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}
function stateCookie(value, age = 600) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}
function redirect(url, cookieValue) {
  const headers = new Headers({ Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  if (cookieValue) headers.set('Set-Cookie', cookieValue);
  return new Response(null, { status: 303, headers });
}
async function encryptionKey(env) {
  const raw = Uint8Array.from(env.SPOTIFY_ENCRYPTION_KEY.match(/../g), (v) => parseInt(v, 16));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function putSecret(env, key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(key) }, await encryptionKey(env), encoder.encode(JSON.stringify(value)));
  await env.SPOTIFY_STORE.put(key, JSON.stringify({ iv: base64url(iv), body: base64url(new Uint8Array(body)) }));
}
async function getSecret(env, key) {
  const record = await env.SPOTIFY_STORE.get(key);
  if (!record) return null;
  const { iv, body } = await record.json();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(iv), additionalData: encoder.encode(key) }, await encryptionKey(env), unbase64(body));
  return JSON.parse(decoder.decode(plain));
}
async function getCache(env) {
  return (await env.SPOTIFY_STORE.get(CACHE_KEY))?.json() ?? null;
}
function fallback() {
  const file = assets['/music-fallback.json'];
  return file ? JSON.parse(decoder.decode(unbase64(file.body))) : { mode: 'recent', items: [], updatedAt: null };
}
async function spotifyToken(params, fetcher) {
  const response = await fetcher('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params), signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error('spotify_token_failed');
    error.reconnect = data.error === 'invalid_grant';
    throw error;
  }
  if (!data.access_token || !(data.expires_in > 0)) throw new Error('spotify_token_invalid');
  return data;
}
async function refreshAccount(env, account, fetcher) {
  const token = await spotifyToken({ grant_type: 'refresh_token', refresh_token: account.refreshToken, client_id: env.SPOTIFY_CLIENT_ID }, fetcher);
  const next = { ...account, accessToken: token.access_token, refreshToken: token.refresh_token || account.refreshToken, expiresAt: Date.now() + token.expires_in * 1000 };
  await putSecret(env, ACCOUNT_KEY, next);
  return next;
}
function normalizeTrack(track) {
  if (!/^[a-zA-Z0-9]{22}$/.test(track.id || '')) return null;
  const image = track.album?.images?.find((i) => i.width >= 300)?.url || track.album?.images?.[0]?.url || null;
  return {
    id: track.id, title: String(track.name || ''), artist: (track.artists || []).map((a) => a.name).join(', '),
    album: track.album?.name || '', image: image && image.startsWith('https://i.scdn.co/') ? image : null,
    spotifyUrl: `https://open.spotify.com/track/${track.id}`,
  };
}

export async function topTracks(request, env, fetcher = fetch) {
  const canManage = isOwner(request, env);
  if (!configured(env)) return json({ ...fallback(), canManage, connected: false });
  let account = await getSecret(env, ACCOUNT_KEY);
  if (!account || account.needsReconnect) return json({ ...fallback(), canManage, connected: false, needsReconnect: Boolean(account?.needsReconnect) });
  const cached = await getCache(env);
  if (cached?.expiresAt > Date.now()) return json({ ...cached, canManage, connected: true });
  try {
    if (account.expiresAt < Date.now() + 60000) account = await refreshAccount(env, account, fetcher);
    const load = () => fetcher('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=12', {
      headers: { Authorization: `Bearer ${account.accessToken}` }, signal: AbortSignal.timeout(12000),
    });
    let response = await load();
    if (response.status === 401) { account = await refreshAccount(env, account, fetcher); response = await load(); }
    if (!response.ok) {
      const error = new Error('spotify_top_failed');
      error.reconnect = response.status === 401 || response.status === 403;
      throw error;
    }
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error('spotify_top_invalid');
    const result = { mode: 'top', period: 'short_term', updatedAt: new Date().toISOString(), expiresAt: Date.now() + CACHE_TTL, items: data.items.map(normalizeTrack).filter(Boolean) };
    await env.SPOTIFY_STORE.put(CACHE_KEY, JSON.stringify(result));
    return json({ ...result, canManage, connected: true });
  } catch (error) {
    if (error.reconnect) {
      await putSecret(env, ACCOUNT_KEY, { ...account, needsReconnect: true });
      return json({ ...(cached || fallback()), canManage, connected: false, needsReconnect: true, stale: true });
    }
    return json({ ...(cached || fallback()), canManage, connected: true, stale: true });
  }
}

async function connect(request, env) {
  if (!isOwner(request, env)) return json({ error: 'owner_only' }, 403);
  if (!configured(env)) return json({ error: 'not_configured' }, 503);
  if (!sameOrigin(request, env)) return json({ error: 'invalid_origin' }, 403);
  const state = randomToken();
  const verifier = randomToken();
  const previous = cookie(request);
  if (previous && /^[A-Za-z0-9_-]{43}$/.test(previous)) await env.SPOTIFY_STORE.delete(`spotify/oauth/${previous}`);
  await putSecret(env, `spotify/oauth/${state}`, { verifier, userId: request.headers.get('oai-authenticated-user-id'), expiresAt: Date.now() + AUTH_TTL });
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
  const url = new URL('https://accounts.spotify.com/authorize');
  url.search = new URLSearchParams({ client_id: env.SPOTIFY_CLIENT_ID, response_type: 'code', redirect_uri: callbackUrl(env), scope: 'user-top-read', state, code_challenge_method: 'S256', code_challenge: challenge }).toString();
  return redirect(url.toString(), stateCookie(state));
}

async function callback(request, env, fetcher) {
  if (!isOwner(request, env)) return json({ error: 'owner_only' }, 403);
  if (!configured(env)) return json({ error: 'not_configured' }, 503);
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const failed = (reason) => redirect(`/spotify/setup?error=${reason}`, stateCookie('', 0));
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || state !== cookie(request)) return failed('expired');
  const pending = await getSecret(env, `spotify/oauth/${state}`);
  await env.SPOTIFY_STORE.delete(`spotify/oauth/${state}`);
  if (!pending || pending.expiresAt < Date.now() || pending.userId !== request.headers.get('oai-authenticated-user-id')) return failed('expired');
  if (url.searchParams.has('error')) return failed('denied');
  const code = url.searchParams.get('code');
  if (!code || code.length > 2048) return failed('expired');
  try {
    const token = await spotifyToken({ client_id: env.SPOTIFY_CLIENT_ID, grant_type: 'authorization_code', code, redirect_uri: callbackUrl(env), code_verifier: pending.verifier }, fetcher);
    if (!token.refresh_token || !token.scope?.split(' ').includes('user-top-read')) return failed('scope');
    await putSecret(env, ACCOUNT_KEY, { userId: pending.userId, accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000, connectedAt: new Date().toISOString(), needsReconnect: false });
    await env.SPOTIFY_STORE.delete(CACHE_KEY);
    return redirect('/good-things.html?spotify=connected#music-title', stateCookie('', 0));
  } catch { return failed('connection'); }
}

async function setup(request, env) {
  if (!isOwner(request, env)) return new Response('owner access required', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const account = configured(env) ? await getSecret(env, ACCOUNT_KEY) : null;
  const code = new URL(request.url).searchParams.get('error');
  const messages = { expired: 'that connection attempt expired. please try again.', denied: 'spotify connection was cancelled. you can try again below.', scope: 'spotify did not grant access to your top tracks. please reconnect.', connection: 'the connection could not finish. check your redirect url in spotify and try again.' };
  const content = `<div class="page-index">spotify / account</div><h1>your music, here.</h1><div class="setup-copy"><p>connect your spotify account to show your top songs from the last four weeks. the grid updates automatically as people visit.</p><p class="setup-status">${escape(messages[code] || (account && !account.needsReconnect ? 'your spotify account is connected.' : 'one quick setup, then connect.'))}</p><ol class="setup-steps"><li>open your existing app in the <a class="text-link" href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">spotify developer dashboard</a>.<br><small>app client id: <span style="text-transform:none">${escape(env.SPOTIFY_CLIENT_ID)}</span></small></li><li>in settings, add this redirect url and save. keep the redirect url for jamesgui.com, too.<code class="setup-code">${escape(env.SITE_ORIGIN ? callbackUrl(env) : '')}</code></li><li>connect below, sign in to your spotify account, and allow access to your top tracks.</li></ol><p>your top tracks will appear here for visitors who can access this site. this connection only reads your top tracks.</p></div><form method="post" action="/api/spotify/connect"><button class="setup-button" type="submit" ${configured(env) ? '' : 'disabled'}>${account ? 'reconnect spotify' : 'connect spotify'}</button></form><div class="now"><a class="small-link" href="/good-things.html">back to good things ↗</a></div>`;
  let template = decoder.decode(unbase64(assets['/good-things.html'].body));
  template = template.replace(/<main id="main" tabindex="-1">[\s\S]*?<\/main>/, `<main id="main" tabindex="-1">${content}</main>`);
  template = template.replace('<head>', '<head><base href="/">').replace(/<title>.*?<\/title>/, '<title>connect spotify — james gui</title>');
  return new Response(template, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
}

function staticResponse(request) {
  const path = new URL(request.url).pathname;
  const entry = assets[path === '/' ? '/index.html' : path];
  if (!entry) return new Response('page not found', { status: 404 });
  return new Response(request.method === 'HEAD' ? null : unbase64(entry.body), { headers: {
    'Content-Type': entry.type, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': entry.type.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  } });
}

export async function handleRequest(request, env, fetcher = fetch) {
  const { pathname } = new URL(request.url);
  try {
    if (pathname === '/api/spotify/top' && request.method === 'GET') return await topTracks(request, env, fetcher);
    if (pathname === '/api/spotify/connect' && request.method === 'POST') return await connect(request, env);
    if (pathname === '/api/spotify/callback' && request.method === 'GET') return await callback(request, env, fetcher);
    if (pathname === '/spotify/setup' && request.method === 'GET') return await setup(request, env);
    if (pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
    return staticResponse(request);
  } catch {
    // Never include upstream response bodies or tokens in a browser response.
    return json({ error: 'temporarily_unavailable' }, 503);
  }
}

export default { fetch: (request, env) => handleRequest(request, env) };
