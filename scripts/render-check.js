#!/usr/bin/env node
/* Renders every section, snippet and block in a theme with liquidjs.
 *
 * The validator reads the theme statically. This executes it, which is the
 * only way to catch a Liquid error that would make a page fail on a real
 * store. Each unit renders twice: once against a populated store, and once
 * against an empty one, because a section that assumes products or collections
 * exist renders fine until a client's store is still empty.
 *
 * Forms, pagination and {% sections %} are stripped or stubbed rather than
 * emulated - liquidjs cannot raise a Shopify form the way a storefront does.
 *
 * Usage: node scripts/render-check.js [theme-dir ...]
 */
const fs = require('fs');
const path = require('path');
const { Liquid, Tag } = require('liquidjs');

const ROOT = path.resolve(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'themes.json'), 'utf8'));

const SCHEMA_RE = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/;
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

class Silent extends Tag {
  render() { return ''; }
}

/* A store with products, collections, cart and menus. */
function fullContext() {
  const product = (id, title) => ({
    id, title, handle: title.toLowerCase().replace(/\W+/g, '-'),
    url: `/products/${title.toLowerCase().replace(/\W+/g, '-')}`,
    vendor: 'Studio', type: 'T-Shirt', price: 8900, price_min: 8900, price_max: 8900,
    price_varies: false, compare_at_price: 0, available: true,
    featured_image: { width: 1200, height: 1600, alt: title },
    images: [], media: [], options_with_values: [],
    has_only_default_variant: true, selected_or_first_available_variant: { id },
    variants: [{ id, title: 'Default', available: true, option1: 'Default', options: ['Default'] }],
    tags: '', options: ['Title'],
  });

  return {
    settings: {},
    shop: {
      name: 'Studio', description: 'A small studio', url: 'https://studio.myshopify.com',
      domain: 'studio.myshopify.com', permanent_domain: 'studio.myshopify.com',
      money_format: '${{amount}}', currency: 'USD', customer_accounts_enabled: true,
      privacy_policy: { url: '/policies/privacy-policy', title: 'Privacy' },
      terms_of_service: { url: '/policies/terms-of-service', title: 'Terms' },
      refund_policy: { url: '/policies/refund-policy', title: 'Refund' },
      address: { street: '1 Mill Lane', city: 'Leeds', country: 'United Kingdom' },
    },
    routes: {
      root_url: '/', all_products_collection_url: '/collections/all', cart_url: '/cart',
      cart_add_url: '/cart/add', search_url: '/search', predictive_search_url: '/search/suggest',
      account_url: '/account', account_login_url: '/account/login', account_logout_url: '/account/logout',
      account_register_url: '/account/register', account_addresses_url: '/account/addresses',
      account_orders_url: '/account/orders', collections_url: '/collections', blog_url: '/blogs/journal',
      pages_url: '/pages', article_comment_url: '/blogs/journal/comments',
    },
    linklists: {
      'main-menu': { title: 'Main', handle: 'main-menu', url: '/', links: [
        { title: 'Shop', url: '/collections/all', active: true, links: [] },
        { title: 'About', url: '/pages/about', active: false, links: [] },
      ] },
      footer: { title: 'Footer', handle: 'footer', url: '/', links: [
        { title: 'Contact', url: '/pages/contact', active: false, links: [] },
      ] },
    },
    collections: {
      all: { id: 1, title: 'All', handle: 'all', url: '/collections/all', products_count: 2, products: [product(1, 'Linen Shirt'), product(2, 'Wool Coat')] },
    },
    collection: { id: 1, title: 'All', handle: 'all', url: '/collections/all', description: 'Everything', products_count: 2, products: [product(1, 'Linen Shirt'), product(2, 'Wool Coat')], sort_by: 'manual', sort_options: [{ value: 'manual', name: 'Featured' }] },
    product: product(1, 'Linen Shirt'),
    products: [product(1, 'Linen Shirt'), product(2, 'Wool Coat')],
    cart: { item_count: 2, total_price: 17800, items: [
      { id: 1, quantity: 1, title: 'Linen Shirt', url: '/products/linen-shirt', url_to_remove: '/cart/change', final_line_price: 8900,
        product: { title: 'Linen Shirt', has_only_default_variant: true }, variant: { title: 'Default' }, image: { width: 800, height: 1000, alt: 'Linen Shirt' } },
    ] },
    blog: { title: 'Journal', articles: [
      { id: 1, title: 'On cloth', url: '/blogs/journal/on-cloth', excerpt: 'A note on materials.', published_at: '2026-01-15', author: 'Studio', image: { width: 1200, height: 800, alt: 'Cloth' }, content: '<p>Body</p>', comments: [{ author: 'A', content: 'Nice' }], comments_count: 1 },
    ] },
    article: { id: 1, title: 'On cloth', url: '/blogs/journal/on-cloth', excerpt: 'A note on materials.', published_at: '2026-01-15', author: 'Studio', image: { width: 1200, height: 800, alt: 'Cloth' }, content: '<p>Body</p>', comments: [{ author: 'A', content: 'Nice' }], comments_count: 1, comment_post_successfully: false },
    page: { id: 1, title: 'About', url: '/pages/about', content: '<p>We make considered pieces.</p>' },
    search: { performed: true, terms: 'linen', results_count: 1, results: [{ title: 'Linen Shirt', url: '/products/linen-shirt', object_type: 'Product' }] },
    template: { name: 'index', suffix: null, directory: null },
    page_title: 'Studio', page_description: 'A small studio',
    current_page: 1, current_tags: [], canonical_url: 'https://studio.myshopify.com/',
    handle: 'index', id: 1,
    content_for_header: '', content_for_layout: '', content_for_stylesheet: '',
    locale: { language: { iso_code: 'en' }, country: { iso_code: 'US' }, root_url: '/' },
    forloop: { index: 1, index0: 0, first: true, last: true, length: 1, rindex: 1, rindex0: 0, parentloop: false },
    cart_types: [],
    request: { page_type: 'index', path: '/', design_mode: false, locale: { iso_code: 'en' } },
    shop_locale: 'en',
    image_size: 'medium',
    predictive_search: { performed: false, results: [], resources: { results: [] } },
    form: { errors: {}, posted: false },
    paginate: { by: 24, current_page: 1, items: 2, pages: 1, previous: null, next: null, parts: [{ title: '1', is_link: false }] },
  };
}

