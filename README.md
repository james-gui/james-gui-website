# James Gui

A small, static personal website inspired by the quiet layout of elsacai.com, with content adapted from jamesgui.com.

## Edit

All site files are in `dist/`:

- `index.html` — introduction and current interests
- `work.html` — projects and experience
- `pins.html` — food and music favorites
- `contact.html` — email and social links
- `styles.css` — colors, typography, and responsive layout
- `site.js` — optional city switcher, local clock, and copy-email button

No build step or dependencies are required. To preview:

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173. Publish `dist/` to any static host. The included `.openai/hosting.json` identifies the private Sites deployment.

The site works without JavaScript. Inter is self-hosted under the SIL Open Font License in `dist/assets/OFL.txt`. Icons are original SVGs; no imagery or source code from the reference site is reused.

Content source: https://jamesgui.com/ and its public `data.js` / `data-extras.js`, reviewed November 15, 2026. Contact links and project destinations are retained from that site. Browser visual QA was unavailable in this environment.
