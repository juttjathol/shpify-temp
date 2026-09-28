# Shopify theme library

A collection of Shopify themes. **Every theme builds to its own standalone `.zip`,
so you always hand a customer exactly one file to upload** — no repo, no folder
tree, no "please unzip this first".

```
dist/
  creme-v1.0.zip   <- hand this to the customer, that's the whole job
```

| | |
| --- | --- |
| Theme | **Creme** v1.0 |
| Author | Creme Studio |
| Audience | Fashion and lifestyle stores |
| Package size | ~116 KB zipped, 102 files (CSS + JS minified ~26%) |
| External dependencies | None — no CDN, no font host, no app required |

---

## How a customer installs a theme

1. Go to **Shopify Admin → Online Store → Themes**.
2. Click **Add theme → Upload theme**.
3. Drop in `creme-v1.0.zip` — the single file from `dist/`.
4. Wait for the upload to finish, then **Customize**.
5. **Publish** when ready. The currently live theme stays live until you do.

### First-run setup checklist

The theme works the moment it is published, but five things are worth setting
in **Customize → Theme settings** before you hand it to a customer:

| Setting | Why |
| --- | --- |
| **Brand → Logo** | Without it the header falls back to the store name in text, which looks fine but is not a logo. |
| **Header → Menu** | Points at `main-menu` by default; change it if the navigation is called something else. |
| **Social → profiles** | Ten URL fields. The footer social row stays hidden until at least one is filled in. |
| **Hero → image and copy** | The homepage hero renders a placeholder until an image or video is set. |
| **Footer → text, email, phone** | The footer block is empty until at least one is filled in. |

Two defaults worth knowing:

- **Fonts** resolve to Shopify's own library (Bodoni for display, Assistant for
  body), so there is no third-party font request on page load. Self-hosting is
  available behind `Typography → Use self-hosted fonts` and stays off by default
  so the theme never requests a file it does not ship.
- **Product cards** show a styled rating row, but live review data needs a
  review app. The styling is there; the numbers are not.

The archive is built so the theme folders sit at the *root* of the zip
(`assets/`, `blocks/`, `config/`, `layout/`, `locales/`, `sections/`,
`snippets/`, `templates/`). Shopify does not unwrap a containing folder, so a
zip that starts with `creme/layout/theme.liquid` is rejected — `build-themes.js`
exists specifically to get that right.

---

## Repository layout

```
themes/<theme-name>/     the theme source (this is what you edit)
scripts/                 build + validation tooling
dist/                    generated, one .zip per theme (git-ignored artefacts)
preview/                 static visual previews, not shipped in any archive
```

## Release checklist

Run before shipping a new version:

```bash
npm run check        # locales + validate + render + build
```

`check` fails the build on: a setting declared but never read, a `{% liquid %}`
statement wrapped across lines, a render-blocking `<script>`, an `<img>` that
bypasses `| image_url`, a hard-coded Shopify CDN URL, a missing translation, an
unresolved `{% render %}` or section reference, or a template that renders
without error in the Liquid engine.

Bump the version in `themes.json` to change the output filename.

```bash
npm run build         # validate every theme, then write dist/<theme>.zip
npm run validate      # static checks (add a path: `node scripts/validate-theme.js themes/creme`)
npm run render        # execute every section/snippet/block through a real Liquid engine
npm run locales       # regenerate locales/en.default.schema.json from the section schemas
npm run preview:sync  # re-render the preview's CSS from the live theme settings
npm run check         # locales + validate + render + build   ← run this before committing
```

Build a single theme: `node scripts/build-themes.js creme`
Skip minification while debugging: `node scripts/build-themes.js --no-minify`
Preview a preset: `npm run preview:sync -- "Creme — Deep Olive"`

---

## Adding a new theme

Each theme lives in its own folder and gets its own zip. Nothing is shared
between themes, so one can be renamed, deleted or reskinned without touching
the others.

