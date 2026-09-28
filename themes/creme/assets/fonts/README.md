# assets/fonts

Creme ships with **no binary font files** and makes **zero font requests it
doesn't need**.

| Situation | What happens |
| --- | --- |
| Default (out of the box) | Headings and body use Shopify's font library via `font_picker`. Those fonts are served from Shopify's CDN, subset, cached at the edge, and cost the theme nothing. |
| Merchant picks a Google Font | Shopify serves it from its own CDN — still no third-party request. |
| Merchant wants a licensed self-hosted font | They add the `.woff2` files here and flip on the setting. Only then is `assets/fonts/fonts.css` loaded. |

## Enabling self-hosted fonts

1. Add the `.woff2` files to this folder.
2. **Theme editor → Theme settings → Typography → Use self-hosted fonts → ON**.
3. If your family names differ from `Creme Serif` / `Creme Sans`, update
   `assets/fonts/fonts.css` (or set the font family names in the same settings panel).

The theme never loads `assets/fonts/fonts.css` unless the setting is on, so a store that
skips this step has no 404s and no render-blocking font request.
