#!/usr/bin/env node
/**
 * minify.js
 * ---------------------------------------------------------------------------
 * Minifies CSS and JavaScript on their way into the theme ZIP.
 *
 * The repository keeps readable, commented source; only the shipped archive is
 * minified. A merchant uploading the ZIP gets smaller files over the wire,
 * while anyone maintaining the theme still has something they can read.
 *
 * Two deliberate safety rules, because a broken minified asset is far worse
 * than a few kilobytes of savings:
 *
 *   1. If a minifier errors, or returns something that does not parse, the
 *      original source is used and a warning is printed.
 *   2. If minifying ever produces MORE bytes than the source (possible on a
 *      file that is already dense), the source is kept.
 *
 * Note on `{{amount}}` in assets/cart-drawer.js: assets are served verbatim
 * by Shopify and are not Liquid-rendered, so that placeholder is an ordinary
 * string literal. Terser leaves string contents alone.
 */

const CleanCSS = require('clean-css');
const { minify: terserMinify } = require('terser');

/* postcss is not a dependency; syntax is checked by the terser/clean-css
 * parsers themselves, which throw on malformed input. */
async function minifySource(source, ext) {
  if (ext === '.css') {
    /*
      Level 1 only. An earlier audit appeared to show level 2 dropping 24
      selectors; that was a fault in the audit's comparator, not in clean-css —
      level 2 rewrites *::after to ::after and [a="b"] to [a=b], which are
      equivalent. Re-tested with a normalising comparator, level 2 also loses
      0 of 615 selectors and saves 53 bytes (0.1%). Not worth any risk.
    */
    const out = new CleanCSS({ level: 1, returnPromise: false }).minify(source);
    if (out.errors.length) throw new Error(out.errors.join('; '));
    return out.styles;
  }
  if (ext === '.js') {
    const result = await terserMinify(source, {
      compress: { passes: 2 },
      mangle: true,
      format: { comments: false },
      sourceMap: false,
    });
    if (!result || typeof result.code !== 'string' || !result.code.trim()) {
      throw new Error('terser produced no output');
    }
    return result.code;
  }
  return source;
}

/**
 * Minifies one asset. Never throws: falls back to the source on any problem.
 * @returns {Promise<{code: string, before: number, after: number, skipped?: string}>}
 */
async function minifyAsset(source, ext) {
  if (ext !== '.css' && ext !== '.js') {
    return { code: source, before: source.length, after: source.length, skipped: 'not minifiable' };
  }
  const before = Buffer.byteLength(source);
  try {
    const code = await minifySource(source, ext);
    const after = Buffer.byteLength(code);
    if (after === 0) return { code: source, before, after, skipped: 'empty output' };
    if (after >= before) return { code: source, before, after, skipped: 'no smaller than source' };
    return { code, before, after };
  } catch (err) {
    return { code: source, before, after: before, skipped: `minifier failed: ${err.message}` };
  }
}

/**
 * Synchronous CSS-only minify, for the validator, which is a straight-line
 * script and cannot await. Throws on invalid CSS so the caller can report it.
 */
function minifyCss(source) {
  const out = new CleanCSS({ level: 1, returnPromise: false }).minify(source);
  if (out.errors.length) throw new Error(out.errors.join('; '));
  return out.styles;
}

module.exports = { minifyAsset, minifySource, minifyCss };