/* A brand new store: no products, no collections, no menus, empty cart. */
function emptyContext() {
  const ctx = fullContext();
  const blankCollection = { id: 0, title: '', handle: '', url: '/collections/all', description: '', products_count: 0, products: [], sort_by: 'manual', sort_options: [] };
  return {
    ...ctx,
    collections: {},
    collection: blankCollection,
    products: [],
    product: null,
    cart: { item_count: 0, total_price: 0, items: [] },
    blog: { title: 'Journal', articles: [] },
    page: { id: 0, title: '', url: '/pages/x', content: '' },
    search: { performed: false, terms: '', results_count: 0, results: [] },
    paginate: { by: 24, current_page: 1, items: 0, pages: 0, previous: null, next: null, parts: [] },
    settings: {},
  };
}

function makeEngine(T) {
  const engine = new Liquid({
    strictVariables: false,
    strictFilters: false,
    jsTruthy: true,
    root: [path.join(T, 'snippets'), path.join(T, 'sections'), path.join(T, 'blocks')],
    extname: '.liquid',
  });
  // Tags that need a Shopify storefront to evaluate.
  for (const t of ['content_for', 'endcontent_for', 'sections', 'form', 'endform', 'paginate', 'endpaginate', 'style', 'endstyle']) {
    engine.registerTag(t, Silent);
  }
  const identity = (v) => v;
  const filters = {
    t: identity, escape: (v) => String(v == null ? '' : v), escape_once: (v) => String(v == null ? '' : v),
    handleize: (v) => String(v).toLowerCase().replace(/\W+/g, '-'),
    asset_url: (v) => `/assets/${v}`,
    stylesheet_tag: (v) => `<link href="/assets/${v}">`,
    script_tag: (v) => `<script src="/assets/${v}" defer></script>`,
    image_url: (v) => (typeof v === 'string' ? v : '/image'),
    image_tag: (v) => '<img>',
    placeholder_svg_tag: () => '<svg class="placeholder-svg"></svg>',
    payment_type_svg_tag: () => '<svg class="payment"></svg>',
    media_tag: () => '<div class="media"></div>',
    video_tag: () => '<video></video>',
    external_video_tag: () => '<iframe></iframe>',
    font_face: () => '', font_modify: () => ({}),
    money: (v) => `$${(v / 100).toFixed(2)}`,
    money_with_currency: (v) => `$${(v / 100).toFixed(2)}`,
    json: (v) => JSON.stringify(v),
    date: (v) => String(v),
    within: () => false,
    default_pagination: () => '',
    strip_html: (v) => String(v).replace(/<[^>]*>/g, ''),
    newline_to_br: identity,
    weight_with_unit: (v) => `${v}kg`,
  };
  for (const [name, fn] of Object.entries(filters)) engine.registerFilter(name, fn);
  return engine;
}

