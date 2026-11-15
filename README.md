# James Gui

A small personal site inspired by the quiet layout of elsacai.com. Five pages, lowercase copy, self-hosted Inter, and a Spotify song grid.

## Edit and preview

The editable front end lives in `public/`:

- `index.html` — introduction and current interests
- `experiences.html` — internships, roles, and education
- `projects.html` — selected projects and demos
- `good-things.html` — restaurants and Spotify music
- `say-hello.html` — email and social links
- `styles.css` — shared typography, colors, and responsive layouts
- `site.js` — city switcher, clock, copy email, and Spotify grid updates
- `music-fallback.json` — saved recent listens shown before Spotify is connected

Run `npm run dev` and open http://127.0.0.1:4173. The local preview shows the saved music and does not access production credentials. No dependency installation is needed.

Run `npm test` for the Spotify authorization and token lifecycle checks. `npm run build` packages the front end and backend into `dist/server/index.js`. The build uses the existing Sites project in `.openai/hosting.json`; the generated `dist/` directory is not editable source.

## Vercel deployment

The Vercel project is `webssss` in `james-guis-projects-cb7cf3f2`, connected to `james-gui/james-gui-website`. Pushes to `main` deploy production automatically.

`vercel.json` selects `npm run build:vercel` and the generated `dist/static` directory. This build copies the public pages, versions the shared CSS/JS, and adds Vercel Web Analytics. The original `npm run build` still packages the Sites Worker. Web Analytics is enabled; view traffic in the project's Analytics tab.

The Vercel `/api/spotify/top` function uses the Spotify account already configured in that project. It requests the top 12 tracks over the last four weeks and caches them for an hour on warm function instances, with five minutes of CDN caching. The Sites backend remains independent.

Vercel uses the existing sensitive Production variables `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REFRESH_TOKEN`. The refresh token needs Spotify's `user-top-read` permission. Never put credentials in client code, Git, or build output. Preview deployments without these variables show the saved song list. An upstream outage uses cached top tracks when available, or the saved songs already on the page.

## Search and sharing

The canonical website is `https://jamesgui.com/`. Each main page has its own title, description, canonical URL, Open Graph tags, X card tags, and JSON-LD. The homepage identifies James with `ProfilePage`, `Person`, and `WebSite` data based on the visible bio and public profile links. Social previews use the supplied avatar.

`public/sitemap.xml` lists the five main pages and two project detail pages; `public/robots.txt` advertises it. Update the sitemap when adding or removing pages. Vercel permanently redirects the www hostname, `/index.html`, and the three legacy page URLs. API responses carry `X-Robots-Tag: noindex`.

`codexprophet.html` and `worldfork.html` provide linked project details, attribution, primary sources, and visible breadcrumbs. Their `TechArticle` and `BreadcrumbList` markup describes the visible content. Project claims follow the team’s Prophet Arena write-up, WorldFork site, Devpost submission, and linked OpenReview paper. Keep the Hacktech result scoped to the Listen Labs track.

Vercel builds use the native Image Optimization API for the 36px sidebar avatar, favicon, and touch icon. Only the local avatar path is allowed, with fixed widths and quality. The source image hash versions the optimization URL. The supplied original stays unchanged for social previews and Sites/local builds; the sidebar falls back to it if the image service fails.

Google Search Console can use `https://jamesgui.com/sitemap.xml` after ownership verification. Its reports show indexing and search queries; Vercel Analytics shows visits. Search Console verification and sitemap submission are separate from deploying these files.

## Palette and logo

The active palette uses cool white, navy, and cobalt blue, inspired by https://haeinjung.com/. Colors are centralized in the `:root` custom properties in `public/styles.css`.

The original warm palette is saved in `design/palettes/warm.css`. Its declarations can replace the active color declarations without reverting later content or layout changes; also restore the HTML `theme-color` to `#f7f4ee`. The original monogram favicon is saved beside it. The complete previous design is preserved in commit `f4bc86d2a62615f829b6251e2745bc9a2d24779c`.

`public/assets/james-avatar.png` is the supplied image, used unchanged for the sidebar home link, favicon, and touch icon.

## Connect Spotify

Open https://james-gui-personal.pluckywren39.chatgpt.site/spotify/setup while signed in as the Site owner. The setup page is owner-only.

1. Open the existing Spotify developer app used by jamesgui.com in the [Spotify dashboard](https://developer.spotify.com/dashboard).
2. Add this exact redirect URI to that app's settings and save, preserving the existing jamesgui.com callback:

   `https://james-gui-personal.pluckywren39.chatgpt.site/api/spotify/callback`

3. Return to the setup page, choose **connect spotify**, and authorize the account.

The app uses Authorization Code with PKCE and requests only `user-top-read`. It does not need a Spotify client secret. The existing public client ID is configured as `SPOTIFY_CLIENT_ID` in the hosted environment.

Once connected, `/api/spotify/top` requests Spotify's top 12 tracks with `time_range=short_term`. Spotify defines this as roughly the last four weeks, based on affinity, not an exact calendar-month count. The site labels this **last 4 weeks**, caches the result for one hour, and refreshes it on the next visit. The page shows saved recent listens until authorization succeeds, and labels cached results if Spotify is unavailable.

The connection belongs to the site owner, so all allowed visitors see the owner's tracks. Tokens stay encrypted in the `SPOTIFY_STORE` R2 binding. Only the owner can start or complete a Spotify connection. The server uses the platform's trusted identity headers, OAuth state bound to an HttpOnly cookie and the signed-in user, PKCE, and one-time authorization state. Expired/revoked refresh tokens prompt reconnection.

Hosted configuration names:

- `SPOTIFY_CLIENT_ID` — existing Spotify app's public client ID
- `SITE_ORIGIN` — canonical deployed origin
- `SITE_OWNER_EMAIL` — verified owner email from the Site access record
- `SPOTIFY_ENCRYPTION_KEY` — generated 256-bit secret stored only in the hosting environment; preserve it across deployments

Do not put tokens or keys in HTML, client JavaScript, Git, or the hosting manifest. `worker/index.js` contains the server routes; `scripts/build.mjs` bundles them with the front end. If the domain changes, update `SITE_ORIGIN` and the Spotify app's redirect URI together.

## Sources and verification

Content comes from jamesgui.com and its public data files and recent-listens endpoint, reviewed November 15, 2026. Codexprophet links to the [ProphetHacks write-up](https://www.prophetarena.co/research/prophethacks); its description, event date, and award wording follow that article. Spotify artwork is displayed as supplied and linked to its corresponding track.

Inter is self-hosted under the SIL Open Font License in `public/assets/OFL.txt`. Icons are original SVGs. Earlier `work.html`, `pins.html`, and `contact.html` URLs redirect to the current pages.

Authorization, token refresh, encryption, cache fallback, lowercase copy, internal navigation, and the production artifact have local automated checks. Layouts are visually checked using an isolated browser preview at desktop and phone widths. Both hosted Spotify connections returned 12 top tracks during verification on November 15, 2026.
