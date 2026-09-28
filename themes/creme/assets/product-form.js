/* ==========================================================================
   Creme — product-form.js
   Variant selection, live price/stock, add-to-cart on the product page.
   ========================================================================== */
(function () {
  'use strict';
  var Creme = window.Creme;
  var Cart = Creme.Cart;

  var formatPrice = function (cents) {
    if (window.money_format) {
      return window.money_format
        .replace(/\{\{\s*amount\s*\}\}/g, (cents / 100).toFixed(2))
        .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, (Math.round(cents) / 100).toFixed(0))
        .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, (cents / 100).toFixed(2).replace('.', ','));
    }
    return (cents / 100).toFixed(2);
  };

  class CProductForm extends HTMLElement {
    connectedCallback() {
      if (this.dataset.initialized) return;
      this.dataset.initialized = 'true';

      this.form = this.querySelector('form');
      this.variants = JSON.parse(this.getAttribute('data-variants') || '[]');
      this.sectionId = this.getAttribute('data-section-id') || '';
      this.updateUrl = this.hasAttribute('data-update-url');
      this.useLayout = this.hasAttribute('data-dynamic-layout');

      this.selects = Array.from(this.querySelectorAll('[data-option-select]'));
      this.inputs = Array.from(this.querySelectorAll('[data-option-input]'));
      this.submit = this.querySelector('[data-product-submit]');
      this.priceEl = this.querySelector('[data-product-price]');
      this.compareAtEl = this.querySelector('[data-product-compare]');
      this.stockEl = this.querySelector('[data-product-stock]');
      this.labelEls = this.querySelectorAll('[data-option-label]');

      this.selects.forEach((sel) => sel.addEventListener('change', () => this.onChange()));
      this.inputs.forEach((inp) => {
        inp.addEventListener('change', () => this.onChange());
        var chip = inp.closest('.variant-chip');
        if (chip) {
          chip.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            var group = inp.closest('.variant-selector');
            var list = group ? Array.from(group.querySelectorAll('input:not(:disabled)')) : [];
            var i = list.indexOf(inp);
            var next = e.key === 'ArrowRight' ? list[(i + 1) % list.length] : list[(i - 1 + list.length) % list.length];
            if (next) { next.focus(); next.click(); }
          });
        }
      });

      this.form.addEventListener('submit', (e) => this.onSubmit(e));
      this.onChange();
    }

    currentVariant() {
      var chosen = {};
      this.selects.forEach((sel) => { chosen[sel.name] = sel.value; });
      this.inputs.forEach((inp) => { if (inp.checked) chosen[inp.name] = inp.value; });

      return this.variants.find(function (v) {
        return Object.keys(chosen).every(function (k) {
          if (chosen[k] === '' || chosen[k] == null) return true;
          return String(v.options[k]) === String(chosen[k]);
        });
      }) || this.variants[0];
    }

    onChange() {
      var variant = this.currentVariant();
      if (!variant) return;

      // Reflect selected value in the option headings
      this.labelEls.forEach((el) => {
        var name = el.getAttribute('data-option-label');
        if (name && variant.options[name] != null) el.textContent = variant.options[name];
      });

      if (this.priceEl) {
        this.priceEl.innerHTML = this.priceHTML(variant);
      }
      if (this.compareAtEl) {
        this.compareAtEl.textContent = variant.compare_at_price > variant.price ? formatPrice(variant.compare_at_price) : '';
      }
      if (this.stockEl) {
        var instock = variant.available && (variant.inventory_management === null || variant.inventory_quantity > 0);
        this.stockEl.textContent = instock
          ? (this.getAttribute('data-in-stock-text') || 'In stock')
          : (this.getAttribute('data-sold-out-text') || 'Sold out');
        this.stockEl.classList.toggle('text-sale', !instock);
        this.stockEl.classList.toggle('text-ink-soft', instock);
      }

      // Availability of each chip
      this.inputs.forEach((inp) => {
        var name = inp.name, value = inp.value;
        var probe = {};
        this.selects.forEach((sel) => { probe[sel.name] = sel.value; });
        this.inputs.forEach((o) => { if (o.checked && o !== inp) probe[o.name] = o.value; });
        probe[name] = value;
        var match = this.variants.find(function (v) {
          return Object.keys(probe).every(function (k) { return probe[k] === '' || String(v.options[k]) === String(probe[k]); });
        });
        var available = !!(match && match.available);
        inp.disabled = !available;
        var chip = inp.closest('.variant-chip');
        if (chip) {
          var link = chip.closest('[data-option-value]');
          if (link && available) {
            var url = new URL(location.href);
            url.searchParams.set('variant', match.id);
            link.href = url.toString();
          }
        }
      });

      var idInput = this.querySelector('input[name="id"]');
      if (idInput) idInput.value = variant.id;

      var addBtn = this.querySelector('[data-product-submit]');
      if (addBtn) {
        var hasOptions = this.selects.length > 0 || this.inputs.length > 0;
        addBtn.disabled = hasOptions && !variant.available;
        addBtn.textContent = variant.available
          ? (addBtn.getAttribute('data-add-text') || 'Add to cart')
          : (addBtn.getAttribute('data-sold-out-text') || 'Sold out');
      }

      if (variant.featured_media_id) {
        Creme.emit('creme:variant-change', { mediaId: variant.featured_media_id });
      }

      if (this.updateUrl && variant.id) {
        var url = new URL(location.href);
        url.searchParams.set('variant', variant.id);
        history.replaceState({}, '', url.toString());
      }
    }

    priceHTML(variant) {
      var compare = variant.compare_at_price > variant.price
        ? '<del>' + formatPrice(variant.compare_at_price) + '</del><ins>' + formatPrice(variant.price) + '</ins>'
        : formatPrice(variant.price);
      return compare;
    }

    async onSubmit(e) {
      if (!this.submit || this.submit.disabled) return;
      e.preventDefault();
      var variant = this.currentVariant();
      if (!variant) return;

      var qtyInput = this.querySelector('[name="quantity"]');
      var quantity = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;

      Cart.setBusy(this.submit, true);
      try {
        var props = {};
        this.querySelectorAll('input[data-line-prop]').forEach(function (i) { if (i.value) props[i.name] = i.value; });
        var payload = { items: [{ id: variant.id, quantity: quantity, properties: Object.keys(props).length ? props : undefined }] };
        var cart = await Cart.request(Cart.endpoints.add, { method: 'POST', body: JSON.stringify(payload) });
        Cart.render(cart);
        Cart.setBusy(this.submit, false);
        var addedText = this.getAttribute('data-added-text');
        if (addedText) {
          var original = this.submit.textContent;
          this.submit.textContent = addedText;
          setTimeout(() => { this.submit.textContent = original; }, 2000);
        }
        Creme.emit('creme:open-cart');
      } catch (err) {
        Cart.setBusy(this.submit, false);
        Cart.toast(err.message, 'error');
        if (/available|stock/i.test(err.message)) {
          setTimeout(() => this.onChange(), 1200);
        }
      }
    }
  }
  /* --- Product page quantity stepper (not tied to a cart line) ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-quantity-up], [data-quantity-down]');
    if (!btn) return;
    var wrap = btn.closest('[data-quantity]');
    if (!wrap || wrap.closest('[data-line]')) return;
    var input = wrap.querySelector('.quantity__input');
    if (!input) return;
    var min = parseInt(input.getAttribute('min'), 10) || 1;
    var max = parseInt(input.getAttribute('max'), 10) || Infinity;
    var qty = parseInt(input.value, 10) || min;
    qty = btn.hasAttribute('data-quantity-up') ? qty + 1 : Math.max(min, qty - 1);
    input.value = String(Math.min(qty, max));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* --- Keep the gallery in sync with the selected variant --------------- */
  Creme.on('creme:variant-change', function (e) {
    var mediaId = e.detail && e.detail.mediaId;
    if (!mediaId) return;
    var thumb = document.querySelector('[data-gallery-thumb="' + mediaId + '"]');
    if (thumb) thumb.click();
  });

  Creme.define('c-product-form', CProductForm);

  /* --- Product gallery ------------------------------------------------- */
  class CGallery extends HTMLElement {
    connectedCallback() {
      if (this.dataset.initialized) return;
      this.dataset.initialized = 'true';
      var thumbs = this.querySelectorAll('[data-gallery-thumb]');
      var media = this.querySelectorAll('[data-gallery-item]');
      if (!thumbs.length) return;

      var self = this;
      thumbs.forEach(function (thumb) {
        thumb.addEventListener('click', function () {
          var id = thumb.getAttribute('data-gallery-thumb');
          thumbs.forEach(function (t) { t.classList.toggle('is-active', t === thumb); });
          media.forEach(function (m) {
            var on = m.getAttribute('data-gallery-item') === id;
            m.hidden = !on;
          });
          self.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      });
      var first = this.querySelector('[data-gallery-thumb].is-active') || thumbs[0];
      thumbs.forEach(function (t) { t.classList.toggle('is-active', t === first); });
    }
  }
  Creme.define('c-gallery', CGallery);
})();
