#!/usr/bin/env node
/* Pre-upload audit. Runs against the BUILT ZIP, not the source tree, because
 * that is the file the client uploads and a theme can pass every source-level
 * check and still ship a broken archive.
 *
 *   node scripts/audit-upload.js [theme-dir ...]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'themes.json'), 'utf8'));

const ALLOWED_DIRS = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];

let pass = 0;
let fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}${extra ? `  ${extra}` : ''}`);
};

function audit(theme) {
  const zipName = `${theme.dir}-v${theme.version}.zip`;
  const zipPath = path.join(ROOT, 'dist', zipName);
  console.log(`\n=== ${theme.name} (${zipName}) ===`);

  if (!fs.existsSync(zipPath)) {
    ok(false, 'archive exists', `expected dist/${zipName} - run: npm run build ${theme.dir}`);
    return;
  }
  ok(true, 'archive exists');

  const stage = path.join(ROOT, '.audit-tmp', theme.dir);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  execFileSync('unzip', ['-q', zipPath, '-d', stage]);

  const files = [];
  (function walk(d, base = '') {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), rel);
      else files.push(rel);
    }
  })(stage);

  const read = (f) => fs.readFileSync(path.join(stage, f), 'utf8');
  const has = (f) => files.includes(f);

  console.log('\n  -- structure --');
  const tops = [...new Set(files.map((f) => f.split('/')[0]))].sort();
  const onlyAllowed = tops.every((t) => ALLOWED_DIRS.includes(t));
  ok(onlyAllowed, 'archive root holds only the Shopify folders', tops.join(', '));
  ok(
    ALLOWED_DIRS.filter((d) => tops.includes(d)).length >= 7,
    'all required top-level folders present',
    ALLOWED_DIRS.filter((d) => !tops.includes(d)).join(', ') || 'none missing'
  );
  // A wrapper folder is the classic cause of an upload that looks fine and
  // renders nothing: every file ends up one level too deep.
  const wrapped = files.filter((f) => !ALLOWED_DIRS.includes(f.split('/')[0]));
  ok(wrapped.length === 0, 'no wrapper folder - files sit at the archive root', wrapped.slice(0, 3).join(', '));

  const junk = files.filter((f) => f.startsWith('__MACOSX') || f.includes('.DS_Store') || f.startsWith('.'));
  ok(junk.length === 0, 'no __MACOSX or .DS_Store entries', junk.slice(0, 3).join(', '));

  for (const required of ['layout/theme.liquid', 'config/settings_schema.json', 'config/settings_data.json', 'locales/en.default.json']) {
    ok(has(required), `${required} present`);
  }
  ok(
    has('templates/index.json') || has('templates/index.liquid'),
    'templates/index.json present - without it Shopify 404s the homepage'
  );

  console.log('\n  -- config --');
  let schema = [];
  let data = {};
  try {
    schema = JSON.parse(read('config/settings_schema.json'));
    ok(true, 'settings_schema.json is valid JSON', `${schema.length} groups`);
  } catch (e) {
    ok(false, 'settings_schema.json is valid JSON', e.message);
  }
  try {
    data = JSON.parse(read('config/settings_data.json'));
    ok(true, 'settings_data.json is valid JSON');
  } catch (e) {
    ok(false, 'settings_data.json is valid JSON', e.message);
  }
  ok(
    !!(data.current && data.current.settings && typeof data.current.settings === 'object'),
    'settings_data has current.settings - the shape Shopify actually reads'
  );
  const stray = Object.keys(data.current || {}).filter((k) => !['settings', 'sections'].includes(k));
  ok(stray.length === 0, 'current holds only "settings" and "sections"', stray.slice(0, 3).join(', '));

  console.log('\n  -- sections and templates --');
  const sectionTypes = new Set(files.filter((f) => f.startsWith('sections/') && f.endsWith('.liquid')).map((f) => f.split('/')[1].replace('.liquid', '')));
  const snippetNames = new Set(files.filter((f) => f.startsWith('snippets/') && f.endsWith('.liquid')).map((f) => f.split('/')[1].replace('.liquid', '')));

  const liquid = files.filter((f) => f.endsWith('.liquid'));
  const used = new Set();
  const missingSnippets = [];
  for (const f of liquid) {
    for (const m of read(f).matchAll(/\{%-?\s*render\s+'([\w-]+)'/g)) {
      used.add(m[1]);
      if (!snippetNames.has(m[1])) missingSnippets.push(`${f} -> ${m[1]}`);
    }
  }
  ok(missingSnippets.length === 0, `every {% render %} target is in the archive (${snippetNames.size} snippets)`, missingSnippets.slice(0, 3).join(', '));

  const deadSnippets = [...snippetNames].filter((s) => !used.has(s));
  ok(deadSnippets.length === 0, 'no unreferenced snippets in the archive', deadSnippets.join(', '));

  let badRefs = [];
  let noOrder = [];
  for (const f of files.filter((x) => x.startsWith('templates/') && x.endsWith('.json'))) {
    let tpl;
    try { tpl = JSON.parse(read(f)); } catch { badRefs.push(`${f}: invalid JSON`); continue; }
    const order = tpl.order || [];
    for (const id of order) if (!(tpl.sections || {})[id]) badRefs.push(`${f}: order -> missing "${id}"`);
    for (const id of Object.keys(tpl.sections || {})) if (!order.includes(id)) noOrder.push(`${f}: "${id}" not in order`);
    for (const s of Object.values(tpl.sections || {})) {
      if (s.type !== '@app' && !sectionTypes.has(s.type)) badRefs.push(`${f}: sections/${s.type}.liquid missing`);
    }
  }
  ok(badRefs.length === 0, 'every template section reference resolves', badRefs.slice(0, 3).join(', '));
  ok(noOrder.length === 0, 'every section in every template is in the order list', noOrder.slice(0, 3).join(', '));

  // The section groups the layout renders, and their instances.
  const layout = has('layout/theme.liquid') ? read('layout/theme.liquid') : '';
  const groupRefs = [...layout.matchAll(/\{%-?\s*sections\s+'([\w-]+)'/g)].map((m) => m[1]);
  ok(groupRefs.length > 0, 'layout renders at least one section group', groupRefs.join(', '));
  const groupProblems = [];
  for (const g of groupRefs) {
    if (!has(`sections/${g}.json`)) { groupProblems.push(`sections/${g}.json missing`); continue; }
    const inst = ((data.current || {}).sections || {})[g];
    if (!inst) { groupProblems.push(`no settings_data instance for ${g}`); continue; }
    const ids = Object.keys(inst.sections || {});
    for (const id of inst.order || []) if (!ids.includes(id)) groupProblems.push(`${g}: order -> "${id}" has no section`);
  }
  ok(groupProblems.length === 0, 'section groups and their instances line up', groupProblems.join(', '));

  console.log('\n  -- storefront --');
  const inlineScripts = [];
  const blockingScripts = [];
  for (const f of liquid) {
    for (const m of read(f).matchAll(/<script\b([^>]*)>/g)) {
      const attrs = m[1] || '';
      if (!/src=/.test(attrs)) inlineScripts.push(f);
      else if (!/\bdefer\b/.test(attrs)) blockingScripts.push(f);
    }
  }
  ok(inlineScripts.length === 0, 'no inline <script> (always render-blocking)', [...new Set(inlineScripts)].join(', '));
  ok(blockingScripts.length === 0, 'every external script is deferred', [...new Set(blockingScripts)].join(', '));

  const rawImages = [];
  for (const f of liquid) {
    for (const m of read(f).matchAll(/<img\b[\s\S]{0,500}?>/g)) {
      if (/\|\s*image_url/.test(m[0]) || /placeholder_svg/.test(m[0])) continue;
      if (/\bsrc="\{\{/.test(m[0]) || /\bsrcset="\{\{/.test(m[0])) continue;
      rawImages.push(f);
    }
  }
  ok(rawImages.length === 0, 'all images go through | image_url', [...new Set(rawImages)].join(', '));

  const missingAssets = [];
  for (const f of liquid) {
    for (const m of read(f).matchAll(/['"]([\w./-]+\.(?:css|js))['"]\s*\|\s*asset_url/g)) {
      if (!has(`assets/${m[1]}`)) missingAssets.push(`${f} -> assets/${m[1]}`);
    }
  }
  ok(missingAssets.length === 0, 'every referenced asset is in the archive', missingAssets.join(', '));

  const css = files.filter((f) => f.endsWith('.css')).map((f) => read(f)).join('\n');
  ok(/@media/.test(css), 'stylesheet has responsive breakpoints');
  ok(
    /prefers-reduced-motion/.test(css),
    'stylesheet respects prefers-reduced-motion'
  );

  console.log('\n  -- packaging --');
  const distZips = fs.readdirSync(path.join(ROOT, 'dist')).filter((f) => f.endsWith('.zip'));
  ok(/^[a-z0-9-]+-v\d+\.\d+\.zip$/.test(zipName), 'filename matches <theme-name>-v<version>.zip', zipName);
  ok(distZips.length === 1 || distZips.every((z) => z === zipName), 'no stale archive for this theme', distZips.join(', '));

  fs.rmSync(path.join(ROOT, '.audit-tmp'), { recursive: true, force: true });
}

const requested = process.argv.slice(2);
const list = requested.length ? manifest.themes.filter((t) => requested.includes(t.dir)) : manifest.themes;
for (const t of list) audit(t);

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
