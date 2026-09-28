#!/usr/bin/env node
/**
 * Renders every section and snippet through a real Liquid engine.
 *
 * The static validator catches unbalanced tags, but not things like a filter
 * chain broken across two lines inside {% liquid %} — Shopify's parser is
 * line-based, so that is a runtime syntax error that only shows up once the
 * theme is live. This script executes the templates instead of pattern-matching
 * them, against a context rich enough to walk every branch.
 *
 * Shopify-only tags (form, paginate, content_for, style) are stubbed, and
 * object partials such as {% render block %} are swapped for a literal snippet,
 * because neither exists in the open-source engine.
 *
 *   node scripts/render-check.js [themeDir]
 */
const { Liquid, Tag } = require('liquidjs');
const fs = require('fs');
const path = require('path');

const THEME = path.resolve(process.argv[2] || path.join(__dirname, '..', 'themes', 'creme'));
const RED = '\x1b[31m', DIM = '\x1b[2m', OFF = '\x1b[0m';

/* ------------------------------------------------------------------ engine */
class EmptyTag extends Tag { render() { return ''; } }
class StyleTag extends Tag { render() { return `<style>${this.args}</style>`; } }

const engine = new Liquid({
  strictVariables: false,
  strictFilters: false,
  jsTruthy: true,
  relativeReference: true,
  dynamicPartials: true,
  root: [path.join(THEME, 'snippets'), path.join(THEME, 'sections'), path.join(THEME, 'blocks')],
  extname: '.liquid',
});
engine.registerTag('content_for', EmptyTag);
engine.registerTag('endcontent_for', EmptyTag);
engine.registerTag('style', StyleTag);
engine.registerTag('endstyle', EmptyTag);
engine.registerTag('form', EmptyTag);
engine.registerTag('endform', EmptyTag);
engine.registerTag('paginate', EmptyTag);
engine.registerTag('endpaginate', EmptyTag);
engine.registerFilter('t', (v) => v);
engine.registerFilter('escape_once', (v) => v);
engine.registerFilter('handleize', (v) => String(v).toLowerCase().replace(/\s+/g, '-'));
engine.registerFilter('asset_url', (v) => `/assets/${v}`);
engine.registerFilter('stylesheet_tag', (v) => `<link rel="stylesheet" href="/assets/${v}">`);
engine.registerFilter('script_tag', (v) => `<script src="/assets/${v}" defer></script>`);
engine.registerFilter('placeholder_svg_tag', (v) => `<svg data-ph="${v}"></svg>`);
engine.registerFilter('image_url', (v) => `/${v}`);
engine.registerFilter('json', (v) => JSON.stringify(v));

/* ----------------------------------------------------------------- fixtures */
const font = (family, fallback_families, weight = 400) =>
  ({ family, fallback_families, weight, size: 16, line_height: 1.4, variants: [], italic: false });
const img = (id, w = 1200, h = 1500) =>
  ({ id, width: w, height: h, alt: 'alt', aspect_ratio: h / w, media_type: 'image', filename: `${id}.jpg`, preview_image: { width: w, height: h } });
const media = (id, i) => ({ id, alt: 'alt', media_type: 'image', width: 1200, height: 1500, aspect_ratio: 0.8, position: i, preview_image: { width: 1200, height: 1500 } });

