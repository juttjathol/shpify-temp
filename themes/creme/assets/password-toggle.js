/* Show/hide toggle on the password page. Loaded with defer so it never blocks
   the first paint. Kept in an asset rather than inline so the password page
   ships no render-blocking script. */
document.addEventListener('DOMContentLoaded', function () {
  var input = document.getElementById('Password');
  var toggle = document.querySelector('[data-toggle-password]');
  if (!input || !toggle) return;
  var showLabel = toggle.textContent.trim();
  var hideLabel = toggle.dataset.hideLabel || showLabel;
  toggle.addEventListener('click', function () {
    var isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    toggle.textContent = isHidden ? hideLabel : showLabel;
    input.focus();
  });
});
