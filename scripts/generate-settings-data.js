#!/usr/bin/env node
/* Generates config/settings_data.json from settings_schema.json.
 *
 * settings_data.json is the file Shopify reads for the values behind every
 * theme setting, and it is silent when it is wrong: a malformed file is
 * dropped without a message, the editor shows defaults instead, and nothing
 * tells you why. So it is generated here rather than hand-maintained.
 *
 * The shape Shopify expects, and no other:
 *   {
 *     "current": { "settings": { <id>: <value> }, "sections": { <group> } },
 *     "presets": { "<Name>": { "settings": { <id>: <value> } } }
 *   }
 * Setting ids do NOT sit directly under "current" — only "settings" and
 * "sections" are read from there.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const themesDir = path.join(ROOT, 'themes');

/* Default value for a setting, keyed by type. Types with no sensible default
 * (images, links, collections) are simply left out of settings_data so the
 * storefront falls back to the literal defaults in css-variables.liquid. */
function defaultFor(setting) {
  // A font_picker default is a Shopify font handle. settings_data needs the
  // expanded { settings: {...} } object instead, and omitting the key entirely
  // lets the schema default apply, which is what we want.
  if (setting.type === 'font_picker') return undefined;
  if (setting.default !== undefined) return setting.default;
  switch (setting.type) {
    case 'checkbox': return false;
    case 'range': return setting.min;
    case 'select': return setting.options && setting.options[0] ? setting.options[0].value : undefined;
    case 'color': return '#000000';
    case 'text': case 'textarea': return '';
    // font_picker defaults are handles; the expanded object belongs in settings_data
    // and omitting it lets the schema default apply cleanly.
    case 'font_picker': return undefined;
    default: return undefined; // image_picker, url, font_picker, link_list, ...
  }
}

function buildSettings(schema) {
  const out = {};
  for (const group of schema) {
    for (const setting of group.settings || []) {
      if (!setting.id) continue; // header / paragraph are display-only
      const value = defaultFor(setting);
      if (value !== undefined) out[setting.id] = value;
    }
  }
  return out;
}

function buildForTheme(dir) {
  const themeDir = path.join(themesDir, dir);
  const schema = JSON.parse(fs.readFileSync(path.join(themeDir, 'config', 'settings_schema.json'), 'utf8'));
  const settings = buildSettings(schema);

  // Every section group the layout renders must have an instance here, and the
  // instance's `sections` must actually contain the ids its `order` lists. A
  // dangling id is what makes Shopify answer the homepage with a bare 404.
  const sections = {};
  for (const name of ['header-group', 'footer-group']) {
    const groupFile = path.join(themeDir, 'sections', `${name}.json`);
    if (!fs.existsSync(groupFile)) {
      console.error(`  ! ${dir}: sections/${name}.json is missing but layout renders {% sections '${name}' %}`);
      continue;
    }
    const group = JSON.parse(fs.readFileSync(groupFile, 'utf8'));
    const instances = {};
    for (const [id, section] of Object.entries(group.sections || {})) {
      instances[id] = { type: section.type, settings: {} };
    }
    sections[name] = { type: group.type, sections: instances, order: group.order || Object.keys(instances) };
  }

  const data = {
    current: { settings, sections },
    presets: {
      Default: { settings: { ...settings } },
    },
  };

  fs.writeFileSync(path.join(themeDir, 'config', 'settings_data.json'), JSON.stringify(data, null, 2) + '\n');
  const n = Object.keys(settings).length;
  console.log(`  ${dir}: ${n} settings, ${Object.keys(sections).length} section groups, 1 preset`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'themes.json'), 'utf8'));
console.log('Generating settings_data.json');
for (const theme of manifest.themes) buildForTheme(theme.dir);
