#!/usr/bin/env node
/* Builds one installable ZIP per theme listed in themes.json.
 *
 * Two things matter for a Shopify upload and both are easy to get wrong:
 *
 *  1. The theme files must sit at the ROOT of the archive. If they sit inside
 *     a folder named after the theme, Shopify uploads the wrapper folder and
 *     the theme has no layout/theme.liquid, so every page 404s.
 *  2. Exactly one ZIP per theme, named <name>-v<version>.zip, so a client can
 *     be handed a single file. Building a new client must never overwrite
 *     another client's archive.
 *
 * Usage: node scripts/build-themes.js [theme-dir ...]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');
const DIST = path.join(ROOT, 'dist');

/* The only directories Shopify expects at the root of a theme archive. */
const ALLOWED_DIRS = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];

/* Files inside a theme that are not part of the theme itself. */
const EXCLUDE = ['.DS_Store', 'Thumbs.db', '.gitkeep', 'node_modules'];

function isExcluded(name) {
  return EXCLUDE.includes(name) || name.startsWith('.');
}

function collect(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (isExcluded(entry.name)) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...collect(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

function assertThemeShape(themeDir, files) {
  const problems = [];
  const tops = new Set(files.map((f) => f.split('/')[0]));

  for (const d of ALLOWED_DIRS) {
    if (!tops.has(d)) problems.push(`missing the ${d}/ directory`);
  }
  for (const t of tops) {
    if (!ALLOWED_DIRS.includes(t)) problems.push(`unexpected top-level entry: ${t}/`);
  }

  // A wrapper folder is the single most common cause of an unopenable upload.
  const wrapped = files.filter((f) => !ALLOWED_DIRS.includes(f.split('/')[0]));
  if (wrapped.length) problems.push(`files outside the theme folders: ${wrapped.slice(0, 3).join(', ')}`);

  for (const required of ['layout/theme.liquid', 'config/settings_schema.json', 'config/settings_data.json', 'locales/en.default.json']) {
    if (!files.includes(required)) problems.push(`missing ${required}`);
  }

  const templates = files.filter((f) => f.startsWith('templates/'));
  if (!templates.some((f) => f === 'templates/index.json' || f === 'templates/index.liquid')) {
    problems.push('missing templates/index.json — Shopify 404s the homepage without it');
  }

  return problems;
}

function build(theme) {
  const themeDir = path.join(THEMES_DIR, theme.dir);
  if (!fs.existsSync(themeDir)) {
    console.error(`  ! ${theme.dir}: no such directory`);
    return false;
  }

  const files = collect(themeDir);
  const problems = assertThemeShape(themeDir, files);
  if (problems.length) {
    console.error(`  x ${theme.dir}`);
    for (const p of problems) console.error(`      ${p}`);
    return false;
  }

  fs.mkdirSync(DIST, { recursive: true });
  const zipName = `${theme.dir}-v${theme.version}.zip`;
  const zipPath = path.join(DIST, zipName);

  // Remove a previous build of THIS theme only. Other clients' archives stay.
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  // Stage into a temp dir so the archive can be built from inside it, which
  // is the only way to get the entries at the root rather than under a folder.
  const stage = path.join(ROOT, '.build-tmp', theme.dir);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });

  let rawBytes = 0;
  let shippedBytes = 0;
  for (const rel of files) {
    const from = path.join(themeDir, rel);
    const to = path.join(stage, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });

    if (/\.(css|js)$/.test(rel)) {
      const { minifyAsset } = require('./minify');
      const min = minifyAsset(rel, fs.readFileSync(from, 'utf8'));
      fs.writeFileSync(to, min);
      rawBytes += Buffer.byteLength(fs.readFileSync(from));
      shippedBytes += Buffer.byteLength(min);
    } else {
      fs.copyFileSync(from, to);
      const size = fs.statSync(to).size;
      rawBytes += size;
      shippedBytes += size;
    }
  }

  execFileSync('zip', ['-r', '-q', '-X', zipPath, '.'], { cwd: stage });
  fs.rmSync(stage, { recursive: true, force: true });

  const zipBytes = fs.statSync(zipPath).size;
  const roots = fs
    .readdirSync(DIST)
    .filter((f) => f.endsWith('.zip'))
    .join(', ');

  console.log(`  ${theme.dir}`);
  console.log(`    ${zipName}`);
  console.log(`    ${files.length} files - ${(zipBytes / 1024).toFixed(1)} KB - root: ${ALLOWED_DIRS.join(', ')}`);
  if (rawBytes !== shippedBytes) {
    const saved = 100 - (shippedBytes / rawBytes) * 100;
    console.log(`    minified - unpacked ${(rawBytes / 1024).toFixed(0)} KB -> ${(shippedBytes / 1024).toFixed(0)} KB (${saved.toFixed(0)}% smaller)`);
  }
  console.log(`    dist now holds: ${roots}`);
  return true;
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'themes.json'), 'utf8'));
const requested = process.argv.slice(2);
const list = requested.length
  ? manifest.themes.filter((t) => requested.includes(t.dir) || requested.includes(t.name.toLowerCase()))
  : manifest.themes;

if (!list.length) {
  console.error(`No themes matched. Available: ${manifest.themes.map((t) => t.dir).join(', ')}`);
  process.exit(1);
}

console.log(`Building ${list.length} theme${list.length === 1 ? '' : 's'}`);
const results = list.map(build);
const failed = results.filter((r) => !r).length;
if (failed) {
  console.error(`\n${failed} theme(s) failed to build`);
  process.exit(1);
}
