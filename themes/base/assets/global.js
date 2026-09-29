/* ==========================================================================
   Base theme — global behaviour
   --------------------------------------------------------------------------
   Vanilla JS, no dependencies. Loaded once with defer from theme.liquid.
   Everything is opt-in through data attributes so sections stay in control:
     data-drawer-open="cart"   -> opens the drawer with id="drawer-cart"
     data-drawer-close         -> closes the drawer it lives inside
     data-drawer="cart"        -> marks the drawer itself
     data-announcement         -> closable announcement bar
     data-quantity             -> +/- stepper around an input[name=quantity]
     data-variant              -> radios that rewrite ?variant=
   ========================================================================== */

(function () {
  'use strict';

  var FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /* ----------------------------------------------------------------------
     Drawers
     ---------------------------------------------------------------------- */
  var openDrawer = null;
  var lastFocused = null;

  function focusableIn(el) {
    return Array.prototype.filter.call(el.querySelectorAll(FOCUSABLE), function (n) {
      return n.offsetParent !== null;
    });
  }

  function openPanel(name) {
    var drawer = document.querySelector('[data-drawer="' + name + '"]');
    if (!drawer) return;
    if (openDrawer) closePanel();
    lastFocused = document.activeElement;
    drawer.setAttribute('open', '');
    drawer.removeAttribute('inert');
    document.documentElement.style.overflow = 'hidden';
    openDrawer = drawer;
    var first = focusableIn(drawer)[0];
    if (first) first.focus();
    document.dispatchEvent(new CustomEvent('drawer:opened', { detail: { name: name } }));
  }

  function closePanel() {
    if (!openDrawer) return;
    openDrawer.removeAttribute('open');
    document.documentElement.style.overflow = '';
    openDrawer = null;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    lastFocused = null;
  }

  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-drawer-open]');
    if (opener) {
      e.preventDefault();
      openPanel(opener.getAttribute('data-drawer-open'));
      return;
    }
    if (e.target.closest('[data-drawer-close]')) {
      e.preventDefault();
      closePanel();
      return;
    }
    // Click on the scrim, but not inside the panel.
    if (openDrawer && e.target.classList.contains('drawer__overlay')) closePanel();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePanel();

    // Keep Tab inside an open drawer.
    if (e.key === 'Tab' && openDrawer) {
      var items = focusableIn(openDrawer);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* Cart count in the header, kept in sync as the cart changes. */
  document.addEventListener('cart:updated', function (e) {
    var count = e.detail && e.detail.count;
    if (typeof count !== 'number') return;
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = count;
      el.hidden = count === 0;
    });
  });

  function refreshCartCount() {
    if (!document.querySelector('[data-cart-count]')) return;
    fetch(window.routes ? window.routes.cart_url + '.js' : '/cart.js', {
      headers: { Accept: 'application/json' }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cart) {
        if (!cart) return;
        document.querySelectorAll('[data-cart-count]').forEach(function (el) {
          el.textContent = cart.item_count;
          el.hidden = cart.item_count === 0;
        });
      })
      .catch(function () { /* a missing cart count must never break the page */ });
  }
  if (window.Shopify && window.Shopify.routes && window.Shopify.routes.root_url) {
    window.Shopify.routes.root = window.Shopify.routes.root_url;
  }
  window.CartCount = { refresh: refreshCartCount };
  refreshCartCount();

  /* ----------------------------------------------------------------------
     Announcement bar — dismiss for a week
     ---------------------------------------------------------------------- */
  var BAR_KEY = 'announcement-dismissed';
  document.querySelectorAll('[data-announcement]').forEach(function (bar) {
    var key = BAR_KEY + ':' + (bar.getAttribute('data-announcement') || 'default');
    try {
      if (window.localStorage.getItem(key)) {
        bar.remove();
        return;
      }
    } catch (err) { /* private mode: just leave the bar visible */ }
    var close = bar.querySelector('[data-announcement-close]');
    if (!close) return;
    close.addEventListener('click', function () {
      try { window.localStorage.setItem(key, '1'); } catch (err) { /* ignore */ }
      bar.remove();
    });
  });

  /* ----------------------------------------------------------------------
     Header — add a shadow once the page scrolls
     ---------------------------------------------------------------------- */
  var stickyHeader = document.querySelector('[data-sticky-header]');
  if (stickyHeader) {
    var onScroll = function () {
      stickyHeader.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ----------------------------------------------------------------------
     Quantity stepper
     ---------------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-quantity-step]');
    if (!btn) return;
    e.preventDefault();
    var wrap = btn.closest('[data-quantity]');
    if (!wrap) return;
    var input = wrap.querySelector('input[name="quantity"], input[type="number"]');
    if (!input) return;
    var step = parseInt(btn.getAttribute('data-quantity-step'), 10) || 1;
    var min = parseInt(input.getAttribute('min'), 10);
    var max = parseInt(input.getAttribute('max'), 10);
    var value = (parseInt(input.value, 10) || min || 1) + step;
    if (!isNaN(min)) value = Math.max(min, value);
    if (!isNaN(max)) value = Math.min(max, value);
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* ----------------------------------------------------------------------
     Variant radios -> ?variant=
     ---------------------------------------------------------------------- */
  document.addEventListener('change', function (e) {
    var input = e.target.closest('[data-variant]');
    if (!input) return;
    var form = input.closest('form[action*="/cart/add"]') || input.form;
    if (!form) return;
    var id = input.value;
    if (!id) return;
    var url = new URL(window.location.href);
    url.searchParams.set('variant', id);
    window.history.replaceState({}, '', url.toString());
  });
})();