```bash
mkdir -p themes/<new-name>/{assets,blocks,config,layout,locales,sections,snippets,templates}
# copy the structural scaffolding from an existing theme, then re-skin it
npm run build
```

`dist/` will then contain **both** `creme.zip` and `<new-name>.zip`, each
independently uploadable.

---

## What the build guarantees

`npm run build` refuses to write an archive for a theme that fails validation.
The validator checks the things Shopify rejects an upload for, plus the ones
that only surface as a broken storefront:

| Area | Checked |
| --- | --- |
| Structure | All eight required folders, `layout/theme.liquid`, `layout/password.liquid`, both `config/*.json`, both `locales/en.default*.json`, all nine core templates |
| JSON | Every `.json` parses; every `{% schema %}` is valid JSON with a name, and every setting has a type, a label, and sane range bounds |
| Liquid | `if`/`unless`/`for`/`case`/`form`/`paginate`/`schema` all balance; custom elements are not left unclosed |
| Translations | Every `'x' | t` string exists in `en.default.json`; every `t:` editor string exists in `en.default.schema.json`; other locales stay a subset of English |
| References | `{% render %}` snippets, `{% sections %}`, `asset_url` files and icon symbols all resolve |
| Templates | Section and block types exist; `order` and `block_order` cover exactly the sections and blocks that are present; `@theme` blocks resolve to files in `blocks/` |
| Settings | Every `settings.x` used in Liquid is declared in `config/settings_schema.json` **and** every declared setting is actually read by the theme — a setting the merchant can change but nothing consumes is treated as an error |
| Liquid syntax | `{% liquid %}` bodies are line-based, so a statement wrapped across lines (a filter chain broken with a leading `|`) is rejected — that is a runtime syntax error on a live store |
| Shopify limits | ≤ 25 sections per template, ≤ 50 block types per section |
| Blocks | `{% content_for 'blocks' %}` only where a `blocks` schema exists; presets reference block types the section accepts |

---

# Creme

The first theme in the library. A cream-toned editorial theme for fashion
labels — bold display typography, warm natural colours, and a deliberately
small JavaScript layer.

## Design

| Role | Colour | |
| --- | --- | --- |
| Background | `#fdf8f1` | warm cream, the canvas for everything |
| Soft background | `#f6ece0` | section banding, footer |
| Surface | `#ffffff` | cards, inputs, drawers |
| Ink | `#1f1a17` | near-black with a warm cast, never pure `#000` |
| Accent | `#c0563a` | terracotta clay — buttons, links, icons |
| Secondary | `#7c8b6a` | eucalyptus sage |
| Tertiary | `#b8455f` | dusty rose |
| Star | `#e0a33c` | butter |

Three extra presets ship in `settings_data.json` — *Warm Sand*, *Deep Olive*
and *Noir & Blush* — so a merchant can re-skin the whole store from the
settings panel without touching a line of Liquid.

### Theme settings

114 settings across 18 groups. Every one of them is read by the theme — the
validator fails the build if a setting is declared but never consumed.

| Group | What it controls |
| --- | --- |
| Brand | Logo upload, logo width, favicon |
| Colours — background | Page canvas, soft background, card/input surface, fills |
| Colours — text | Body, secondary, muted, border and strong-border colours |
| Colours — brand | Primary + hover + contrast, secondary, accent, sale, star |
| Colours — buttons | Normal and hover fill, text colour, and the default button style and hover behaviour (solid / outline / soft / ghost, and darken / invert / fill / none) |
| Colours — header & footer | Background and text colour for each, applied over the cream and dark schemes |
| Typography | Heading and body font, body size, heading scale, letter spacing, capitalisation, line height |
| Buttons | Font family, weight, size, letter spacing, capitalisation, border width, corner radius |
| Header | Sticky toggle, transparent-over-hero, menu and alignment, height, logo, search and account toggles, announcement bar on/off, background, rotation, dismissibility |
| Footer | 1–4 link columns, social icons, newsletter signup and policy links, colour override, brand text, email, phone, address |
| Hero | Image, mobile image or video, overlay colour and opacity, heading, subheading, button label and link, alignment, height, text colour |
| Product cards | Rating, vendor, image ratio, hover effect (second image / zoom / overlay / none), swatches, quick add, wishlist |
| Layout | Page width (narrow / normal / wide / custom), section padding, edge padding, section spacing, grid gap, card radius, border width |
| Cart, motion, SEO, social | Cart type, free-shipping bar, scroll reveals, social share image, and ten social profile URL fields |

