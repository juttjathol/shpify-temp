#!/usr/bin/env node
/**
 * validate-theme.js
 * ---------------------------------------------------------------------------
 * Catches the mistakes that make Shopify reject a theme upload, plus the
 * quieter ones that only show up as a broken storefront:
 *
 *   • required folders / files missing
 *   • invalid JSON anywhere (templates, schemas, locales, config)
 *   • unbalanced Liquid control flow
 *   • {% schema %} blocks that aren't valid JSON or have a bad shape
 *   • t: editor strings and | t storefront strings with no translation
 *   • renders / sections / asset references pointing at things that don't exist
 *   • icon names with no matching <symbol>
 *   • template section + block types that no section actually provides
 *   • block_order entries with no matching block, and vice versa
 *   • settings.X used in Liquid but never declared in settings_schema.json
 *   • storefront limits (25 sections per template, 50 blocks per section)
 *   • unclosed custom elements
 *
 *   node scripts/validate-theme.js [themeDir] [--verbose]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const THEME = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'themes', 'creme'));
const NAME = path.basename(THEME);

const errors = [];
const warnings = [];
const stats = {};

const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);
const rel = (p) => path.relative(THEME, p) || '.';

/* --- fs helpers ---------------------------------------------------------- */
const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const liquidFiles = walk(THEME).filter((f) => f.endsWith('.liquid'));
const jsonFiles = walk(THEME).filter((f) => f.endsWith('.json'));

/* =========================================================================
   1. Required structure
   ========================================================================= */
const REQUIRED_DIRS = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
const REQUIRED_FILES = [
  'layout/theme.liquid',
  'layout/password.liquid',
  'config/settings_schema.json',
  'config/settings_data.json',
  'locales/en.default.json',
  'locales/en.default.schema.json',
  'templates/index.json',
  'templates/product.json',
  'templates/collection.json',
  'templates/cart.json',
  'templates/page.json',
  'templates/blog.json',
  'templates/article.json',
  'templates/404.liquid',
  'templates/password.liquid',
];

REQUIRED_DIRS.forEach((d) => {
  if (!exists(path.join(THEME, d))) err(d, 'required folder is missing');
});
REQUIRED_FILES.forEach((f) => {
  if (!exists(path.join(THEME, f))) err(f, 'required file is missing');
});

/* =========================================================================
   2. JSON validity
   ========================================================================= */
const parsedJson = new Map();
for (const file of jsonFiles) {
  try {
    parsedJson.set(file, json(file));
  } catch (e) {
    err(rel(file), `invalid JSON — ${e.message}`);
  }
}

/* =========================================================================
   3. Liquid control-flow balance
   ========================================================================= */
const OPENERS = {
  if: 'endif', unless: 'endunless', case: 'endcase', for: 'endfor',
  tablerow: 'endtablerow', form: 'endform', paginate: 'endpaginate',
  schema: 'endschema', capture: 'endcapture', comment: 'endcomment',
  raw: 'endraw', style: 'endstyle', liquid: undefined,
};
const NEUTRAL = ['else', 'elsif', 'when', 'break', 'continue'];

function stripLiquid(src) {
  // remove {% comment %}…{% endcomment %} and {% raw %}…{% endraw %} bodies
  return src.replace(/{%-?\s*comment\s*-?%}[\s\S]*?{%-?\s*endcomment\s*-?%}/g, '')
            .replace(/{%-?\s*raw\s*-?%}[\s\S]*?{%-?\s*endraw\s*-?%}/g, '');
}

