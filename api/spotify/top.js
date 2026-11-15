import { createMusicService } from '../../server/spotify.mjs';

const getPublicTracks = createMusicService();

export default async function handler(request, response) {
  const result = await getPublicTracks(request.method, process.env);
  response.statusCode = result.status;
  for (const [name, value] of result.headers) response.setHeader(name, value);
  response.end(await result.text());
}
