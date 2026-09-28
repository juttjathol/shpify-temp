/* ==========================================================================
   Creme — placeholder-svg.js
   Lightweight inline SVG placeholders so no missing images break the layout.
   ========================================================================== */
(function () {
  'use strict';
  var PLACEHOLDER_SVG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400" role="img" aria-label="Placeholder image">' +
        '<rect width="300" height="400" fill="#f1e4d4"/>' +
        '<g fill="none" stroke="#cdb9a2" stroke-width="2">' +
          '<rect x="96" y="140" width="108" height="120" rx="6"/>' +
          '<circle cx="128" cy="176" r="12"/>' +
          '<path d="M96 232l30-30 24 24 18-18 36 36"/>' +
        '</g>' +
        '<text x="150" y="300" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="13" fill="#8b7f74" letter-spacing="2">CRÈME</text>' +
      '</svg>'
    );

  function replacePlaceholder(img) {
    if (img.dataset.placeholderReplaced) return;
    img.dataset.placeholderReplaced = '1';
    var src = img.getAttribute('src') || '';
    if (src && src.indexOf('placeholder') === -1 && !img.naturalWidth) {
      img.src = PLACEHOLDER_SVG;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('img').forEach(replacePlaceholder);
  });
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG') replacePlaceholder(t);
  }, true);
})();
