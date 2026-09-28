#!/usr/bin/env node
/**
 * Regenerates the static preview's theme variables.
 *
 * preview/index.html loads the theme's real stylesheets, but CSS custom
 * properties can only be produced by executing Liquid. Rather than hand-mirror
 * snippets/css-variables.liquid (which drifts the moment a setting is added),
 * this renders the actual snippet with the values in settings_data.json and
 * splices the result into the preview.
 *
 *   node scripts/sync-preview.js [themeDir] [presetName]
 */
const { Liquid } = require('liquidjs');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const THEME = path.resolve(process.argv[2] || path.join(REPO, 'themes', 'creme'));
const PRESET = process.argv[3] || null;
const PREVIEW = path.join(REPO, 'preview', 'index.html');

// The preview cannot load Shopify's font setting, so stand in the two families
// the default palette is designed around.
const font = (family, fallback_families) => ({ family, fallback_families, weight: 400 });

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(THEME, 'config', 'settings_data.json'), 'utf8'));
  const current = PRESET && data.presets[PRESET] ? data.presets[PRESET].settings : data.current;
  if (PRESET && !data.presets[PRESET]) {
    console.error(`  ✗ unknown preset "${PRESET}". Available: ${Object.keys(data.presets).join(', ')}`);
    process.exit(1);
  }

  const engine = new Liquid({ strictVariables: false, strictFilters: false, jsTruthy: true });
  const template = fs.readFileSync(path.join(THEME, 'snippets', 'css-variables.liquid'), 'utf8');
  const out = await engine.parseAndRender(template, {
    settings: {
      ...current,
      type_body_font: font('Assistant', 'sans-serif'),
      type_heading_font: font('Bodoni Moda', 'serif'),
    },
  });

  const css = out.match(/<style>([\s\S]*?)<\/style>/);
  if (!css) {
    console.error('  ✗ css-variables.liquid did not emit a <style> block');
    process.exit(1);
  }

  const html_path = PREVIEW;
  let html = fs.readFileSync(html_path, 'utf8');
  const start = html.indexOf('  /* Rendered from the real snippets/css-variables.liquid');
  const end = html.indexOf('  .preview-note {');
  if (start === -1 || end === -1) {
    console.error('  ✗ could not find the managed style block in preview/index.html');
    process.exit(1);
  }

  const header =
    `  /* Rendered from the real snippets/css-variables.liquid + config/settings_data.json` +
    `${PRESET ? ` (${PRESET})` : ''}.\n     Regenerate with: npm run preview:sync */\n`;
  const body = css[1].trimEnd().split('\n').map((l) => (l ? '  ' + l : l)).join('\n');
  // Reveal the hover-only affordances; a static page has no hover to wait for.
  const keep = '  .card__quick-add, .card__wishlist { opacity: 1; transform: none; }\n';

  fs.writeFileSync(html_path, html.slice(0, start) + header + body + '\n' + keep + html.slice(end));
  console.log(`  ✓ preview/index.html — ${body.split('\n').length} lines of live CSS` +
    `${PRESET ? ` from preset "${PRESET}"` : ' from settings_data.current'}`);
})();
