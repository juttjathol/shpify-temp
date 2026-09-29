#!/usr/bin/env node
/* Creates a new client theme from the base, without touching any existing one.
 *
 *   node scripts/new-theme.js <dir> "<Client name>"
 *
 * Produces themes/<dir>/ as a full copy of the base theme, registers it in
 * themes.json, and adds its own build entry. The base theme and its ZIP are
 * untouched, so each client ends up with a separate archive they can be sent.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');
const BASE = 'base';

const [dir, name] = process.argv.slice(2);
if (!dir || !name) {
  console.error('Usage: node scripts/new-theme.js <dir> "<Client name>"');
  console.error('Example: node scripts/new-theme.js aurora "Aurora Studio"');
  process.exit(1);
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(dir)) {
  console.error(`"${dir}" is not a valid directory name. Use lowercase letters, numbers and hyphens.`);
  process.exit(1);
}

const target = path.join(THEMES_DIR, dir);
if (fs.existsSync(target)) {
  console.error(`themes/${dir} already exists. Pick a different name so this client's work stays separate.`);
  process.exit(1);
}

const manifestPath = path.join(ROOT, 'themes.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.themes.some((t) => t.dir === dir)) {
  console.error(`themes.json already has an entry for "${dir}".`);
  process.exit(1);
}

// Register first, so a crash mid-copy cannot leave an unbuildable orphan.
manifest.themes.push({
  dir,
  name,
  version: '1.0',
  author: 'juttjathol',
  description: `${name} storefront theme`,
  zip: `${dir}-v1.0.zip`,
});
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

fs.cpSync(path.join(THEMES_DIR, BASE), target, { recursive: true });

// The copy inherits the base's settings_data, which is correct to start from:
// Shopify reads current.settings, and the values come from the schema anyway.
console.log(`Created themes/${dir} for ${name}`);
console.log(`  registered in themes.json - it will build to dist/${dir}-v1.0.zip`);
console.log('');
console.log('Next:');
console.log(`  1. Edit the colours and fonts for this client in themes/${dir}/config/settings_schema.json`);
console.log(`  2. npm run check`);
console.log(`  3. npm run build ${dir}`);
console.log(`  4. Hand them dist/${dir}-v1.0.zip`);
