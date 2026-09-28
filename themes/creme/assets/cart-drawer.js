/* ==========================================================================
   Creme — cart-drawer.js
   Shared cart logic: drawer, cart page, quick add, free-shipping meter.
   Uses the Shopify Cart AJAX API.
   ========================================================================== */
(function () {
  'use strict';
  var Creme = window.Creme;
  var FORMAT = { currency: '{{amount}}' };

  var Cart = {
    get state() { return this._state || (this._state = { itemCount: 0, totalPrice: 0 }); },

    endpoints: {
      add: window.Shopify && Shopify.routes ? Shopify.routes.root + 'cart/add.js' : '/cart/add.js',
      change: window.Shopify && Shopify.routes ? Shopify.routes.root + 'cart/change.js' : '/cart/change.js',
      update: window.Shopify && Shopify.routes ? Shopify.routes.root + 'cart/update.js' : '/cart/update.js',
      cart: window.Shopify && Shopify.routes ? Shopify.routes.root + 'cart.js' : '/cart.js'
    },

    request: async function (url, options) {
      var res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
      if (!res.ok) {
        var body = await res.json().catch(function () { return {}; });
        throw new Error((body.description || body.message || 'cart_error'));
      }
      return res.json();
    },

    add: async function (items) {
      return this.request(this.endpoints.add, { method: 'POST', body: JSON.stringify({ items: items }) });
    },

    change: async function (payload) {
      return this.request(this.endpoints.change, { method: 'POST', body: JSON.stringify(payload) });
    },

    remove: function (key) { return this.change({ id: key, quantity: 0 }); },
    update: function (key, quantity) { return this.change({ id: key, quantity: quantity }); },

    setBusy: function (el, busy) {
      if (!el) return;
      el.classList.toggle('is-loading', busy);
      el.setAttribute('aria-busy', String(busy));
      el.disabled = busy;
    },

    toast: function (message, type) {
      var t = document.querySelector('c-toast');
      if (t) t.show(message, type);
    },

    render: function (cart) {
      var count = 0;
      (cart.items || []).forEach(function (i) { count += i.quantity; });
      this.state.itemCount = count;
      this.state.totalPrice = cart.total_price;

      Creme.emit('creme:cart-update', { count: count, total: cart.total_price, cart: cart });

      document.querySelectorAll('[data-cart-drawer-body]').forEach(function (el) { Cart.paint(el, cart); });
      document.querySelectorAll('[data-cart-drawer-footer]').forEach(function (el) { Cart.paintFooter(el, cart); });
      document.querySelectorAll('[data-cart-page-body]').forEach(function (el) { Cart.paintPage(el, cart); });
      if (typeof window.CustomCart !== 'undefined' && cart.item_count > 0) {
        window.CustomCart.emit('cart:refresh', cart);
      }
    },

    lineHTML: function (item) {
      var image = item.image
        ? '<img src="' + item.image + '" alt="' + Cart.escape(item.product_title) + '" width="84" height="112" loading="lazy">'
        : '';
      var options = Object.keys(item.options || {})
        .filter(function (k) { return k !== '_merged' && item.options[k] !== null; })
        .map(function (k) { return Cart.escape(item.options[k]); })
        .join(' / ');

      return (
        '<li class="cart-item" data-line="' + item.key + '">' +
          '<a class="cart-item__media" href="' + item.url + '">' + image + '</a>' +
          '<div class="cart-item__body">' +
            '<a class="cart-item__title" href="' + item.url + '">' + Cart.escape(item.product_title) + '</a>' +
            (options ? '<p class="cart-item__options">' + options + '</p>' : '') +
            '<div class="cart-item__row">' +
              '<div class="quantity" data-quantity>' +
                '<button class="quantity__btn" type="button" data-quantity-down aria-label="Decrease quantity">' +
                  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>' +
                '</button>' +
                '<input class="quantity__input" type="number" inputmode="numeric" value="' + item.quantity + '" min="0" aria-label="Quantity">' +
                '<button class="quantity__btn" type="button" data-quantity-up aria-label="Increase quantity">' +
                  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>' +
                '</button>' +
              '</div>' +
              '<span class="cart-item__price">' + Cart.money(item.final_line_price) + '</span>' +
            '</div>' +
            '<button class="cart-item__remove" type="button" data-remove-line="' + item.key + '">' +
              Cart.t('cart.remove') + '</button>' +
          '</div>' +
        '</li>'
      );
    },

    paint: function (root, cart) {
      if (!root) return;
      var items = cart.items || [];
      if (!items.length) {
        root.innerHTML =
          '<div class="cart-drawer__empty">' +
            Cart.icon('bag') +
            '<p>' + Cart.t('cart.empty') + '</p>' +
            '<a class="btn btn--outline" href="' + Cart.routes.collections + '">' + Cart.t('cart.continue') + '</a>' +
          '</div>';
        return;
      }
      root.innerHTML = '<ul class="cart-drawer__items">' + items.map(Cart.lineHTML).join('') + '</ul>';
    },

    paintFooter: function (root, cart) {
      if (!root) return;
      var items = cart.items || [];
      root.hidden = !items.length;
      if (!items.length) return;

      var threshold = parseFloat(Cart.meta('free_shipping_threshold')) || 0;
      var meter = root.querySelector('[data-shipping-meter]');
      if (meter && threshold > 0) {
        var remaining = threshold * 100 - cart.total_price;
        var pct = Math.min(100, (cart.total_price / (threshold * 100)) * 100);
        var bar = meter.querySelector('[data-shipping-fill]');
        if (bar) bar.style.width = pct + '%';
        meter.classList.toggle('is-complete', remaining <= 0);
        var text = meter.querySelector('[data-shipping-text]');
        if (text) {
          text.innerHTML = remaining > 0
            ? Cart.t('cart.shipping_progress').replace('{{amount}}', Cart.money(remaining))
            : Cart.t('cart.shipping_qualified');
        }
      }

      var subtotal = root.querySelector('[data-cart-subtotal]');
      if (subtotal) subtotal.textContent = Cart.money(cart.total_price);
    },

    paintPage: function (root, cart) {
      if (!root) return;
      var items = cart.items || [];
      if (!items.length) { root.innerHTML = ''; return; }
      root.innerHTML = items.map(function (item) {
        var image = item.image ? '<img src="' + item.image + '" alt="" width="88" height="110" loading="lazy">' : '';
        return (
          '<tr data-line="' + item.key + '">' +
            '<td><div class="cart-table__product"><a class="cart-table__image" href="' + item.url + '">' + image + '</a>' +
              '<div><a href="' + item.url + '"><strong>' + Cart.escape(item.product_title) + '</strong></a>' +
              '<div class="cart-item__options">' + Cart.escape(item.variant_title || '') + '</div>' +
              '<div class="cart-table__actions"><button class="cart-item__remove" type="button" data-remove-line="' + item.key + '">' + Cart.t('cart.remove') + '</button></div>' +
              '</div></div></td>' +
            '<td data-label="' + Cart.t('cart.quantity') + '"><div class="quantity">' +
              '<button class="quantity__btn" type="button" data-quantity-down><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></button>' +
              '<input class="quantity__input" type="number" value="' + item.quantity + '" min="0" aria-label="' + Cart.t('cart.quantity') + '">' +
              '<button class="quantity__btn" type="button" data-quantity-up><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></button>' +
            '</div></td>' +
            '<td data-label="' + Cart.t('cart.price') + '">' + Cart.money(item.final_line_price) + '</td>' +
          '</tr>'
        );
      }).join('');

      var subtotal = document.querySelector('[data-cart-subtotal]');
      if (subtotal) subtotal.textContent = Cart.money(cart.total_price);
    },

    meta: function (key) {
      var el = document.querySelector('[data-cart-meta="' + key + '"]');
      return el ? el.textContent.trim() : '';
    },
    routes: { collections: '/collections' },
    t: function (key) {
      var el = document.querySelector('[data-t="' + key + '"]');
      return el ? el.textContent.trim() : key;
    },
    icon: function (name) {
      var el = document.querySelector('[data-icon="' + name + '"]');
      return el ? el.innerHTML : '';
    },
    escape: function (str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  };

  /* Render the cart money format on boot */
  if (window.money_format) FORMAT.currency = window.money_format;
  Cart.money = function (cents) {
    if (FORMAT.currency && FORMAT.currency.indexOf('{{') !== -1) {
      return FORMAT.currency
        .replace(/\{\{\s*amount\s*\}\}/g, (cents / 100).toFixed(2))
        .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, (Math.round(cents) / 100).toFixed(0));
    }
    return FORMAT.currency || (cents / 100).toFixed(2);
  };

  Creme.Cart = Cart;

  /* ----------------------------------------------------------------------
     <c-cart-drawer> — the slide-over
     ---------------------------------------------------------------------- */
  class CCartDrawer extends HTMLElement {
    connectedCallback() {
      this.isOpen = false;
      this._onKey = Creme.focusTrap(this);
      this.body = this.querySelector('[data-cart-drawer-body]');
      this.footer = this.querySelector('[data-cart-drawer-footer]');
      this.addEventListener('keydown', this._onKey);
      this.querySelectorAll('[data-cart-close]').forEach((b) => b.addEventListener('click', () => this.close()));
      this.addEventListener('click', (e) => { if (e.target === this) this.close(); });

      this._refresh = () => Cart.request(Cart.endpoints.cart).then((c) => Cart.render(c)).catch(() => {});
      Creme.on('creme:drawer-close', (e) => { if (e.detail.id !== this.id) this._refresh(); });
      Creme.on('creme:open-cart', () => { this._refresh(); this.open(); });
    }
    disconnectedCallback() { this.removeEventListener('keydown', this._onKey); }
    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.classList.add('is-open');
      this.setAttribute('aria-hidden', 'false');
      Creme.scrollLock(true);
      Cart.request(Cart.endpoints.cart).then((c) => Cart.render(c)).catch(() => {});
    }
    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.classList.remove('is-open');
      this.setAttribute('aria-hidden', 'true');
      Creme.scrollLock(false);
    }
  }
  Creme.define('c-cart-drawer', CCartDrawer);

  /* ----------------------------------------------------------------------
     Global cart interactions (delegated)
     ---------------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var up = e.target.closest('[data-quantity-up]');
    var down = e.target.closest('[data-quantity-down]');
    var remove = e.target.closest('[data-remove-line]');
    var line = e.target.closest('[data-line]');
    if (!up && !down && !remove) return;
    if (!line) return;

    var key = line.getAttribute('data-line');
    var input = line.querySelector('.quantity__input');
    var qty = parseInt(input.value, 10) || 0;

    if (up) qty += 1;
    else if (down) qty = Math.max(0, qty - 1);
    else qty = 0;

    if (input) input.value = String(qty);
    var job = qty === 0 ? Cart.remove(key) : Cart.update(key, qty);
    job.then(function (c) {
      Cart.render(c);
      if (qty === 0) {
        var row = document.querySelector('[data-line="' + key + '"]');
        if (row && row.animate) row.animate([{ opacity: 1 }, { opacity: 0, height: '0px' }], { duration: 220 });
      }
    }).catch(function (err) { Cart.toast(err.message, 'error'); });
  });

  document.addEventListener('change', function (e) {
    var input = e.target.closest('.quantity__input');
    if (!input) return;
    var line = input.closest('[data-line]');
    if (!line) return;
    var key = line.getAttribute('data-line');
    var qty = Math.max(0, parseInt(input.value, 10) || 0);
    var job = qty === 0 ? Cart.remove(key) : Cart.update(key, qty);
    job.then((c) => Cart.render(c)).catch((err) => Cart.toast(err.message, 'error'));
  });

  /* Header cart button opens the drawer */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cart-toggle]');
    if (!btn) return;
    e.preventDefault();
    Creme.emit('creme:open-cart');
  });

  /* Quick add from product cards */
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-quick-add]');
    if (!form) return;
    e.preventDefault();
    var btn = form.querySelector('[type="submit"]');
    var id = form.getAttribute('data-quick-add');
    Cart.setBusy(btn, true);
    Cart.add([{ id: id, quantity: 1 }])
      .then(function (c) {
        Cart.render(c);
        Cart.setBusy(btn, false);
        Creme.emit('creme:open-cart');
        Cart.toast(Cart.t('cart.added'));
      })
      .catch(function (err) {
        Cart.setBusy(btn, false);
        Cart.toast(err.message, 'error');
        if (/available|stock/i.test(err.message)) {
          setTimeout(() => { window.location.href = form.closest('[data-product-card]')?.querySelector('a')?.href || '/'; }, 900);
        }
      });
  });
})();