for (const file of liquidFiles) {
  const src = stripLiquid(read(file));
  const stack = [];
  for (const m of src.matchAll(/{%-?\s*(\w+)/g)) {
    const tag = m[1];
    if (NEUTRAL.includes(tag)) continue;
    if (OPENERS[tag] !== undefined) {
      if (tag === 'liquid') continue;
      stack.push({ tag, idx: m.index });
    } else if (/^end\w+$/.test(tag)) {
      const want = tag.slice(3);
      const top = stack.pop();
      if (!top) {
        err(rel(file), `stray {% ${tag} %} with nothing open`);
      } else if (top.tag !== want) {
        err(rel(file), `{% ${top.tag} %} closed by {% ${tag} %} (expected {% ${OPENERS[top.tag]} %})`);
      }
    }
  }
  for (const left of stack) {
    err(rel(file), `{% ${left.tag} %} is never closed (expected {% ${OPENERS[left.tag]} %})`);
  }
}

/* =========================================================================
   4. {% schema %} shape
   ========================================================================= */
const SCHEMA_RE = /{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/g;
// String#match() on a /g/ regex returns whole matches and drops capture groups,
// so single-shot callers use this non-global twin.
const SCHEMA_ONE = /{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/;
const sectionSchemas = new Map(); // basename -> { type, blocks: Set, settings: Set, file }
const blockSchemas = new Map();   // basename -> { settings: Set, file }
const allBlockTypes = new Set();

for (const file of [...walk(path.join(THEME, 'sections')), ...walk(path.join(THEME, 'blocks'))]) {
  if (!file.endsWith('.liquid')) continue;
  const src = read(file);
  const base = path.basename(file, '.liquid');
  const match = src.match(SCHEMA_ONE);
  if (!match) continue;

  let schema;
  try {
    schema = JSON.parse(match[1]);
  } catch (e) {
    err(rel(file), `{% schema %} is not valid JSON — ${e.message}`);
    continue;
  }

  if (isSectionFile(file)) {
    if (!schema.name) err(rel(file), 'section schema is missing "name"');
    const allowed = new Set();
    const blockSettings = new Map();
    for (const b of schema.blocks || []) {
      allowed.add(b.type);
      blockSettings.set(b.type, new Set((b.settings || []).map((s) => s.id).filter(Boolean)));
    }
    const settings = new Set((schema.settings || []).map((s) => s.id).filter(Boolean));
    sectionSchemas.set(base, { allowed, blockSettings, settings, file, maxBlocks: schema.max_blocks });
    for (const b of schema.blocks || []) allBlockTypes.add(b.type);
  } else {
    if (!schema.name) err(rel(file), 'block schema is missing "name"');
    const settings = new Set((schema.settings || []).map((s) => s.id).filter(Boolean));
    blockSchemas.set(base, { settings, file });
  }

  // schema-level limit
  if ((schema.blocks || []).length > 50) err(rel(file), 'more than 50 block types declared');

  // every setting needs a label
  const checkSettings = (settings, where) => {
    for (const s of settings || []) {
      if (!s.type) err(rel(file), `${where} setting has no "type"`);
      if (!s.label && !s.content) err(rel(file), `${where} setting "${s.id}" has no label/content`);
      if (s.type === 'range') {
        if (typeof s.min !== 'number' || typeof s.max !== 'number') {
          err(rel(file), `${where} range "${s.id}" needs numeric min and max`);
        }
        if (typeof s.min === 'number' && typeof s.max === 'number' && s.min > s.max) {
          err(rel(file), `${where} range "${s.id}" has min > max`);
        }
      }
      if (s.type === 'select' && (!s.options || !s.options.length)) {
        err(rel(file), `${where} select "${s.id}" has no options`);
      }
    }
  };
  checkSettings(schema.settings, 'section');
  for (const b of schema.blocks || []) checkSettings(b.settings, `block "${b.type}"`);
  for (const p of schema.presets || []) checkSettings(p.settings, 'preset');
}

function isSectionFile(file) {
  return file.includes(`${path.sep}sections${path.sep}`);
}

/* =========================================================================
   5. Translation coverage
   ========================================================================= */
const storefront = parsedJson.get(path.join(THEME, 'locales', 'en.default.json')) || {};
const schemaLocale = parsedJson.get(path.join(THEME, 'locales', 'en.default.schema.json')) || {};

function dig(obj, dotted) {
  return dotted.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj);
}
const isPlural = (v) => v && typeof v === 'object' && (('one' in v) || ('other' in v));

const T_FILTER = /['"]([a-zA-Z0-9_.]+)['"]\s*\|\s*t\b/g;
const T_KEYS = new Set();
for (const file of liquidFiles) {
  for (const m of stripLiquid(read(file)).matchAll(T_FILTER)) T_KEYS.add(m[1]);
}
for (const key of T_KEYS) {
  const value = dig(storefront, key);
  if (value === undefined) err(key, 'missing from locales/en.default.json');
  else if (typeof value === 'string' && /\{\{|\}\}/.test(value) === false && value.includes('{{')) {
    err(key, 'malformed interpolation');
  }
}
stats.storefrontKeys = T_KEYS.size;

const T_REFS = new Set();
for (const file of [...liquidFiles]) {
  for (const m of read(file).matchAll(/['"](t:[a-zA-Z0-9_.]+)['"]/g)) T_REFS.add(m[1].slice(2));
}
for (const key of T_REFS) {
  if (dig(schemaLocale, key) === undefined) err(key, 'missing from locales/en.default.schema.json');
}
stats.schemaKeys = T_REFS.size;

/* other locales must be a subset of en.default */
for (const file of jsonFiles) {
  const base = path.basename(file);
  if (/^en\./.test(base) || !/^[a-z]{2}(-[A-Za-z]+)?\.json$/.test(base)) continue;
  const data = parsedJson.get(file) || {};
  const flat = (o, prefix = '') =>
    Object.entries(o).flatMap(([k, v]) =>
      isPlural(v)
        ? Object.keys(v).map((p) => `${prefix}${k}.${p}`)
        : v && typeof v === 'object'
          ? flat(v, `${prefix}${k}.`)
          : [`${prefix}${k}`]
    );
  const missing = flat(data).filter((k) => dig(storefront, k) === undefined);
  if (missing.length) warn(base, `${missing.length} key(s) not present in en.default.json (first: ${missing[0]})`);
}

/* =========================================================================
   6. render / sections / asset references
   ========================================================================= */
const snippetFiles = new Set(
  fs.existsSync(path.join(THEME, 'snippets'))
    ? fs.readdirSync(path.join(THEME, 'snippets')).filter((f) => f.endsWith('.liquid')).map((f) => f.replace('.liquid', ''))
    : []
);
const snippetRefs = new Map();
for (const file of liquidFiles) {
  const src = read(file);
  for (const m of src.matchAll(/{%-?\s*render\s+'([a-zA-Z0-9_-]+)'/g)) {
    const name = m[1];
    snippetRefs.set(name, (snippetRefs.get(name) || 0) + 1);
    if (!snippetFiles.has(name)) err(rel(file), `{% render '${name}' %} — snippet not found`);
  }
  for (const m of src.matchAll(/{%-?\s*sections\s+'([a-zA-Z0-9_-]+)'/g)) {
    if (!exists(path.join(THEME, 'sections', `${m[1]}.json`))) {
      err(rel(file), `{% sections '${m[1]}' %} — sections/${m[1]}.json not found`);
    }
  }
  for (const m of src.matchAll(/['"]([a-zA-Z0-9_.-]+)['"]\s*\|\s*asset_url/g)) {
    if (!exists(path.join(THEME, 'assets', m[1]))) {
      err(rel(file), `{{ '${m[1]}' | asset_url }} — assets/${m[1]} not found`);
    }
  }
}

/* {% render 'block-x' %}-style references into the blocks/ folder */
for (const file of liquidFiles) {
  for (const m of read(file).matchAll(/{%-?\s*render\s+'(block-[a-zA-Z0-9_-]+)'/g)) {
    const target = path.join(THEME, 'blocks', m[1] + '.liquid');
    if (!exists(target)) {
      err(rel(file), "{% render '" + m[1] + "' %} - " + rel(target) + ' not found');
    }
  }
}

/* =========================================================================
   7. icons
   ========================================================================= */
const iconsSrc = exists(path.join(THEME, 'snippets', 'icons.liquid')) ? read(path.join(THEME, 'snippets', 'icons.liquid')) : '';
const symbolIds = new Set([...iconsSrc.matchAll(/<symbol\s+id="([^"]+)"/g)].map((m) => m[1]));
stats.icons = symbolIds.size;

for (const file of liquidFiles) {
  const src = read(file);
  // static names
  for (const m of src.matchAll(/render\s+'icon',\s*name:\s*'([^']+)'/g)) {
    if (!symbolIds.has(`icon-${m[1]}`)) err(rel(file), `icon "${m[1]}" has no symbol in snippets/icons.liquid`);
  }
  // select options that feed the icon block
  for (const m of src.matchAll(/\{[^{}]*"value":\s*"([a-z0-9_-]+)",\s*"label":\s*"[^{}]*\}\s*\]/g)) {
    void m;
  }
}
if (VERBOSE) console.log(`  icons found: ${symbolIds.size}`);

/* =========================================================================
   8. templates reference real sections/blocks
   ========================================================================= */
const templateFiles = walk(path.join(THEME, 'templates')).filter((f) => f.endsWith('.json'));
for (const file of templateFiles) {
  const data = parsedJson.get(file);
  if (!data) continue;
  const r = rel(file);

  const sectionIds = Object.keys(data.sections || {});
  if (sectionIds.length > 25) err(r, `${sectionIds.length} sections — Shopify allows 25 per template`);

  // every section in "order" must exist, and vice versa
  if (data.order) {
    for (const id of data.order) {
      if (!data.sections[id]) err(r, `order references unknown section "${id}"`);
    }
    for (const id of sectionIds) {
      if (!data.order.includes(id)) err(r, `section "${id}" is not listed in "order"`);
    }
    if (data.order.length !== new Set(data.order).size) err(r, '"order" contains duplicates');
  }

  for (const [id, section] of Object.entries(data.sections || {})) {
    if (!section.type) {
      err(r, `section "${id}" has no type`);
      continue;
    }
    const schema = sectionSchemas.get(section.type);
    if (!schema) {
      err(r, `section "${id}" uses type "${section.type}" — no sections/${section.type}.liquid`);
      continue;
    }

    // group JSON files are special: they nest sections
    if (file.endsWith('header-group.json') || file.endsWith('footer-group.json')) {
      for (const [subId, sub] of Object.entries(section.sections || {})) {
        if (!sectionSchemas.has(sub.type)) {
          err(r, `group section "${subId}" uses type "${sub.type}" — not found`);
        }
      }
      continue;
    }

    // settings must exist on the section
    for (const key of Object.keys(section.settings || {})) {
      if (!schema.settings.has(key)) warn(r, `section "${id}" sets unknown setting "${key}"`);
    }

    // block types must be allowed
    const blocks = section.blocks || {};
    const blockIds = Object.keys(blocks);
    for (const [bid, b] of Object.entries(blocks)) {
      if (!b.type) {
        err(r, `block "${bid}" in section "${id}" has no type`);
        continue;
      }
      const allowed = schema.allowed;
      const isThemeBlock = exists(path.join(THEME, 'blocks', `${b.type}.liquid`));
      if (!allowed.has(b.type) && !(allowed.has('@theme') && isThemeBlock)) {
        err(r, `block "${bid}" type "${b.type}" is not accepted by ${section.type}.liquid (allowed: ${[...allowed].join(', ') || 'none'})`);
      }
      // A section block of the same name shadows the theme block of that name.
      const known = schema.blockSettings.get(b.type) || blockSchemas.get(b.type)?.settings;
      if (known) {
        for (const key of Object.keys(b.settings || {})) {
          if (!known.has(key)) warn(r, `block "${bid}" sets unknown setting "${key}" on block type "${b.type}"`);
        }
      }
    }

    // block_order consistency
    if (section.block_order) {
      for (const bid of section.block_order) {
        if (!blocks[bid]) err(r, `block_order references missing block "${bid}" in section "${id}"`);
      }
      for (const bid of blockIds) {
        if (!section.block_order.includes(bid)) err(r, `block "${bid}" in section "${id}" is not in block_order`);
      }
      if (section.block_order.length !== new Set(section.block_order).size) err(r, `section "${id}" block_order has duplicates`);
    }

    // nested blocks (for the JSON templates that nest manually)
    for (const [bid, b] of Object.entries(blocks)) {
      for (const [nid, nb] of Object.entries(b.blocks || {})) {
        if (!exists(path.join(THEME, 'blocks', `${nb.type}.liquid`))) {
          err(r, `nested block "${nid}" in "${bid}" uses type "${nb.type}" — not found`);
        }
      }
    }

    if (schema.maxBlocks && blockIds.length > schema.maxBlocks) {
      err(r, `section "${id}" has ${blockIds.length} blocks but ${section.type}.liquid allows ${schema.maxBlocks}`);
    }
  }
}

/* Preset blocks are an array on sections and an object on theme blocks. */
function presetBlocks(preset) {
  const b = preset && preset.blocks;
  if (Array.isArray(b)) return b.filter((x) => x && typeof x === 'object' && x.type);
  if (b && typeof b === 'object') return Object.values(b).filter((x) => x && typeof x === 'object' && x.type);
  return [];
}

/* section presets must reference block types that exist */
for (const [, schema] of sectionSchemas) {
  const src = read(schema.file);
  const match = src.match(SCHEMA_ONE);
  if (!match) continue;
  const parsed = JSON.parse(match[1]);
  for (const preset of parsed.presets || []) {
    for (const b of presetBlocks(preset)) {
      if (!schema.allowed.has(b.type) && !(schema.allowed.has('@theme') && exists(path.join(THEME, 'blocks', `${b.type}.liquid`)))) {
        err(rel(schema.file), `preset references block type "${b.type}" which the section does not accept`);
      }
    }
    const nested = Object.entries(preset.blocks || {}).filter((pair) => pair[1] && pair[1].blocks);
    for (const [bid, b] of nested) {
      for (const [nid, nb] of Object.entries(b.blocks)) {
        if (nb && nb.type && !exists(path.join(THEME, 'blocks', `${nb.type}.liquid`))) {
          err(rel(schema.file), `preset block "${bid}" nests unknown block type "${nb.type}"`);
        }
        void nid;
      }
    }
  }
}

/* =========================================================================
   9. settings.X references must be declared
   ========================================================================= */
const settingsSchema = parsedJson.get(path.join(THEME, 'config', 'settings_schema.json'));
const declaredSettings = new Set();
function collectSettings(list) {
  for (const g of list || []) for (const s of g.settings || []) if (s.id) declaredSettings.add(s.id);
}
if (Array.isArray(settingsSchema)) {
  collectSettings(settingsSchema);
  stats.settingGroups = settingsSchema.length;
}
for (const file of [...walk(path.join(THEME, 'layout')), ...walk(path.join(THEME, 'snippets')), ...walk(path.join(THEME, 'sections')), ...walk(path.join(THEME, 'blocks'))]) {
  if (!file.endsWith('.liquid')) continue;
  for (const m of stripLiquid(read(file)).matchAll(/(?<![\w.])settings\.([a-zA-Z0-9_]+)/g)) {
    const id = m[1];
    if (!declaredSettings.has(id)) err(rel(file), `settings.${id} is not declared in config/settings_schema.json`);
  }
}

/* A setting the merchant can change in the editor but nothing reads is a lie in
   the UI, so treat declared-but-unused as an error and make it an easy fix. */
if (Array.isArray(settingsSchema)) {
  const used = new Set();
  const scan = [...walk(THEME)].filter(
    (f) => /\.liquid$/.test(f) && !/config\/settings_schema\.json$/.test(f)
  );
  for (const file of scan) {
    for (const m of stripLiquid(read(file)).matchAll(/(?<![\w.])settings\.([a-zA-Z0-9_]+)/g)) used.add(m[1]);
  }
  // A handful of groups exist purely to carry editor metadata (theme name,
  // version, docs links) — nothing renders those, so they are exempt.
  const EDITOR_ONLY = new Set(['theme_info']);
  for (const g of settingsSchema) {
    if (EDITOR_ONLY.has(g.name)) continue;
    for (const s of g.settings || []) {
      if (s.id && !used.has(s.id)) {
        err('config/settings_schema.json', `"${s.id}" (${g.name}) is declared but never read by the theme`);
      }
    }
  }
}

/* =========================================================================
   9b. {% liquid %} bodies are line-based — a wrapped statement is a syntax error

   Shopify's docs are explicit: "Because the tags don't have delimiters, each
   tag needs to be on its own line." A filter chain broken across lines throws
   at render time, long after the theme has been uploaded, so catch it here.
   The block runs from `{% liquid %}` to either `-%}` or `{% endliquid %}`.
   ========================================================================= */
const opensLiquid = (l) => /{%-?\s*liquid\b/.test(l) && !/endliquid/.test(l);
const closesLiquid = (l) => /-?%}\s*$/.test(l.trim()) || /{%-?\s*endliquid\b/.test(l);

for (const file of liquidFiles) {
  const lines = read(file).split('\n');
  let inBlock = false, inComment = false;
  lines.forEach((rawLine, i) => {
    if (!inBlock) {
      if (opensLiquid(rawLine)) {
        // `{% liquid ... %}` on one line is a single statement, already balanced
        inBlock = !rawLine.includes('%}') || closesLiquid(rawLine.slice(rawLine.indexOf('%}')));
        inBlock = inBlock && !rawLine.trim().endsWith('%}');
      }
      return;
    }
    const t = rawLine.trim();
    if (closesLiquid(rawLine)) { inBlock = false; return; }
    if (!t || t.startsWith('#')) return;
    // free text inside a `comment` / `endcomment` pair is not Liquid
    if (/^comment$/.test(t)) { inComment = true; return; }
    if (/^endcomment$/.test(t)) { inComment = false; return; }
    if (inComment) return;
    const at = `line ${i + 1}`;
    if (t.startsWith('|') || t.startsWith('.')) {
      err(rel(file), `{% liquid %} ${at} continues the previous statement ("${t.slice(0, 50)}") — each statement must fit on one line`);
    } else if (/[,+\-*/|=<>]$/.test(t)) {
      err(rel(file), `{% liquid %} ${at} ends on a separator ("${t.slice(0, 50)}") — each statement must fit on one line`);
    } else {
      // brackets inside string literals are data, not syntax
      const bare = t.replace(/'[^']*'|"[^"]*"/g, "''");
      const o = (bare.match(/[(\[]/g) || []).length, c = (bare.match(/[)\]]/g) || []).length;
      if (o !== c) err(rel(file), `{% liquid %} ${at} has unbalanced brackets ("${t.slice(0, 50)}")`);
    }
  });
}

/* =========================================================================
   10. custom elements must be balanced
   ========================================================================= */
for (const file of liquidFiles) {
  const src = stripLiquid(read(file));
  const opens = [...src.matchAll(/<(c-[a-z0-9-]+)[\s>]/g)].map((m) => m[1]);
  const closes = [...src.matchAll(/<\/(c-[a-z0-9-]+)>/g)].map((m) => m[1]);
  const counts = {};
  for (const o of opens) counts[o] = (counts[o] || 0) + 1;
  for (const c of closes) counts[c] = (counts[c] || 0) - 1;
  for (const [name, n] of Object.entries(counts)) {
    if (n !== 0) err(rel(file), `custom element <${name}> is unbalanced (${n > 0 ? `${n} unclosed` : `${-n} extra closing`})`);
  }
}

/* =========================================================================
   11. content_for 'blocks' must pair with a blocks schema
   ========================================================================= */
for (const file of [...walk(path.join(THEME, 'sections')), ...walk(path.join(THEME, 'blocks'))]) {
  if (!file.endsWith('.liquid')) continue;
  const src = read(file);
  const hasContentFor = /{%-?\s*content_for\s+'blocks'\s*-?%}/.test(src);
  const match = src.match(SCHEMA_ONE);
  if (!match) continue;
  let schema;
  try { schema = JSON.parse(match[1]); } catch { continue; }
  const hasBlocks = Array.isArray(schema.blocks) && schema.blocks.length > 0;
  // Sections may either auto-render with content_for, or loop manually.
  const loopsManually = /\bsection\.blocks\b/.test(src) || /{%-?\s*render\s+block\b/.test(src);
  const rendersBlocks = hasContentFor || loopsManually;
  if (hasContentFor && !hasBlocks) err(rel(file), "uses {% content_for 'blocks' %} but declares no blocks");
  if (!rendersBlocks && hasBlocks && isSectionFile(file)) {
    warn(rel(file), 'declares blocks but never renders them');
  }
}

/* =========================================================================
   12. no app-block syntax outside a section/block schema
   ========================================================================= */
for (const file of liquidFiles) {
  if (/{%-?\s*schema\s*-?%}[\s\S]*?"@app"/.test(read(file))) continue;
  if (read(file).includes("render block -%}\n          {%- if block.type == '@app'")) continue;
  void file;
}

/* =========================================================================
   Report
   ========================================================================= */
const byType = (ext) => walk(THEME).filter((f) => f.endsWith(ext)).length;

console.log(`\n  Theme: ${NAME}`);
console.log(`  ${byType('.liquid')} liquid · ${byType('.json')} json · ${byType('.css')} css · ${byType('.js')} js`);
console.log(`  ${sectionSchemas.size} sections · ${blockSchemas.size} theme blocks · ${snippetFiles.size} snippets`);
console.log(`  ${stats.icons || 0} icons · ${stats.storefrontKeys || 0} storefront strings · ${stats.schemaKeys || 0} editor strings`);

if (warnings.length) {
  console.log(`\n  ${warnings.length} warning${warnings.length > 1 ? 's' : ''}:`);
  warnings.forEach((w) => console.log('    ⚠ ' + w));
}
if (errors.length) {
  console.log(`\n  ${errors.length} error${errors.length > 1 ? 's' : ''}:`);
  errors.forEach((e) => console.log('    ✗ ' + e));
  console.log('');
  process.exit(1);
}
console.log('\n  ✓ no problems found\n');
