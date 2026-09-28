#!/usr/bin/env node
/**
 * generate-schema-locale.js
 * ---------------------------------------------------------------------------
 * Theme editor strings live in locales/<lang>.default.schema.json and are
 * referenced from section/block schemas as "t:sections.foo.settings.bar.label".
 *
 * This script walks every `{% schema %}` block in sections/ and blocks/, pulls
 * out each `t:` reference, derives a readable English label from the key path
 * plus the schema's own `default` value, and writes the .schema.json file.
 *
 * It never overwrites strings a human already wrote unless --force is passed,
 * so existing translations survive.
 *
 *   node scripts/generate-schema-locale.js [themeDir] [--force] [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const THEME = positional[0] || path.join(__dirname, '..', 'themes', 'creme');
const OUT = path.join(THEME, 'locales', 'en.default.schema.json');
const FORCE = flags.has('--force');
const DRY = flags.has('--dry-run');

/* --- deep helpers -------------------------------------------------------- */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function setDeep(obj, dottedKey, value) {
  if (value === undefined) return;
  const parts = dottedKey.split('.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isObj(node[parts[i]])) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

function getDeep(obj, dottedKey) {
  return dottedKey.split('.').reduce((acc, k) => (isObj(acc) ? acc[k] : undefined), obj);
}

/* --- humanise a key path ------------------------------------------------- */
function humanise(leaf) {
  return leaf
    .replace(/\.label$/, '')
    .replace(/^_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/* --- humanise a key path ------------------------------------------------- */
const NOISE_PREFIXES = ['card_', 'color_', 'motion_', 'type_', 'social_', 'use_', 'enable_', 'theme_'];

function humanise(leaf) {
  return String(leaf)
    .replace(/\.label$/, '')
    .replace(/^_+/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/** "card_show_vendor" -> "Show vendor" */
function humaniseId(id) {
  let out = id;
  for (const prefix of NOISE_PREFIXES) {
    if (out.startsWith(prefix) && out.length > prefix.length) {
      out = out.slice(prefix.length);
      break;
    }
  }
  return humanise(out);
}

/** Curated help text. Anything not listed here is simply omitted. */
/** Section/block names that read better without the `main-` prefix. */
const NAME = {
  'sections.main-product': 'Product',
  'sections.main-collection': 'Collection',
  'sections.main-cart': 'Cart',
  'sections.main-page': 'Page',
  'sections.main-blog': 'Blog',
  'sections.main-article': 'Article',
  'sections.main-search': 'Search',
  'sections.main-list-collections': 'Collection list',
  'settings_schema.seo': 'SEO',
  'settings_schema.product_cards': 'Product cards',
  'blocks.product': 'Product',
  'blocks.newsletter': 'Newsletter form',
};

/* Hand-written editor labels. Anything not listed falls back to the setting id,
   which reads fine for most settings but not for compound ones. */
const LABEL = {
  'settings_schema.brand.settings.logo.label': 'Logo',
  'settings_schema.brand.settings.logo_width.label': 'Logo width',
  'settings_schema.colors_background.settings.color_background_soft.label': 'Background (soft)',
  'settings_schema.colors_background.settings.color_surface.label': 'Cards & inputs',
  'settings_schema.colors_background.settings.color_surface_alt.label': 'Placeholders & fills',
  'settings_schema.colors_text.settings.color_text_soft.label': 'Secondary text',
  'settings_schema.colors_text.settings.color_text_muted.label': 'Muted text',
  'settings_schema.colors_text.settings.color_border.label': 'Borders',
  'settings_schema.colors_text.settings.color_border_strong.label': 'Borders (strong)',
  'settings_schema.colors_brand.settings.color_primary_hover.label': 'Primary (hover)',
  'settings_schema.colors_brand.settings.color_primary_contrast.label': 'Text on primary',
  'settings_schema.colors_brand.settings.color_secondary.label': 'Secondary',
  'settings_schema.colors_brand.settings.color_accent.label': 'Accent',
  'settings_schema.colors_brand.settings.color_sale.label': 'Sale & badges',
  'settings_schema.colors_brand.settings.color_star.label': 'Stars',
  'settings_schema.colors_buttons.settings.color_button.label': 'Button background',
  'settings_schema.colors_buttons.settings.color_button_hover.label': 'Button background (hover)',
  'settings_schema.colors_buttons.settings.color_button_text.label': 'Button text',
  'settings_schema.colors_buttons.settings.color_button_outline_text.label': 'Button text (outline)',
  'settings_schema.colors_buttons.settings.button_style.label': 'Button style',
  'settings_schema.colors_buttons.settings.button_hover_style.label': 'Button hover',
  'settings_schema.colors_chrome.settings.color_header_bg.label': 'Header background',
  'settings_schema.colors_chrome.settings.color_header_text.label': 'Header text',
  'settings_schema.colors_chrome.settings.color_footer_bg.label': 'Footer background',
  'settings_schema.colors_chrome.settings.color_footer_text.label': 'Footer text',
  'settings_schema.typography.settings.type_heading_font.label': 'Heading font',
  'settings_schema.typography.settings.type_heading_size.label': 'Heading size',
  'settings_schema.typography.settings.type_body_font.label': 'Body font',
  'settings_schema.typography.settings.type_body_size.label': 'Body size',
  'settings_schema.typography.settings.heading_letter_spacing.label': 'Heading letter spacing',
  'settings_schema.typography.settings.heading_text_transform.label': 'Heading capitalisation',
  'settings_schema.typography.settings.body_line_height.label': 'Body line height',
  'settings_schema.button_type.settings.button_font_weight.label': 'Button font weight',
  'settings_schema.button_type.settings.button_font_size.label': 'Button font size',
  'settings_schema.button_type.settings.button_letter_spacing.label': 'Button letter spacing',
  'settings_schema.button_type.settings.button_text_transform.label': 'Button capitalisation',
  'settings_schema.button_type.settings.button_border_width.label': 'Button border width',
  'settings_schema.button_type.settings.radius_button.label': 'Button corner radius',
  'settings_schema.header.settings.header_sticky.label': 'Sticky header',
  'settings_schema.header.settings.header_transparent.label': 'Transparent over hero',
  'settings_schema.header.settings.header_height.label': 'Header height',
  'settings_schema.header.settings.header_menu_alignment.label': 'Menu alignment',
  'settings_schema.header.settings.header_menu.label': 'Menu',
  'settings_schema.header.settings.header_show_search.label': 'Show search',
  'settings_schema.header.settings.header_show_account.label': 'Show account link',
  'settings_schema.header.settings.show_announcement_bar.label': 'Show announcement bar',
  'settings_schema.header.settings.announcement_background.label': 'Announcement background',
  'settings_schema.header.settings.announcement_rotate.label': 'Rotate messages',
  'settings_schema.header.settings.announcement_dismissible.label': 'Allow dismiss',
  'settings_schema.footer.settings.footer_columns.label': 'Link columns',
  'settings_schema.footer.settings.footer_show_social.label': 'Show social icons',
  'settings_schema.footer.settings.footer_show_newsletter.label': 'Show newsletter signup',
  'settings_schema.footer.settings.footer_show_policy_links.label': 'Show policy links',
  'settings_schema.footer.settings.footer_use_color_override.label': 'Use the footer colours above',
  'settings_schema.footer.settings.footer_text.label': 'Footer text',
  'settings_schema.footer.settings.footer_email.label': 'Email',
  'settings_schema.footer.settings.footer_phone.label': 'Phone',
  'settings_schema.footer.settings.footer_address.label': 'Address',
  'settings_schema.hero.settings.hero_image.label': 'Background image',
  'settings_schema.hero.settings.hero_mobile_image.label': 'Mobile image',
  'settings_schema.hero.settings.hero_video.label': 'Background video',
  'settings_schema.hero.settings.hero_overlay_color.label': 'Overlay colour',
  'settings_schema.hero.settings.hero_overlay_opacity.label': 'Overlay opacity',
  'settings_schema.hero.settings.hero_heading.label': 'Heading',
  'settings_schema.hero.settings.hero_subheading.label': 'Subheading',
  'settings_schema.hero.settings.hero_button_label.label': 'Button label',
  'settings_schema.hero.settings.hero_button_link.label': 'Button link',
  'settings_schema.hero.settings.hero_text_alignment.label': 'Text alignment',
  'settings_schema.hero.settings.hero_height.label': 'Hero height',
  'settings_schema.hero.settings.hero_text_color.label': 'Text colour',
  'settings_schema.product_cards.settings.card_show_rating.label': 'Show rating',
  'settings_schema.product_cards.settings.card_show_vendor.label': 'Show vendor name',
  'settings_schema.product_cards.settings.card_image_ratio.label': 'Image ratio',
  'settings_schema.product_cards.settings.card_hover_effect.label': 'Hover effect',
  'settings_schema.product_cards.settings.card_show_swatches.label': 'Show colour swatches',
  'settings_schema.product_cards.settings.card_show_quick_add.label': 'Show quick add',
  'settings_schema.product_cards.settings.card_quick_add_mode.label': 'Quick add behaviour',
  'settings_schema.product_cards.settings.card_show_wishlist.label': 'Show wishlist button',
  'settings_schema.layout.settings.page_width.label': 'Page width',
  'settings_schema.layout.settings.page_width_custom.label': 'Custom page width',
  'settings_schema.layout.settings.section_padding.label': 'Section padding',
  'settings_schema.layout.settings.container_padding.label': 'Edge padding',
  'settings_schema.layout.settings.section_spacing.label': 'Section spacing',
  'settings_schema.layout.settings.grid_gap.label': 'Grid gap',
  'settings_schema.layout.settings.card_min_width.label': 'Minimum card width',
  'settings_schema.layout.settings.radius_card.label': 'Card corner radius',
  'settings_schema.layout.settings.border_width.label': 'Border width',
  'settings_schema.motion.settings.enable_scroll_animations.label': 'Scroll reveal animations',
  'settings_schema.motion.settings.motion_easing.label': 'Animation easing',
  'settings_schema.motion.settings.motion_duration.label': 'Animation duration',
  'settings_schema.motion.settings.show_page_transition.label': 'Page transition',
  'settings_schema.cart.settings.cart_type.label': 'Cart type',
  'settings_schema.cart.settings.show_free_shipping_bar.label': 'Free shipping progress bar',
  'settings_schema.cart.settings.free_shipping_threshold.label': 'Free shipping threshold',
  'settings_schema.seo.settings.social_share_image.label': 'Social share image',
  'settings_schema.seo.settings.robots_txt.label': 'Robots meta tag',
  'settings_schema.social.settings.social_url.info': 'Full URL, including https://',
  'settings_schema.social.settings.social_whatsapp.info': 'Number only, e.g. 15551234567.',
  'settings_schema.colors_background.settings.intro.content': 'The canvas every other colour sits on.',
  'settings_schema.colors_chrome.settings.intro.content': 'Overrides the cream and dark schemes on the header and footer.',
  'settings_schema.hero.settings.intro.content': 'These are the defaults for every hero on the store. Each Hero section can override them.',
  'sections.hero-banner.settings.inherits.content': 'Anything left blank here falls back to Theme settings → Hero.',
  'sections.hero-banner.settings.copy.header': 'Copy',
  'sections.hero-banner.settings.desktop_image.info': 'Overrides the store-wide hero image.',
  'sections.hero-banner.settings.eyebrow.label': 'Eyebrow',
  'sections.hero-banner.settings.heading.label': 'Heading',
  'sections.hero-banner.settings.heading_tag.label': 'Heading tag',
  'sections.hero-banner.settings.subheading.label': 'Subheading',
  'sections.hero-banner.settings.button_label.label': 'Button label',
  'sections.hero-banner.settings.button_link.label': 'Button link',
  'sections.hero-banner.settings.button_label_2.label': 'Second button label',
  'sections.hero-banner.settings.button_link_2.label': 'Second button link',
  'sections.header.settings.per_page_header.content': 'Everything else comes from Theme settings → Header.',
  'sections.header.settings.logo.label': 'Logo override',
  'sections.header.settings.logo_width.label': 'Logo width override',
  'sections.announcement-bar.settings.dismissible.info': 'Also requires “Allow dismiss” in Theme settings → Header.',
};

const INFO = {
  'settings_schema.brand.settings.logo.info': 'Leave empty to show your store name instead.',
  'settings_schema.brand.settings.favicon.info': 'Shown in the browser tab. A 32 x 32 png works best.',
  'settings_schema.colors_background.settings.color_background.info': 'The base page colour. Creme ships with a warm cream default.',
  'settings_schema.colors_brand.settings.color_primary.info': 'Primary action colour - buttons, links, sale prices, icons.',
  'settings_schema.colors_brand.settings.color_primary_contrast.info': 'Text colour that sits legibly on top of your primary colour.',
  'settings_schema.colors_buttons.settings.color_button.info': 'Default fill for every solid button in the theme.',
  'settings_schema.typography.settings.type_heading_font.info': 'Displayed on the storefront and in the theme editor preview.',
  'settings_schema.typography.settings.use_self_hosted_fonts.info': 'Only load assets/fonts/fonts.css. Add your .woff2 files there first, otherwise leave this off.',
  'settings_schema.typography.settings.external_font_host.info': 'Optional, e.g. use.fontsource.org. Speeds up font loading with a preconnect hint.',
  'settings_schema.product_cards.settings.card_show_rating.info': 'Shows a static review row. Connect a review app to display live ratings.',
  'settings_schema.social.settings.twitter_handle.info': 'With or without the @.',
  'settings_schema.seo.settings.social_share_image.info': 'Used when a page has no image of its own. Recommended 1200 x 630 px.',
  'settings_schema.seo.settings.robots_txt.info': 'A comma-separated list, e.g. noindex, nofollow. Leave blank for the default.',
  'settings_schema.header.settings.header_transparent.info': 'Makes the header sit over the hero image with no background. Best used on a page whose first section is full-bleed.',
  'settings_schema.layout.settings.page_width_custom.info': 'Only used when Page width is set to Custom.',
  'settings_schema.hero.settings.hero_mobile_image.info': 'A separate crop for phones keeps the composition intact on small screens.',
  'settings_schema.hero.settings.hero_video.info': 'A video here replaces the hero image. Use a short, quiet loop.',
  'sections.header.settings.logo.info': 'Overrides the store-wide logo in Theme settings.',
  'sections.hero-banner.settings.id.info': 'Optional anchor, e.g. "hero" - lets you link straight to this section.',
  'sections.product-grid.settings.collection.info': 'Used only when you have not added any product blocks. Added blocks always win.',

  'settings_schema.brand.settings.favicon.info': 'Shown in the browser tab. A 32 × 32 png works best.',
  'settings_schema.colors.settings.color_background.info': 'The base page colour. Creme ships with a warm cream default.',
  'settings_schema.accent.settings.color_accent.info': 'Primary action colour — buttons, links, sale prices, icons.',
  'settings_schema.accent.settings.color_accent_contrast.info': 'Text colour that sits legibly on top of your accent colour.',
  'settings_schema.typography.settings.type_heading_font.info': 'Displayed on the storefront and in the theme editor preview.',
  'settings_schema.typography.settings.use_self_hosted_fonts.info': 'Only load assets/fonts/fonts.css. Add your .woff2 files to assets/fonts/ first, otherwise this stays off.',
  'settings_schema.typography.settings.external_font_host.info': 'Optional, e.g. use.fontsource.org. Speeds up font loading with a preconnect hint.',
  'settings_schema.product_cards.settings.card_show_rating.info': 'Shows a static review row. Connect a review app to display live ratings.',
  'settings_schema.social.settings.social_url.info': 'Full URL, including https://',
  'settings_schema.social.settings.twitter_handle.info': 'With or without the @.',
  'settings_schema.seo.settings.social_share_image.info': 'Used when a page has no image of its own. Recommended 1200 × 630 px.',
  'settings_schema.seo.settings.robots_txt.info': 'A comma-separated list, e.g. noindex, nofollow. Leave blank for the default.',
  'sections.header.settings.logo.info': 'If empty, your store name is shown instead.',
  'sections.header.settings.transparent.info': 'Best for a hero image placed directly underneath the header.',
  'sections.hero-banner.settings.mobile_image.info': 'A separate crop for phones keeps the composition intact on small screens.',
  'sections.hero-banner.settings.video.info': 'Uploading a video here replaces the image. Use a short, quiet loop.',
  'sections.hero-banner.settings.id.info': 'Optional anchor, e.g. "hero" — lets you link straight to this section.',
  'sections.footer.settings.show_policy_links.label': 'Show policy links',
  'sections.product-grid.settings.collection.info': 'Used only when you have not added any product blocks. Added blocks always win.',
  'sections.product-grid.settings.show_vendor.label': 'Show vendor',
  'sections.main-collection.settings.show_banner.label': 'Show collection header',
};

function deriveValue(ref, node) {
  const key = ref.startsWith('t:') ? ref.slice(2) : ref;
  const parts = key.split('.');

  const nameKey = parts[parts.length - 1] === 'name' ? parts.slice(0, -1).join('.') : null;
  if (nameKey && NAME[nameKey]) return NAME[nameKey];

  // `.info` variants read better as curated prose than as a bare label. They
  // are looked up in INFO first, then LABEL — checking only INFO silently
  // dropped anything filed under the wrong map, and an undefined value is
  // dropped by JSON.stringify, leaving the editor with a missing translation.
  if (parts[parts.length - 1] === 'info') {
    const base = parts.slice(0, -1).join('.');
    if (INFO[key] !== undefined) return INFO[key];
    if (INFO[base + '.info'] !== undefined) return INFO[base + '.info'];
    if (LABEL[key] !== undefined) return LABEL[key];
    if (LABEL[base + '.info'] !== undefined) return LABEL[base + '.info'];
    return humanise(base.split('.').pop()) + '.';
  }

  if (LABEL[key] !== undefined) return LABEL[key];

  // Anything under a `settings` node is named after its setting id.
  if (parts.indexOf('settings') !== -1) {
    const at = parts.indexOf('settings');
    if (parts[at + 1]) return humaniseId(parts[at + 1]);
  }

  // Section / block / preset names are named after their file key or block
  // type, e.g. "t:sections.footer.blocks.menu.name" -> "Menu",
  //      "t:blocks.product-card.name"             -> "Product card".
  if (parts[parts.length - 1] === 'name') {
    const named = parts
      .slice(0, -1)
      .reverse()
      .find((seg) => seg !== 'presets' && !/^\d+$/.test(seg) && seg !== 'blocks');
    if (named) return humanise(named);
  }

  return humanise(parts[parts.length - 1]);
}

/* --- scan schemas -------------------------------------------------------- */
const SCHEMA_RE = /{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/g;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.liquid')) out.push(full);
  }
  return out;
}

const configSchemaPath = path.join(THEME, 'config', 'settings_schema.json');
const files = [...walk(path.join(THEME, 'sections')), ...walk(path.join(THEME, 'blocks'))];

const generated = {};
let refCount = 0;
const schemaErrors = [];

// config/settings_schema.json uses the same "t:settings_schema.*" convention
if (fs.existsSync(configSchemaPath)) {
  let configSchema;
  try {
    configSchema = JSON.parse(fs.readFileSync(configSchemaPath, 'utf8'));
  } catch (err) {
    schemaErrors.push('config/settings_schema.json: invalid JSON — ' + err.message);
  }
  if (configSchema) {
    const emit = (node) => {
      if (Array.isArray(node)) return node.forEach(emit);
      if (!isObj(node)) return;
      for (const field of ['name', 'label', 'info', 'content']) {
        const val = node[field];
        if (typeof val === 'string' && val.startsWith('t:')) {
          refCount++;
          setDeep(generated, val.slice(2), deriveValue(val, node));
        }
      }
      Object.values(node).forEach(emit);
    };
    emit(configSchema);
  }
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(THEME, file);

  for (const match of source.matchAll(SCHEMA_RE)) {
    let schema;
    try {
      schema = JSON.parse(match[1]);
    } catch (err) {
      schemaErrors.push(`${rel}: invalid JSON in {% schema %} — ${err.message}`);
      continue;
    }

    // A theme block / section is identified by its bare file name.
    const fileKey = path.basename(file, '.liquid');

    const collect = (node) => {
      if (Array.isArray(node)) return node.forEach(collect);
      if (!isObj(node)) return;

      for (const field of ['name', 'label', 'info', 'content']) {
        const val = node[field];
        if (typeof val === 'string' && val.startsWith('t:')) {
          refCount++;
          setDeep(generated, val.slice(2), deriveValue(val, node));
        }
      }
      for (const child of Object.values(node)) collect(child);
    };

    // Settings + presets are addressed as t:sections.<fileKey>... / t:blocks.<fileKey>...
    for (const [scopeName, scope] of [['sections', schema], ['blocks', schema]]) {
      const base = `${scopeName}.${fileKey}`;

      if (typeof scope.name === 'string' && scope.name.startsWith('t:')) {
        setDeep(generated, scope.name.slice(2), deriveValue(scope.name, scope));
      }

      for (const setting of scope.settings || []) {
        for (const field of ['label', 'info']) {
          if (typeof setting[field] === 'string' && setting[field].startsWith('t:')) {
            setDeep(generated, setting[field].slice(2), deriveValue(setting[field], setting));
          }
        }
        if (typeof setting.content === 'string' && setting.content.startsWith('t:')) {
          setDeep(generated, setting.content.slice(2), humanise(setting.content.split('.').pop()));
        }
      }

      for (const block of scope.blocks || []) {
        if (typeof block.name === 'string' && block.name.startsWith('t:')) {
          setDeep(generated, block.name.slice(2), deriveValue(block.name, block));
        }
        for (const setting of block.settings || []) {
          for (const field of ['label', 'info']) {
            if (typeof setting[field] === 'string' && setting[field].startsWith('t:')) {
              setDeep(generated, setting[field].slice(2), deriveValue(setting[field], setting));
            }
          }
        }
      }

      for (const preset of scope.presets || []) {
        if (typeof preset.name === 'string' && preset.name.startsWith('t:')) {
          setDeep(generated, preset.name.slice(2), deriveValue(preset.name, preset));
        }
      }
    }

    collect(schema);
  }
}

/* --- merge with any existing file ---------------------------------------- */
let existing = {};
if (fs.existsSync(OUT)) {
  try {
    existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    console.warn('! existing en.default.schema.json is not valid JSON — regenerating from scratch');
  }
}

/*
  Keys this run generated always win; keys found only in the previous file are
  kept, so a hand-added string survives. The previous order had it backwards
  (existing won unless --force), which meant fixing a label or an `info` string
  in the maps above silently had no effect — the stale value just persisted.
*/
function merge(base, add) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(add)) {
    if (isObj(v) && isObj(out[k])) out[k] = merge(out[k], v);
    else out[k] = v;
  }
  return out;
}

const finalLocale = merge(existing, generated);

if (DRY) {
  console.log(JSON.stringify(finalLocale, null, 2));
  process.exit(0);
}

fs.writeFileSync(OUT, JSON.stringify(finalLocale, null, 2) + '\n');
console.log(`✓ ${path.relative(process.cwd(), OUT)} — ${refCount} t: references across ${files.length} files`);

if (schemaErrors.length) {
  console.error('\n✗ schema JSON errors:');
  schemaErrors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