async function runTheme(dir) {
  const T = path.join(THEMES_DIR, dir);
  const rel = (p) => path.relative(ROOT, p);
  const engine = makeEngine(T);
  const failures = [];
  let count = 0;

  const units = [];
  for (const sub of ['snippets', 'blocks', 'sections']) {
    const d = path.join(T, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.liquid')) continue;
      const file = path.join(d, f);
      let src = fs.readFileSync(file, 'utf8');
      const schemaMatch = src.match(SCHEMA_RE);
      let schema = null;
      if (schemaMatch) {
        src = src.replace(SCHEMA_RE, '');
        try { schema = JSON.parse(schemaMatch[1]); } catch { schema = null; }
      }

      // Blocks need a block context; sections need a section context.
      if (sub === 'blocks') {
        if (!schema) continue;
        for (const b of schema.settings || []) {
          units.push({ file, label: `${f} [${b.id}]`, src, settings: b.default, as: 'block' });
        }
      } else {
        units.push({ file, label: f, src, settings: null, as: sub === 'sections' ? 'section' : 'snippet' });
      }
    }
  }

  const contexts = [['store', fullContext()], ['empty', emptyContext()]];

  for (const unit of units) {
    for (const [cname, ctx] of contexts) {
      let data = ctx;
      if (unit.as === 'section') {
        const fileSchema = readSchema(unit.file);
        const defaults = Object.fromEntries(
          (fileSchema?.settings || []).filter((s) => s.default !== undefined).map((s) => [s.id, s.default])
        );
        data = {
          ...ctx,
          section: { id: 'sec-1', settings: defaults, index: 0, blocks: [] },
          block: { settings: {} },
        };
      } else if (unit.as === 'block') {
        data = { ...ctx, block: { id: 'b1', type: 'block', index: 0, settings: unit.settings } };
      }

      try {
        const out = await engine.render(engine.parse(unit.src), data);
        count++;
        if (/\{\{|\{%/.test(out)) {
          failures.push(`${rel(unit.file)} [${unit.label}/${cname}]: left unrendered Liquid in the output`);
        }
      } catch (e) {
        failures.push(`${rel(unit.file)} [${unit.label}/${cname}]: ${String(e.message || e).split('\n')[0]}`);
      }
    }
  }

  /* The homepage, composed the way a visitor receives it. */
  let homepage = null;
  const indexPath = path.join(T, 'templates', 'index.json');
  if (fs.existsSync(indexPath)) {
    try {
      const tpl = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      const ctx = emptyContext();
      let body = '';
      for (const sid of tpl.order || []) {
        const spec = tpl.sections[sid];
        if (!spec) { failures.push(`templates/index.json: order lists "${sid}" with no such section`); continue; }
        const file = path.join(T, 'sections', `${spec.type}.liquid`);
        if (!fs.existsSync(file)) { failures.push(`templates/index.json: ${sid} -> sections/${spec.type}.liquid is missing`); continue; }
        const raw = fs.readFileSync(file, 'utf8').replace(SCHEMA_RE, '');
        const fileSchema = readSchema(file);
        const defaults = Object.fromEntries((fileSchema?.settings || []).filter((s) => s.default !== undefined).map((s) => [s.id, s.default]));
        const section = {
          id: sid,
          settings: { ...defaults, ...(spec.settings || {}) },
          index: 0,
          blocks: Object.entries(spec.blocks || {}).map(([id, b], i) => ({ id, type: b.type, index: i, settings: b.settings || {} })),
        };
        body += await engine.render(engine.parse(raw), { ...ctx, section, block: { settings: {} } });
      }
      const layoutFile = path.join(T, 'layout', 'theme.liquid');
      const layout = fs.readFileSync(layoutFile, 'utf8');
      const page = await engine.render(engine.parse(layout), { ...ctx, content_for_layout: body });
      if (/\{\{|\{%/.test(page)) failures.push('homepage: layout produced unresolved Liquid');
      for (const a of new Set([...page.matchAll(/href="\/assets\/([^"]+)"/g)].map((m) => m[1]))) {
        if (!fs.existsSync(path.join(T, 'assets', a))) failures.push(`homepage: requests assets/${a}, which is not in the theme`);
      }
      homepage = page.length;
    } catch (e) {
      failures.push(`homepage: ${String(e.message || e).split('\n')[0]}`);
    }
  }

  return { count, failures, homepage };
}

function readSchema(file) {
  const m = fs.readFileSync(file, 'utf8').match(SCHEMA_RE);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

(async () => {
  const requested = process.argv.slice(2);
  const list = requested.length ? manifest.themes.filter((t) => requested.includes(t.dir)) : manifest.themes;

  let total = 0;
  const all = [];
  for (const t of list) {
    const { count, failures, homepage } = await runTheme(t.dir);
    total += count;
    all.push(...failures);
    const label = t.name || t.dir;
    console.log(`  ${failures.length ? 'FAIL' : 'OK  '} ${label} - ${count} renders${homepage ? `, homepage ${(homepage / 1024).toFixed(1)} KB` : ''}`);
  }

  if (all.length) {
    console.log(`\n${all.length} problem${all.length === 1 ? '' : 's'}:`);
    for (const f of all) console.log(`  x ${f}`);
    process.exit(1);
  }
  console.log(`\n  ${DIM}rendered${OFF} ${total} times across every section, snippet and block, against both a populated and an empty store`);
})();