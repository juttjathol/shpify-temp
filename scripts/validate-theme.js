#!/usr/bin/env node
/* Theme validator.
 *
 * Everything here exists because Shopify fails silently. A malformed
 * settings_data.json, a settings key that is not declared, a {% render %} that
 * points at a snippet that is not in the ZIP - each of those is dropped or
 * ignored by Shopify with no error anywhere, and the symptom is a page that
 * looks fine except for one unstyled region, or a theme whose settings panel is
 * empty. These checks make the failures loud here instead.
 *
 * Usage: node scripts/validate-theme.js [theme-dir ...]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'themes.json'), 'utf8'));

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const SCHEMA_RE = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/;
const stripTags = (s) => s.replace(/\{[%{][\s\S]*?[%}]\}/g, '');
const stripComments = (s) => s
  .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
  .replace(/\{%-?\s*comment\s*-?%\}.*$/gm, '');

function validateTheme(dir) {
  const T = path.join(THEMES_DIR, dir);
  const rel = (p) => path.relative(ROOT, p);
  const before = errors.length;

  const files = walk(T);
  const liquid = files.filter((f) => f.endsWith('.liquid'));
  const jsonFiles = files.filter((f) => f.endsWith('.json'));
  const read = (f) => fs.readFileSync(f, 'utf8');

  /* ------------------------------------------------------------------
     1. Required structure
     ------------------------------------------------------------------ */
  const ALLOWED = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
  const tops = new Set(files.map((f) => path.relative(T, f).split(path.sep)[0]));
  for (const d of ALLOWED) if (!tops.has(d)) err(dir, `missing the ${d}/ directory`);
  for (const t of tops) if (!ALLOWED.includes(t)) err(dir, `unexpected top-level folder: ${t}/`);

  for (const required of [
    'layout/theme.liquid',
    'config/settings_schema.json',
    'config/settings_data.json',
    'locales/en.default.json',
  ]) {
    if (!files.includes(path.join(T, required))) err(dir, `missing ${required}`);
  }

  const templates = files.filter((f) => f.startsWith(path.join(T, 'templates')));
  const hasIndex = templates.some((f) => /index\.(json|liquid)$/.test(f));
  if (!hasIndex) {
    // The single most important file in the theme. Without it the homepage is
    // a 404 no matter how healthy everything else is.
    err(dir, 'missing templates/index.json - Shopify returns a bare 404 for the homepage without it');
  }

  /* ------------------------------------------------------------------
     2. Every JSON file parses
     ------------------------------------------------------------------ */
  const parsed = new Map();
  for (const f of jsonFiles) {
    try {
      parsed.set(f, JSON.parse(read(f)));
    } catch (e) {
      err(rel(f), `invalid JSON - ${e.message}`);
    }
  }

  const schemaPath = path.join(T, 'config', 'settings_schema.json');
  const schema = parsed.get(schemaPath) || [];
  const dataPath = path.join(T, 'config', 'settings_data.json');
  const data = parsed.get(dataPath) || {};

  /* ------------------------------------------------------------------
     3. settings_schema.json
     ------------------------------------------------------------------ */
  const declared = new Set();
  for (const [gi, group] of schema.entries()) {
    const gname = group.name || `group ${gi}`;
    for (const [si, setting] of (group.settings || []).entries()) {
      const where = `settings_schema "${gname}" setting ${si}`;
      if (['header', 'paragraph'].includes(setting.type)) {
        if (setting.id) err(where, `"${setting.type}" is display-only and must not declare an id`);
        if (!setting.content) err(where, `"${setting.type}" needs content`);
        continue;
      }
      if (!setting.id) { err(where, 'no "id" - the editor silently drops the setting'); continue; }
      if (declared.has(setting.id)) err(where, `duplicate id "${setting.id}"`);
      declared.add(setting.id);
      if (!setting.type) err(where, `setting "${setting.id}" has no type`);
      if (!setting.label && !setting.info) warn(where, `setting "${setting.id}" has no label`);
      if (setting.type === 'range') {
        if (typeof setting.min !== 'number' || typeof setting.max !== 'number') {
          err(where, `range "${setting.id}" needs numeric min and max`);
        } else if (setting.min > setting.max) {
          err(where, `range "${setting.id}" has min greater than max`);
        }
      }
      if (setting.type === 'select' && !(setting.options || []).length) {
        err(where, `select "${setting.id}" has no options`);
      }
    }
  }

  /* ------------------------------------------------------------------
     4. settings_data.json shape.
        Shopify reads current.settings and nothing else. A flat "current" is
        ignored, and the file is dropped without a word.
     ------------------------------------------------------------------ */
  if (data && typeof data === 'object') {
    if (!data.current || typeof data.current !== 'object') {
      err('settings_data.json', 'missing "current"');
    } else {
      for (const key of Object.keys(data.current)) {
        if (!['settings', 'sections'].includes(key)) {
          err('settings_data.json', `current.${key} - "current" may only hold "settings" and "sections"`);
        }
      }
      if (!data.current.settings || typeof data.current.settings !== 'object') {
        err('settings_data.json', 'current.settings is missing - Shopify stores setting values here and nowhere else');
      }
    }
    for (const [name, preset] of Object.entries(data.presets || {})) {
      if (!preset || typeof preset !== 'object' || typeof preset.settings !== 'object') {
        err('settings_data.json', `presets.${name} must be an object with a "settings" key`);
      }
    }
    // Values must match the type the schema declared, or the editor shows
    // defaults and nobody can tell why.
    const byId = new Map();
    for (const g of schema) for (const s of g.settings || []) if (s.id) byId.set(s.id, s);
    for (const [id, value] of Object.entries((data.current && data.current.settings) || {})) {
      const s = byId.get(id);
      if (!s) { err('settings_data.json', `current.settings.${id} is not declared in settings_schema`); continue; }
      const bad =
        (s.type === 'color' && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(String(value))) ? 'not a hex colour' :
        (s.type === 'range' && typeof value !== 'number') ? `must be a number, got ${typeof value}` :
        (s.type === 'checkbox' && typeof value !== 'boolean') ? `must be a boolean, got ${typeof value}` :
        (s.type === 'select' && !(s.options || []).some((o) => o.value === value)) ? `not one of the declared options` :
        (s.type === 'font_picker' && !(value && typeof value === 'object' && value.settings)) ? 'font_picker must be an object with a "settings" key' :
        null;
      if (bad) err('settings_data.json', `current.settings.${id} (${s.type}): ${bad}`);
    }
  }

  /* ------------------------------------------------------------------
     5. Section groups: an id in "order" with nothing in "sections" makes
        Shopify answer the storefront with a bare 404.
     ------------------------------------------------------------------ */
  const checkOrder = (where, node) => {
    if (!node || !Array.isArray(node.order)) return;
    const ids = Object.keys(node.sections || {});
    for (const id of node.order) {
      if (!ids.includes(id)) err(where, `order lists "${id}" but sections {} has no such section - Shopify will 404`);
    }
    for (const id of ids) {
      if (!node.order.includes(id)) warn(where, `section "${id}" is defined but missing from order - it will never render`);
    }
  };
  for (const f of files.filter((x) => x.startsWith(path.join(T, 'sections')) && x.endsWith('.json'))) {
    const node = parsed.get(f);
    checkOrder(rel(f), node);
    for (const [id, s] of Object.entries((node && node.sections) || {})) {
      if (!fs.existsSync(path.join(T, 'sections', `${s.type}.liquid`))) {
        err(rel(f), `"${id}" points at sections/${s.type}.liquid, which does not exist`);
      }
      checkOrder(`${rel(f)} -> ${id}`, s);
    }
  }
  // The layout's {% sections %} tags must each have a group file, and the
  // instance in settings_data must line up with that group.
  const layout = path.join(T, 'layout', 'theme.liquid');
  if (fs.existsSync(layout)) {
    for (const m of read(layout).matchAll(/\{%-?\s*sections\s+'([\w-]+)'/g)) {
      const g = m[1];
      if (!fs.existsSync(path.join(T, 'sections', `${g}.json`))) {
        err('layout/theme.liquid', `renders {% sections '${g}' %} but sections/${g}.json does not exist`);
      }
      const inst = ((data.current || {}).sections || {})[g];
      if (!inst) err('settings_data.json', `no instance for the "${g}" section group the layout renders`);
      else checkOrder(`settings_data.json -> ${g}`, inst);
    }
  }

  /* ------------------------------------------------------------------
     6. Section schemas
     ------------------------------------------------------------------ */
  const sectionTypes = new Set(
    files.filter((f) => f.startsWith(path.join(T, 'sections')) && f.endsWith('.liquid'))
      .map((f) => path.basename(f, '.liquid'))
  );
  const blockTypes = new Set(
    files.filter((f) => f.startsWith(path.join(T, 'blocks')) && f.endsWith('.liquid'))
      .map((f) => path.basename(f, '.liquid'))
  );

  for (const f of liquid.filter((x) => x.startsWith(path.join(T, 'sections')))) {
    const src = read(f);
    const m = src.match(SCHEMA_RE);
    if (!m) continue; // main_* sections may omit a schema
    let sc;
    try {
      sc = JSON.parse(m[1]);
    } catch (e) {
      err(rel(f), `{% schema %} is not valid JSON - ${e.message}`);
      continue;
    }
    if (!sc.name) err(rel(f), '{% schema %} has no "name"');
    if (sc.settings && !Array.isArray(sc.settings)) err(rel(f), '"settings" must be an array');
    if (sc.blocks && !Array.isArray(sc.blocks)) err(rel(f), '"blocks" must be an array');

    // A section the merchant can add needs presets, or it is invisible in the
    // "Add section" list.
    const isMain = path.basename(f, '.liquid').startsWith('main-');
    if (!isMain && !(sc.presets || []).length) {
      err(rel(f), 'has no "presets", so it will not appear in the Add section list');
    }
    for (const b of sc.blocks || []) {
      if (b.type && b.type !== '@app' && !blockTypes.has(b.type) && !sectionTypes.has(b.type)) {
        // Blocks defined inline are fine; only flag ones nothing can resolve.
        if (!b.settings) err(rel(f), `block "${b.type}" has no settings`);
      }
    }
  }

  /* ------------------------------------------------------------------
     7. Template -> section references, and every order/block_order
     ------------------------------------------------------------------ */
  for (const f of files.filter((x) => x.startsWith(path.join(T, 'templates')) && x.endsWith('.json'))) {
    const tpl = parsed.get(f);
    if (!tpl) continue;
    const secs = tpl.sections || {};
    const order = tpl.order || [];
    for (const id of order) {
      if (!secs[id]) err(rel(f), `order lists "${id}" but sections has no such section`);
    }
    for (const id of Object.keys(secs)) {
      if (!order.includes(id)) err(rel(f), `section "${id}" is defined but missing from order - it will never render`);
    }
    for (const [id, s] of Object.entries(secs)) {
      if (s.type !== '@app' && !sectionTypes.has(s.type)) {
        err(rel(f), `${id} -> sections/${s.type}.liquid does not exist`);
      }
      const blocks = s.blocks || {};
      const bOrder = s.block_order || [];
      for (const b of bOrder) {
        if (!blocks[b]) err(rel(f), `${id}: block_order lists "${b}" but blocks has no such block`);
      }
      for (const b of Object.keys(blocks)) {
        if (bOrder.length && !bOrder.includes(b)) err(rel(f), `${id}: block "${b}" is missing from block_order`);
      }
      // Every block type must resolve to an inline schema block, a /blocks file,
      // or a section.
      const sc = (() => {
        const sf = path.join(T, 'sections', `${s.type}.liquid`);
        if (!fs.existsSync(sf)) return null;
        const mm = read(sf).match(SCHEMA_RE);
        if (!mm) return null;
        try { return JSON.parse(mm[1]); } catch { return null; }
      })();
      const declaredBlocks = new Set(((sc && sc.blocks) || []).map((b) => b.type));
      const isThemeBlock = (sc && sc.blocks || []).some((b) => b.type === '@theme');
      for (const [bid, b] of Object.entries(blocks)) {
        if (isThemeBlock) continue;
        if (!declaredBlocks.has(b.type) && !blockTypes.has(b.type) && !sectionTypes.has(b.type)) {
          err(rel(f), `${id}: block "${bid}" has type "${b.type}", which nothing in the theme declares`);
        }
      }
    }
  }

  /* ------------------------------------------------------------------
     8. Snippet references
     ------------------------------------------------------------------ */
  const snippetNames = new Set(
    files.filter((f) => f.startsWith(path.join(T, 'snippets')) && f.endsWith('.liquid'))
      .map((f) => path.basename(f, '.liquid'))
  );
  const usedSnippets = new Set();
  for (const f of liquid) {
    const src = read(f);
    if (/\{%-?\s*include\b/.test(src)) {
      err(rel(f), 'uses {% include %}, which Online Store 2.0 removed - use {% render %}');
    }
    for (const m of src.matchAll(/\{%-?\s*render\s+'([\w-]+)'/g)) {
      usedSnippets.add(m[1]);
      if (!snippetNames.has(m[1])) err(rel(f), `renders snippet "${m[1]}", which is not in snippets/`);
    }
    for (const m of src.matchAll(/\{%-?\s*section\s+'([\w-]+)'/g)) {
      if (!fs.existsSync(path.join(T, 'sections', `${m[1]}.liquid`))) {
        err(rel(f), `references section "${m[1]}", which is not in sections/`);
      }
    }
  }
  for (const s of snippetNames) {
    if (!usedSnippets.has(s)) warn(dir, `snippets/${s}.liquid is never rendered - dead weight in the ZIP`);
  }

  /* ------------------------------------------------------------------
     9. settings.* used in Liquid must be declared
     ------------------------------------------------------------------ */
  for (const f of liquid) {
    const src = stripComments(read(f));
    for (const m of src.matchAll(/(?<![.\w])settings\.([a-z0-9_]+)/g)) {
      if (!declared.has(m[1])) {
        err(rel(f), `uses settings.${m[1]}, which is not declared in settings_schema.json`);
      }
    }
  }

  /* ------------------------------------------------------------------
     10. Storefront performance invariants
     ------------------------------------------------------------------ */
  for (const f of liquid) {
    const src = stripComments(read(f));
    for (const m of src.matchAll(/<script\b([^>]*)>/g)) {
      const attrs = m[1] || '';
      if (!/src=/.test(attrs)) {
        err(rel(f), 'inline <script> is render-blocking - move it to assets/ and load it with defer');
      } else if (!/\bdefer\b/.test(attrs)) {
        err(rel(f), `render-blocking <script> - add defer (${attrs.trim().slice(0, 50)})`);
      }
    }
    // Images must go through Shopify's CDN filters to be resized and cached.
    for (const m of src.matchAll(/<img\b[\s\S]{0,500}?>/g)) {
      if (/\|\s*image_url/.test(m[0]) || /placeholder_svg/.test(m[0])) continue;
      if (/\bsrc="\{\{/.test(m[0]) || /\bsrcset="\{\{/.test(m[0])) continue;
      err(rel(f), 'an <img> does not use | image_url - Shopify cannot resize or cache it');
    }
    // Referenced assets must exist.
    for (const m of src.matchAll(/['"]([\w./-]+\.(?:css|js))['"]\s*\|\s*asset_url/g)) {
      if (!fs.existsSync(path.join(T, 'assets', m[1]))) {
        err(rel(f), `references assets/${m[1]}, which is not in the theme`);
      }
    }
  }

  /* ------------------------------------------------------------------
     11. Liquid tag balance
     ------------------------------------------------------------------ */
  for (const f of liquid) {
    const src = stripComments(read(f));
    for (const tag of ['if', 'for', 'case', 'capture', 'form', 'paginate', 'raw', 'tablerow', 'comment']) {
      const open = (src.match(new RegExp(`\\{%-?\\s*${tag}\\b`, 'g')) || []).length;
      const close = (src.match(new RegExp(`\\{%-?\\s*end${tag}\\b`, 'g')) || []).length;
      if (open !== close) err(rel(f), `unbalanced {% ${tag} %}: ${open} open, ${close} end`);
    }
  }

  /* ------------------------------------------------------------------
     12. Every CSS custom property that is read is also assigned somewhere.
     A var() with no definition resolves to nothing at computed-value time,
     so the declaration using it is dropped and that region renders unstyled
     - with no error anywhere to point at it.
     ------------------------------------------------------------------ */
  {
    const blob = files
      .filter((f) => /\.(css|liquid|js)$/.test(f))
      .map((f) => stripComments(read(f)))
      .join('\n');
    const readVars = new Set([...blob.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
    const definedVars = new Set([...blob.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    for (const v of readVars) {
      if (!definedVars.has(v)) {
        err(dir, `${v} is read with var() but never assigned - it would render unstyled`);
      }
    }
  }


  /* ------------------------------------------------------------------
     12. Locale keys used with | t must exist
     ------------------------------------------------------------------ */
  const locale = parsed.get(path.join(T, 'locales', 'en.default.json')) || {};
  const at = (obj, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const localeKeys = new Set();
  (function collect(obj, prefix = '') {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') {
        // A pluralization object is addressed by its parent key, so register it.
        if ('one' in v || 'other' in v) localeKeys.add(key);
        collect(v, key);
      } else localeKeys.add(key);
    }
  })(locale);

  for (const f of [...liquid, ...files.filter((x) => x.startsWith(path.join(T, 'config')) && x.endsWith('.json'))]) {
    const src = read(f);
    for (const m of src.matchAll(/'([a-z0-9_.]+)'\s*\|\s*t\b/g)) {
      if (!localeKeys.has(m[1])) err(rel(f), `translation key "${m[1]}" is not in locales/en.default.json`);
    }
  }

  return errors.length - before;
}

/* -------------------------------------------------------------------- */

const requested = process.argv.slice(2);
const list = requested.length
  ? manifest.themes.filter((t) => requested.includes(t.dir))
  : manifest.themes;

console.log(`Validating ${list.length} theme${list.length === 1 ? '' : 's'}`);
for (const t of list) {
  const n = validateTheme(t.dir);
  const label = t.name || t.dir;
  console.log(`  ${n === 0 ? 'OK  ' : 'FAIL'} ${label} (${t.dir})`);
}

if (warnings.length) {
  console.log(`\n${warnings.length} warning${warnings.length === 1 ? '' : 's'}:`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (errors.length) {
  console.log(`\n${errors.length} error${errors.length === 1 ? '' : 's'}:`);
  for (const e of errors) console.log(`  x ${e}`);
  process.exit(1);
}
console.log('\nNo problems found.');
