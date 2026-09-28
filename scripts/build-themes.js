#!/usr/bin/env node
/**
 * build-themes.js
 * ---------------------------------------------------------------------------
 * Packages every theme in themes/ into its own uploadable ZIP.
 *
 * One theme = one file. A merchant gets a single artefact, drags it into
 * Online Store → Themes → Add theme → Upload, and is done.
 *
 * Two rules matter for Shopify to accept the upload:
 *   1. The theme folders (assets, blocks, config, layout, locales, sections,
 *      snippets, templates) must sit at the ROOT of the archive — Shopify does
 *      NOT unwrap a containing folder, so a zip that starts with
 *      "creme/layout/theme.liquid" is rejected.
 *   2. Nothing that is not a theme file may be included. A stray README.md or
 *      .DS_Store at the root is enough to make the uploader error out.
 *
 * Every build validates first, so a broken theme never produces a file that
 * looks shippable.
 *
 * CSS and JS are minified on the way in (see minify.js) so the archive ships
 * small while the repository keeps readable source. Pass --no-minify to debug.
 *
 *   node scripts/build-themes.js            # validate + zip every theme
 *   node scripts/build-themes.js creme      # just one theme
 *   node scripts/build-themes.js --no-validate
 *   node scripts/build-themes.js --no-minify
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { minifyAsset } = require('./minify');
const THEMES_META = require('../themes.json');

const ROOT = path.join(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');
const DIST = path.join(ROOT, 'dist');

const args = process.argv.slice(2);
const NO_VALIDATE = args.includes('--no-validate');
const NO_MINIFY = args.includes('--no-minify');
const ONLY = args.filter((a) => !a.startsWith('--'));

/* Shopify only recognises these directories at the archive root. */
const ALLOWED_DIRS = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
const ALLOWED_EXT = new Set(['.liquid', '.json', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.woff', '.woff2', '.ttf', '.otf', '.ico', '.mp4', '.webm']);

/* Build tooling that must never leak into a theme archive. */
const EXCLUDE = new Set(['.DS_Store', 'Thumbs.db', '.gitkeep', '.gitignore', 'node_modules', '.git', 'README.md', 'CHANGELOG.md', 'LICENSE']);

function shouldInclude(absPath, themeRoot) {
  const rel = path.relative(themeRoot, absPath);
  if (!rel || rel.startsWith('..')) return false;
  const parts = rel.split(path.sep);
  const top = parts[0];

  if (EXCLUDE.has(top)) return false;
  if (EXCLUDE.has(parts[parts.length - 1])) return false;
  if (parts.some((p) => EXCLUDE.has(p))) return false;
  if (top.startsWith('.')) return false;
  if (!ALLOWED_DIRS.includes(top)) return false;
  if (!ALLOWED_EXT.has(path.extname(parts[parts.length - 1]).toLowerCase())) return false;

  return true;
}

function collect(themeRoot) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (shouldInclude(full, themeRoot)) files.push(full);
    }
  };
  walk(themeRoot);
  return files.map((f) => ({ abs: f, arc: path.relative(themeRoot, f).split(path.sep).join('/') }));
}

/* --- minimal, deterministic ZIP writer ------------------------------------ */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

/* Fixed DOS timestamp (2024-01-01 00:00:00) so rebuilds are byte-identical. */
const DOS_TIME = 0;
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const raw = entry.data;
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);        // version made by
    central.writeUInt16LE(20, 6);        // version needed
    central.writeUInt16LE(0, 8);         // flags
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);        // extra
    central.writeUInt16LE(0, 32);        // comment
    central.writeUInt16LE(0, 34);        // disk
    central.writeUInt16LE(0, 36);        // internal attrs
    central.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38); // external attrs (unix perms)
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, cd, eocd]);
}