`snippets/css-variables.liquid` is the single place where settings become CSS
custom properties, so the component stylesheets never read `settings.*`
directly. Legacy variable names (`--color-accent`, `--color-tertiary`) are kept
as aliases of the current ones so existing components keep working.

Typography defaults to Shopify's font library (Bodoni for display, Assistant
for body) so there is no third-party font request on page load.

## What's in it

- **Header** — sticky with shrink-on-scroll, mega-style dropdowns, predictive
  search, and a full mobile drawer menu with accordion sub-navigation.
- **Homepage** — hero, scrolling marquee, featured collection, image + text
  editorial split, collection grid, icon value row, testimonials, journal.
- **Product page** — media gallery with thumbnails and zoom, variant chips with
  per-option availability, quantity, AJAX add-to-cart, free-shipping meter,
  accordions and share links. Works without JavaScript via a normal form post.
- **Collection** — banner, sort, availability and price filters, active filter
  chips, pagination, empty states, and an `@app` slot for filter apps.
- **Cart** — slide-over drawer *and* a full cart page, either or both.
- **Blog, article, search, collections index, contact, 404, password page.**

## Architecture

```
layout/     theme.liquid, password.liquid
templates/  index, product, collection, cart, page, blog, article, search,
            list-collections, 404.liquid, password.liquid (+ page.* variants)
sections/   24 sections, incl. header-group.json / footer-group.json
blocks/     13 theme blocks (reusable across any section)
snippets/   23 snippets — product-card, pagination, icons, forms, meta-tags…
assets/     one base stylesheet + per-component CSS, 5 JS files
locales/    en.default.json, en.default.schema.json
config/     settings_schema.json, settings_data.json
```

Sections that accept reusable content declare `"blocks": [{ "type": "@theme" }]`
and render with `{% content_for 'blocks' %}`, so a *heading*, *testimonial*,
*image* or *button* block is defined once in `blocks/` and can be dropped into
any section. Sections that need bespoke behaviour (announcement bar, product
accordions, footer menus) use ordinary section-scoped blocks instead.

## Build output

`npm run build` writes `dist/creme-v1.0.zip`. The repository keeps readable,
commented CSS and JS; the archive ships minified, so a customer gets smaller
files over the wire while the source stays maintainable. `scripts/minify.js`
falls back to the original source if a minifier errors or produces something
larger, so a minification failure can never ship broken assets.

## Performance notes

- `base.css` is the only globally-blocking stylesheet; every component ships
  its own file, loaded by the section that needs it.
- `product-form.js` is only requested on pages that actually contain a product.
- No framework, no jQuery, no polyfills. Custom elements, ~30 KB total.
- `font-display: swap`, explicit `width`/`height` on every image, `decoding="async"`,
  and a placeholder `SVG` so nothing shifts while loading.
- `prefers-reduced-motion` disables every transition and animation.
- `assets/fonts/fonts.css` is **not** loaded unless a merchant opts into
  self-hosted fonts, so a default install never 404s on a missing font file.

## Known limitations

- Product ratings and wishlist buttons are styled and placed but not wired to a
  provider — connect a review/wishlist app and render it into the `@app` slot on
  the product template.
- Size guides and shipping estimates come from the app ecosystem, not the theme.