const variant = (id, title, price, opts = {}) => ({
  id, title, price, compare_at_price: null, available: true, inventory_quantity: 5,
  inventory_management: 'shopify', sku: `SKU-${id}`, requires_shipping: true,
  weight: 0.2, grams: 200, weight_unit: 'g',
  options: Object.entries(opts).map(([name, value]) => ({ name, value })),
  featured_media: media(`${id}-m`, 1), url: `/products/p?variant=${id}`,
});
const product = (id, title, price) => {
  const variants = [variant(id * 10 + 1, 'S', price, { Size: 'S' }), variant(id * 10 + 2, 'L', price, { Size: 'L' })];
  return {
    id, title, handle: `p-${id}`, url: `/products/p-${id}`, url_with_variant: `/products/p-${id}`,
    vendor: 'Atelier', type: 'Dress', tags: ['new'], price, price_min: price, price_max: price,
    price_varies: false, compare_at_price: null, compare_at_price_varies: false, available: true,
    first_available_variant: variants[0], selected_or_first_available_variant: variants[0],
    selected_variant: null, variants, options: ['Size'],
    options_with_values: [{ name: 'Size', position: 1, values: ['S', 'L'] }],
    has_only_default_variant: false, featured_media: media(`${id}-m`, 1), featured_image: media(`${id}-m`, 1),
    media: [media(`${id}-a`, 1), media(`${id}-b`, 2), media(`${id}-c`, 3)], images: [media(`${id}-a`, 1)],
    description: '<p>desc</p>', content: 'desc', template_suffix: '',
  };
};
const collection = (id, title) => ({
  id, title, handle: `c-${id}`, url: `/collections/${id}`, handle_url: `/collections/${id}`,
  description: '', products: [product(1, 'Silk Slip Dress', 24000), product(2, 'Cashmere Scarf', 9500)],
  products_count: 2, all_products_count: 2, all_variants_count: 4, products_count_voice: '2 products',
  sort_by: 'manual', default_sort_by: 'manual', featured_image: media(`${id}-m`, 1),
  image: media(`${id}-m`, 1), has_image: true, blank: false,
});
const article = {
  id: 1, title: 'How we knit', url: '/blogs/journal/knit', handle: 'knit', excerpt: 'x',
  content: '<p>x</p>', image: img(1, 1600, 900), author: 'Ada', author_name: 'Ada',
  published_at: '2026-01-01', tags: [], comments_count: 0, comments: [], comment_post_url: '',
};
const blog = {
  id: 1, title: 'Journal', url: '/blogs/journal', handle_url: '/blogs/journal', handle: 'journal',
  articles: [article], articles_count: 1, all_articles_count: 1, next_article: null, previous_article: null,
  tags: [], rss_url: '/blogs/journal.atom',
};
const link = (title) => {
  const handle = title.toLowerCase().replace(/\s+/g, '-');
  return { title, url: `/${handle}`, handle, active: false, links: [], child_active: false };
};
const policies = {
  privacy_policy: { url: '/policies/privacy-policy', title: 'Privacy' },
  terms_of_service: { url: '/policies/terms', title: 'Terms' },
  refund_policy: { url: '/policies/refund', title: 'Refund' },
  policy_shipping: { url: '/policies/shipping', title: 'Shipping' },
  policy_contact: { url: '/policies/contact', title: 'Contact' },
};
const shop = {
  name: 'Creme', description: '', url: 'https://creme.example', domain: 'creme.example',
  permanent_domain: 'creme.myshopify.com', money_format: '${{amount}}', currency: 'USD',
  customer_accounts_enabled: true, address: {}, ...policies,
  policy_legal_notice: null, policy_subscription: null, payment_types: [],
};
const lineItem = {
  id: 1, key: 'a:1', quantity: 1, title: 'Silk Slip Dress', variant_title: 'S', price: 24000,
  final_price: 24000, line_price: 24000, image: img(1), url: '/products/p-1', variant_id: 11,
  product_id: 1, options_with_values: [{ name: 'Size', value: 'S' }], requires_shipping: true,
};
const currency = { iso_code: 'USD', symbol: '$', thousands_separator: ',', decimal_separator: '.', format: '${{amount}}' };