/* --- run ------------------------------------------------------------------ */
function validate(themeName) {
  if (NO_VALIDATE) return true;
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'validate-theme.js'), path.join(THEMES_DIR, themeName)], {
      stdio: 'pipe',
    });
    return true;
  } catch (e) {
    process.stdout.write(e.stdout ? e.stdout.toString() : '');
    process.stderr.write(e.stderr ? e.stderr.toString() : '');
    return false;
  }
}

function meta(themeName) {
  return THEMES_META[themeName] || { name: themeName, version: '1.0' };
}

async function build(themeName) {
  const themeRoot = path.join(THEMES_DIR, themeName);
  const files = collect(themeRoot);

  if (!files.length) {
    console.error(`  ✗ ${themeName}: nothing to package`);
    return null;
  }

  /* Read, then minify in place. Only .css and .js are touched. */
  const entries = [];
  const warnings = [];
  let sourceBytes = 0, shippedBytes = 0, touched = 0;

  for (const f of files) {
    const original = fs.readFileSync(f.abs);
    let data = original;
    sourceBytes += original.length;

    const ext = path.extname(f.arc).toLowerCase();
    if (!NO_MINIFY && (ext === '.css' || ext === '.js')) {
      const result = await minifyAsset(original.toString('utf8'), ext);
      if (result.skipped) {
        warnings.push(`${f.arc} — ${result.skipped}`);
      } else {
        data = Buffer.from(result.code, 'utf8');
        touched++;
      }
    }
    shippedBytes += data.length;
    entries.push({ name: f.arc, data });
  }

  const buffer = zip(entries);

  fs.mkdirSync(DIST, { recursive: true });

  /* Remove archives for this theme from earlier builds, so `dist/` never holds
     two zips for the same theme and nobody ships the wrong one. */
  const superseded = fs.readdirSync(DIST)
    .filter((f) => f.endsWith('.zip') && f !== meta(themeName).zip
      && (f === `${themeName}.zip` || f.startsWith(`${themeName}-`)));
  for (const stale of superseded) fs.unlinkSync(path.join(DIST, stale));

  const zipName = meta(themeName).zip || `${themeName}-v${meta(themeName).version}.zip`;
  const out = path.join(DIST, zipName);
  fs.writeFileSync(out, buffer);
  if (superseded.length) console.log(`      removed stale: ${superseded.join(', ')}`);

  const kb = (buffer.length / 1024).toFixed(1);
  const top = new Set(files.map((f) => f.arc.split('/')[0]));

  console.log(`  ✓ ${path.relative(ROOT, out)}`);
  console.log(`      ${files.length} files · ${kb} KB · root: ${[...top].sort().join(', ')}`);
  if (touched) {
    const saved = ((1 - shippedBytes / sourceBytes) * 100).toFixed(0);
    console.log(`      minified ${touched} assets · unpacked ${(sourceBytes / 1024).toFixed(0)} KB → ${(shippedBytes / 1024).toFixed(0)} KB (${saved}% smaller)`);
  }
  for (const w of warnings) console.log(`      ⚠ ${w}`);
  return { name: themeName, zip: zipName, out, files: files.length, bytes: buffer.length };
}

async function main() {
const themes = (ONLY.length ? ONLY : fs.readdirSync(THEMES_DIR).filter((n) => {
  const p = path.join(THEMES_DIR, n);
  return fs.statSync(p).isDirectory();
}));

if (!themes.length) {
  console.error('No themes found in themes/');
  process.exit(1);
}

console.log(`\n  Building ${themes.length} theme${themes.length > 1 ? 's' : ''}\n`);

const built = [];
let failed = false;

for (const name of themes) {
  console.log(`  ${name}`);
  if (!validate(name)) {
    console.error(`      ✗ validation failed — no archive written for ${name}\n`);
    failed = true;
    continue;
  }
  const result = await build(name);
  if (result) built.push(result);
  console.log('');
}

if (built.length > 1) {
  console.log('  One file per theme — hand the merchant the single .zip they need:\n');
  for (const b of built) console.log(`    ${b.zip}`);
  console.log('');
}

process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
