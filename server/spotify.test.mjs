import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicService } from './spotify.mjs';

const env = { SPOTIFY_CLIENT_ID: 'test-client', SPOTIFY_CLIENT_SECRET: 'test-secret', SPOTIFY_REFRESH_TOKEN: 'test-refresh' };
const track = { id: '7rXke3ttpL2uXel9Nesf4u', name: 'a song', artists: [{ name: 'an artist' }], album: { name: 'an album', images: [{ width: 300, url: 'https://i.scdn.co/image/test' }] } };
const token = () => Response.json({ access_token: 'private-access-token', expires_in: 3600 });

test('refreshes the configured account and serves only top-track metadata', async () => {
  const calls = [];
  const service = createMusicService({ fetcher: async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    if (url.includes('/api/token')) {
      assert.equal(options.headers.Authorization, `Basic ${Buffer.from('test-client:test-secret').toString('base64')}`);
      assert.equal(options.body.get('refresh_token'), 'test-refresh');
      return token();
    }
    assert.equal(url, 'https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=12');
    assert.equal(options.headers.Authorization, 'Bearer private-access-token');
    return Response.json({ items: [{ ...track, secret: 'private' }] });
  } });
  const response = await service('GET', env);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].artist, 'an artist');
  assert.equal(data.mode, 'top');
  assert.equal(data.canManage, false);
  assert.equal(JSON.stringify(data).includes('private'), false);
  assert.match(response.headers.get('Cache-Control'), /s-maxage=300/);
  await service('GET', env);
  assert.equal(calls.length, 2, 'warm cached request does not call Spotify');
});

test('missing credentials and unsupported methods never contact Spotify', async () => {
  const service = createMusicService({ fetcher: () => assert.fail('unexpected request') });
  assert.equal((await service('GET', {})).status, 503);
  const response = await service('POST', env);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET');
});

test('authentication failures do not expose upstream data', async () => {
  const service = createMusicService({ fetcher: async () => new Response('private error details', { status: 400 }) });
  const response = await service('GET', env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'music_unavailable' });
});

test('filters invalid tracks and unsafe images and caps the list at twelve', async () => {
  const service = createMusicService({ fetcher: async (url) => url.includes('/api/token') ? token() : Response.json({ items: [null, { id: '../setup' }, ...Array(20).fill({ ...track, album: { images: [{ url: 'https://evil.example/art' }] } })] }) });
  const data = await (await service('GET', env)).json();
  assert.equal(data.items.length, 12);
  assert.equal(data.items[0].image, null);
  assert.equal(data.items[0].spotifyUrl, `https://open.spotify.com/track/${track.id}`);
});

test('expired cache survives Spotify outages with a stale label', async () => {
  let time = Date.now();
  let unavailable = false;
  const service = createMusicService({ now: () => time, fetcher: async (url) => {
    if (unavailable) throw new Error('outage');
    return url.includes('/api/token') ? token() : Response.json({ items: [track] });
  } });
  await service('GET', env);
  time += 3600001;
  unavailable = true;
  const data = await (await service('GET', env)).json();
  assert.equal(data.items.length, 1);
  assert.equal(data.stale, true);
});

test('an expired access token retries once with a refreshed token', async () => {
  let tokens = 0;
  let requests = 0;
  const service = createMusicService({ fetcher: async (url) => {
    if (url.includes('/api/token')) { tokens++; return token(); }
    return ++requests === 1 ? new Response('', { status: 401 }) : Response.json({ items: [track] });
  } });
  assert.equal((await service('GET', env)).status, 200);
  assert.equal(tokens, 2);
  assert.equal(requests, 2);
});