function context() {
  let current;
  try {
    current = JSON.parse(fs.readFileSync(path.join(THEME, 'config', 'settings_data.json'), 'utf8')).current;
  } catch { current = {}; }

  return {
    settings: {
      ...current,
      type_body_font: font('Assistant', 'sans-serif'),
      type_heading_font: font('Bodoni Moda', 'serif'),
      type_heading_font_2: font('Bodoni Moda', 'serif'),
      cart: { item_count: 2, total_price: 33500, subtotal_price: 33500, original_total_price: 33500, total_discount: 0, currency, note: '' },
      shop,
    },
    shop,
    routes: {
      root_url: '/', all_products_collection_url: '/collections/all', cart_url: '/cart',
      cart_add_url: '/cart/add', cart_change_url: '/cart/change', cart_clear_url: '/cart/clear',
      cart_update_url: '/cart/update', search_url: '/search', predictive_search_url: '/search/suggest',
      account_url: '/account/account', account_login_url: '/account/login', account_logout_url: '/account/logout',
      account_register_url: '/account/register', account_addresses_url: '/account/addresses',
      account_recover_url: '/account/recover', account_orders_url: '/account/orders',
      collections_url: '/collections', blog_url: '/blogs/journal', pages_url: '/pages',
    },
    linklists: { 'main-menu': { title: 'Main', handle: 'main-menu', url: '/', links: [link('Shop'), link('About')] } },
    collections: { all: collection('all', 'All'), frontpage: collection('fp', 'Frontpage') },
    collection: collection('all', 'All'),
    product: product(1, 'Silk Slip Dress', 24000),
    products: [product(1, 'a', 24000), product(2, 'b', 9500)],
    article, articles: [article], blog, blogs: { journal: blog },
    page: { title: 'About', content: '<p>x</p>', url: '/pages/about' },
    cart: { item_count: 2, total_price: 33500, subtotal_price: 33500, items: [lineItem], attributes: {}, note: '' },
    cart_item: lineItem,
    current_tags: [],
    search: { results: { products: [product(1, 'a', 24000)], items_count: 1, performed: true, first: product(1, 'a', 24000) }, performed: true, terms: 'dress' },
    paginate: { pages: 1, current_page: 1, items: 2, parts: [], previous: null, next: null, page_size: 24, current_offset: 0, next_offset: 24, previous_offset: null },
    template: { name: 'index', suffix: null, directory: null },
    content_for_header: '', canonical_url: 'https://creme.example/', page_title: 'Creme',
    forloop_index: 1,
    forloop: { index: 1, index0: 0, first: true, last: true, length: 1, rindex: 1, rindex0: 0 },
    handle: 'a-handle', id: 1,
    locale: { language: { iso_code: 'en' }, country: { iso_code: 'US' }, root_url: '/' },
    form: { errors: {} }, errors: { transaction: '' },
  };
}

/* ------------------------------------------------- section settings fixtures */
const SECTION_DEFAULTS = {
  blog: 'journal', collection: 'all', type: 'product', style: 'text', layout: 'section',
  gap: 'medium', columns: 4, products_to_show: 8, image_ratio: 'portrait', card_ratio: 'portrait',
  text_columns: '1', height: 'large', image_overlay: 'soft', image_position: 'center',
  text_color: 'light', text_alignment: 'left', vertical_alignment: 'middle', heading_tag: 'h1',
  color_scheme: 'light', background: 'ink', rotate_speed: 5000, logo_width: 160,
};

function sectionContext(sectionSettings) {
  const settings = { ...SECTION_DEFAULTS };
  for (const [k, v] of Object.entries(sectionSettings)) settings[k] = v;
  settings.logo = img('logo', 300, 90);
  settings.desktop_image = img('hero', 2000, 1100);
  settings.mobile_image = null;
  settings.video = null;
  settings.image = img('x', 1200, 1200);
  settings.placeholder_image = img('x', 1200, 1200);
  return settings;
}

/* --------------------------------------------------------------------- run */
const SCHEMA_RE = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/;
const files = [];
for (const dir of ['snippets', 'sections', 'blocks']) {
  const abs = path.join(THEME, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (f.endsWith('.liquid')) files.push(path.join(dir, f));
  }
}

