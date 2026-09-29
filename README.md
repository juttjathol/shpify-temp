# Shopify Theme Factory

A production-ready Online Store 2.0 base theme, plus the tooling to hand **each
client their own single ZIP** without one client's work ever touching another's.

- `themes/base/` — the theme itself
- `themes.json` — the client register; one entry per client
- `dist/` — one `<theme-name>-v<version>.zip` per client
- `scripts/` — validate, render-test, build, audit

---

## Quick start

```bash
npm install
npm run check          # generate config, validate, render-test, build
npm run audit          # audit the built ZIP, as the client will upload it
```

`npm run check` does all four in order and is what to run before every delivery.

---

## Delivering to a client

1. **Create their theme** — copies the base and registers it:

   ```bash
   node scripts/new-theme.js aurora "Aurora Studio"
   ```

2. **Make it theirs** — edit `themes/aurora/config/settings_schema.json` and
   change the colour, font and layout defaults. The `Home page hero` and
   `Product cards` groups are the quickest way to make it recognisably theirs.

   Then re-derive the shipped values:

   ```bash
   npm run settings
   ```

3. **Check and build just their theme:**

   ```bash
   npm run validate && npm run render
   npm run build aurora
   node scripts/audit-upload.js aurora
   ```

4. **Send `dist/aurora-v1.0.zip`.**

Other clients' ZIPs are never rebuilt, so an existing client's archive stays
byte-identical. Rebuilding one theme never touches another.

| Command | What it does |
| --- | --- |
| `npm run settings` | Regenerates `settings_data.json` from the schema |
| `npm run validate` | Static checks across every theme |
| `npm run render` | Renders every section/snippet/block, populated **and** empty store |
| `npm run build [dir]` | Builds one ZIP per theme (or just one) |
| `npm run audit [dir]` | Checks the built ZIP, not the source |
| `npm run check` | settings → validate → render → build |

---

## Uploading to Shopify

**Online Store → Themes → Add theme → Upload zip file → `dist/<name>-v<version>.zip`**

The archive must contain `assets/`, `config/`, `layout/`, `locales/`,
`sections/`, `snippets/`, `templates/` **at its root**. Not inside a folder
named after the theme — that is the single most common reason an upload
succeeds and every page 404s. `npm run audit` fails the build if a wrapper
folder ever appears.

To hand-zip without the tooling, compress the **contents** of the theme
directory, not the directory itself:

```bash
# correct - files land at the archive root
cd themes/base && zip -r -X ../../dist/base-v1.0.zip .

# wrong - everything ends up inside a base/ folder
zip -r base-v1.0.zip base
```

---

## What a client can change without touching code

Everything below is in the theme editor, under **Theme settings** or per section.

| Group | Controls |
| --- | --- |
| Brand | Logo, logo width, favicon, social share image |
| Typography | Heading and body fonts, base sizes, line height, letter case |
| Colors | Page, card, muted, text, secondary text, borders, primary, accent, sale, stars |
| Layout | Max page width, side padding, section spacing, grid gap, corner radii |
| Announcement bar | Text, link, background, dismissible |
| Header | Menu, sticky, height, logo position, search/account/cart |
| Home page hero | Default heading, text, button, image, mobile image, height |
| Product cards | Vendor, price, rating, swatches, quick add, image shape |
| Footer | Menu, about text, social, payment icons, policy links |
| Social | Instagram, Facebook, TikTok, X, YouTube, Pinterest, LinkedIn |
| Cart | Drawer or page, free shipping bar and threshold |
| Motion & features | Scroll animations, quick view, recently viewed, sticky add to cart, hover zoom |

Sections are added, removed and reordered from the theme editor. Every section
except the `main-*` page templates carries a `presets` block so it appears in
the **Add section** list.

---

## What makes it stand out

**Motion** (`assets/motion.js`) — scroll reveals with stagger, clip wipes, image
parallax, number counters, magnetic buttons, a seamless marquee, and a hero that
enters word by word. Everything runs off `IntersectionObserver` and a single
rAF loop that only writes transforms. **It only ever adds a class or sets a
custom property**, so with JavaScript off the page still renders — it simply
appears at once. All of it collapses under `prefers-reduced-motion`.

**Storefront features** the premium fashion themes charge extra for:

| Feature | Section / file |
| --- | --- |
| Lookbook rows with parallax | `sections/lookbook.liquid` |
| Shoppable image hotspots | `sections/image-hotspots.liquid` |
| Scrolling marquee | `sections/marquee.liquid` |
| Testimonials, press logos, newsletter | `sections/testimonials.liquid`, `press.liquid`, `newsletter.liquid` |
| Quick view drawer | `header.liquid` + `motion.js` |
| Predictive search | header search drawer + `motion.js` |
| Mega menu (parent links with children) | `sections/header.liquid` |
| Product gallery with thumbnails | `sections/main-product.liquid` |
| Size guide table, merchant-editable | collapsible block on the product template |
| Sticky add to cart (mobile) | `sections/main-product.liquid` |
| Recently viewed | `motion.js` |

## Structure

```
themes/base/
├── assets/
│   ├── base.css              design tokens, layout, components, motion
│   ├── global.js             drawers, announcement, quantity, variants
│   └── motion.js             reveals, parallax, quick view, predictive search
├── blocks/                   reusable theme blocks (heading, text)
├── config/
│   ├── settings_schema.json  everything a client can change
│   └── settings_data.json    generated - do not hand-edit
├── layout/
│   ├── theme.liquid
│   └── password.liquid
├── locales/en.default.json
├── sections/                 header, footer, hero, collection list, 404, and the main_* page templates
├── snippets/                 icons, product card, price, pagination, css variables, meta tags
└── templates/                index, collection, product, page, cart, blog, article, search, 404, password
```

One stylesheet and one script, both loaded once and deferred. Splitting CSS
per component means a section that forgets to load its own stylesheet renders
unstyled, and nothing warns you.

---

## Why the checks exist

Shopify fails quietly. A malformed `settings_data.json`, a settings key that
was never declared, a `{% render %}` pointing at a snippet that is not in the
ZIP — each is dropped or ignored with no error anywhere. The symptom is a page
that looks right except for one unstyled region, or an empty settings panel,
or a homepage 404.

The three failure modes that cost the most time on a previous theme, each now
checked on every run:

- **`config/settings_data.json` must be `{ current: { settings, sections } }`.**
  Setting values placed directly under `current` are ignored and the file is
  discarded. It is generated from the schema, so it cannot drift.
- **A dangling id in a section `order`.** If `order` names a section that
  `sections` does not define, Shopify answers the storefront with a bare 404.
- **`templates/index.json` must exist.** Without it the homepage is a 404 no
  matter how healthy everything else is.

`npm run render` also renders every section against an **empty** store, because
a section that assumes products exist renders fine until a client's store is
still empty.
