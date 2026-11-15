const CACHE_TTL = 60 * 60 * 1000;

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  } });
}

function normalizeTrack(track) {
  if (!track || !/^[A-Za-z0-9]{22}$/.test(track.id || '')) return null;
  const image = track.album?.images?.find((image) => image.width >= 300)?.url || track.album?.images?.[0]?.url;
  return {
    id: track.id,
    title: String(track.name || ''),
    artist: (track.artists || []).map((artist) => artist.name).join(', '),
    album: String(track.album?.name || ''),
    image: typeof image === 'string' && image.startsWith('https://i.scdn.co/') ? image : null,
    spotifyUrl: `https://open.spotify.com/track/${track.id}`,
  };
}

export function createMusicService({ fetcher = fetch, now = Date.now } = {}) {
  let token;
  let cached;
  let pending;

  async function refresh(env) {
    const response = await fetcher('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.SPOTIFY_REFRESH_TOKEN }),
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('spotify_unavailable');
    const data = await response.json();
    if (typeof data.access_token !== 'string' || !(data.expires_in > 0)) throw new Error('invalid_token');
    token = { value: data.access_token, expiresAt: now() + data.expires_in * 1000 };
  }

  async function load(env) {
    if (!token || token.expiresAt <= now() + 60000) await refresh(env);
    const fetchTracks = () => fetcher('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=12', {
      headers: { Authorization: `Bearer ${token.value}` },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    let response = await fetchTracks();
    if (response.status === 401) { await refresh(env); response = await fetchTracks(); }
    if (!response.ok) throw new Error('spotify_unavailable');
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error('invalid_music');
    cached = {
      expiresAt: now() + CACHE_TTL,
      body: { mode: 'top', items: data.items.map(normalizeTrack).filter(Boolean).slice(0, 12), updatedAt: new Date(now()).toISOString(), canManage: false },
    };
  }

  return async function getPublicTracks(method, env) {
    if (method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
    if (!['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REFRESH_TOKEN'].every((key) => env[key])) return json({ error: 'music_unavailable' }, 503);
    try {
      if (!cached || cached.expiresAt <= now()) {
        // Reuse one refresh for concurrent requests on a warm function instance.
        pending ||= load(env).finally(() => { pending = null; });
        await pending;
      }
      return json(cached.body, 200, { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' });
    } catch {
      // Return only song metadata; upstream errors and credentials stay private.
      return cached ? json({ ...cached.body, stale: true }) : json({ error: 'music_unavailable' }, 503);
    }
  };
}