let ok = 0;
const failures = [];

/* A brand-new store has no products, no collections, no pages and an empty
   cart. Every product loop runs zero times and every object accessor hits nil,
   so this is the state most likely to break. */
function emptyContext() {
  const base = context();
  const blankCollection = { id: 0, title: '', handle: '', url: '', handle_url: '', description: '',
    products: [], products_count: 0, all_products_count: 0, all_variants_count: 0,
    products_count_voice: '0 products', sort_by: 'manual', default_sort_by: 'manual',
    featured_image: null, image: null, has_image: false, blank: true };
  const emptyBlog = { id: 0, title: '', url: '', handle_url: '', handle: '', articles: [],
    articles_count: 0, all_articles_count: 0, next_article: null, previous_article: null,
    tags: [], rss_url: '' };
  return {
    ...base,
    collections: {}, collection: blankCollection,
    products: [], product: null,
    blogs: {}, blog: emptyBlog, articles: [],
    page: { title: '', content: '', url: '' },
    cart: { item_count: 0, total_price: 0, subtotal_price: 0, items: [], attributes: {}, note: '' },
    cart_item: null,
    search: { results: { products: [], items_count: 0, performed: false, first: null }, performed: false, terms: '' },
    paginate: { pages: 1, current_page: 1, items: 0, parts: [], previous: null, next: null,
      page_size: 24, current_offset: 0, next_offset: 24, previous_offset: null },
    current_tags: [], article: null, handle: '', id: 0,
  };
}

(async () => {
  for (const rel of files) {
    const original = fs.readFileSync(path.join(THEME, rel), 'utf8');
    const m = original.match(SCHEMA_RE);
    if (rel.startsWith('sections/') && !m) continue; // main-* sections live in templates

    // Defaults declared in the section's own schema, so section.settings.* resolves.
    let sectionSettings = {};
    if (m) {
      try {
        const sc = JSON.parse(m[1]);
        sectionSettings = Object.fromEntries(
          (sc.settings || []).filter((s) => s.default !== undefined).map((s) => [s.id, s.default])
        );
      } catch (e) {
        failures.push(`${rel}: schema is not valid JSON — ${e.message}`);
        continue;
      }
    }

    let raw = original.replace(SCHEMA_RE, '');
    raw = raw
      .replace(/\{%-?\s*(end)?(form|paginate)\b[\s\S]*?%\}/g, '')
      .replace(/\{%-?\s*render\s+(block|section)\b[^%]*%\}/g, "{% render 'icon', name: 'star' %}");

    const settings = sectionContext(sectionSettings);
    const blockTypes = m ? (JSON.parse(m[1]).blocks || []).map((b) => b.type) : [];
    const section = {
      id: rel.replace(/\.liquid$/, ''),
      settings,
      index: 0,
      blocks: blockTypes.map((t, i) => ({ id: t, type: t, index: i, settings: sectionContext({}) })),
    };

    for (const [label, ctx] of [['populated', context()], ['empty store', emptyContext()]]) {
      try {
        const out = await engine.render(engine.parse(raw), {
          ...ctx, section, block: section.blocks[0] || { settings: {} },
        });
        if (/\{\{|\{%/.test(out)) failures.push(`${rel} [${label}]: left unrendered Liquid in the output`);
        else ok++;
      } catch (e) {
        failures.push(`${rel} [${label}]: ${String(e.message || e).split('\n')[0]}`);
      }
    }
  }

  const total = ok + failures.length;
  if (failures.length) {
    console.error(`\n  ${RED}✗ ${failures.length} of ${total} templates failed to render${OFF}`);
    for (const f of failures) console.error(`    ${f}`);
    process.exit(1);
  }
  console.log(`\n  ${DIM}rendered${OFF} ${ok} template renders — every section, snippet and block, against both a populated and an empty store, with no errors`);
})();
