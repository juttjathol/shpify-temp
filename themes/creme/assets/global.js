/* ==========================================================================
   Creme — global.js
   Vanilla custom elements. No dependencies, no framework.
   ========================================================================== */
(function () {
  'use strict';

  document.documentElement.classList.remove('no-js');
  document.documentElement.classList.add('js');

  var Creme = window.Creme || {};
  window.Creme = Creme;

  /* --- Theme events: lets sections and the cart drawer talk to each other -- */
  Creme.on = function (name, fn) {
    document.addEventListener(name, fn);
  };
  Creme.emit = function (name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  };

  Creme.money = function (cents, format) {
    var fmt = format || {};
    var value = '';
    if (fmt.currency) {
      value = fmt.currency.replace(/(^|\s)([\d.,]+)/, function (m, sp, n) {
        return sp + n.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
      });
    } else {
      value = (cents / 100).toFixed(2);
    }
    return value;
  };

  Creme.debounce = function (fn, wait) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 200);
    };
  };

  Creme.focusTrap = function (container) {
    var sel = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
    return function (e) {
      if (e.key !== 'Tab') return;
      var items = Array.prototype.filter.call(
        container.querySelectorAll(sel),
        function (el) { return el.offsetParent !== null; }
      );
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
  };

  Creme.scrollLock = function (lock) {
    var any = document.querySelector('.is-scroll-locked');
    if (lock) {
      if (any) { any.dataset.lockCount = String(parseInt(any.dataset.lockCount, 10) + 1); return; }
      var pad = window.innerWidth - document.documentElement.clientWidth;
      var el = document.createElement('div');
      el.className = 'is-scroll-locked';
      el.dataset.lockCount = '1';
      el.style.cssText = 'position:fixed;top:0;left:0;width:100%;pointer-events:none;';
      if (pad > 0) el.style.paddingRight = pad + 'px';
      document.body.appendChild(el);
      document.body.style.overflow = 'hidden';
    } else if (any) {
      var n = parseInt(any.dataset.lockCount, 10) - 1;
      if (n <= 0) { any.remove(); document.body.style.overflow = ''; }
      else { any.dataset.lockCount = String(n); }
    }
  };

  function def(name, ctor) {
    if (!window.customElements.get(name)) window.customElements.define(name, ctor);
  }
  Creme.define = def;

  var isTouch = window.matchMedia('(hover: none)').matches;

  /* ======================================================================
     <c-drawer> — generic side drawer (menu, cart)
     ====================================================================== */
  class CDrawer extends HTMLElement {
    connectedCallback() {
      this.isOpen = false;
      this._onKey = Creme.focusTrap(this);
      this.panel = this.querySelector('[data-drawer-panel]');
      this.trigger = document.querySelector(this.getAttribute('data-open-target') || '');
      this.closeTargets = this.querySelectorAll('[data-drawer-close]');
      this.modal = this.hasAttribute('data-modal') || !this.hasAttribute('data-inline');

      if (this.trigger) {
        this.trigger.setAttribute('aria-expanded', 'false');
        this.trigger.addEventListener('click', (e) => { e.preventDefault(); this.toggle(); });
      }
      this.closeTargets.forEach((el) => el.addEventListener('click', () => this.close()));
      this.addEventListener('keydown', this._onKey);
      this.addEventListener('click', (e) => { if (e.target === this) this.close(); });
    }
    disconnectedCallback() { this.removeEventListener('keydown', this._onKey); }
    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.classList.add('is-open');
      this.setAttribute('aria-hidden', 'false');
      if (this.trigger) this.trigger.setAttribute('aria-expanded', 'true');
      if (this.modal) Creme.scrollLock(true);
      Creme.emit('creme:drawer-open', { id: this.id });
      const focusable = this.querySelector('input,button,a[href],[tabindex]:not([tabindex="-1"])');
      if (focusable) setTimeout(() => focusable.focus(), 120);
    }
    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.classList.remove('is-open');
      this.setAttribute('aria-hidden', 'true');
      if (this.trigger) this.trigger.setAttribute('aria-expanded', 'false');
      if (this.modal) Creme.scrollLock(false);
      Creme.emit('creme:drawer-close', { id: this.id });
    }
    toggle() { this.isOpen ? this.close() : this.open(); }
  }

  /* ======================================================================
     <c-accordion-item>
     ====================================================================== */
  class CAccordionItem extends HTMLElement {
    connectedCallback() {
      this.trigger = this.querySelector('[data-accordion-trigger]');
      this.panel = this.querySelector('[data-accordion-panel]');
      if (!this.trigger || !this.panel) return;
      this.panelId = this.panel.id || 'acc-' + Math.random().toString(36).slice(2, 9);
      this.panel.id = this.panelId;
      this.trigger.setAttribute('aria-controls', this.panelId);
      this.trigger.setAttribute('aria-expanded', String(this.isOpen()));
      if (this.isOpen()) this.panel.classList.add('is-open');
      this.trigger.addEventListener('click', () => this.toggle());
    }
    isOpen() { return this.hasAttribute('open'); }
    toggle() {
      const group = this.closest('[data-accordion-single]');
      const open = this.isOpen();
      if (group && group.hasAttribute('data-accordion-single') && !open) {
        group.querySelectorAll('c-accordion-item[open]').forEach((el) => {
          el.removeAttribute('open');
          const t = el.querySelector('[data-accordion-trigger]');
          const p = el.querySelector('[data-accordion-panel]');
          if (t) t.setAttribute('aria-expanded', 'false');
          if (p) p.classList.remove('is-open');
        });
      }
      if (open) {
        this.removeAttribute('open');
        this.trigger.setAttribute('aria-expanded', 'false');
        this.panel.classList.remove('is-open');
      } else {
        this.setAttribute('open', '');
        this.trigger.setAttribute('aria-expanded', 'true');
        this.panel.classList.add('is-open');
      }
    }
  }

  /* ======================================================================
     <c-details>
     ====================================================================== */
  class CDetails extends HTMLElement {
    connectedCallback() { this.onToggle = () => Creme.emit('creme:details-toggle', { open: this.open }); this.addEventListener('toggle', this.onToggle); }
    disconnectedCallback() { this.removeEventListener('toggle', this.onToggle); }
    get open() { return this.hasAttribute('open'); }
  }

  /* ======================================================================
     <c-media> — lazy, decode-aware responsive images
     ====================================================================== */
  class CMedia extends HTMLElement {
    connectedCallback() {
      this.img = this.querySelector('img');
      if (!this.img) return;
      if (this.img.complete) return;
      this.img.addEventListener('load', () => this.classList.add('is-loaded'), { once: true });
      this.img.addEventListener('error', () => this.classList.add('is-loaded'), { once: true });
    }
  }

  /* ======================================================================
     <c-cart-count> — live cart item badge
     ====================================================================== */
  class CCartCount extends HTMLElement {
    connectedCallback() {
      this.update = (e) => {
        const count = e.detail && e.detail.count != null ? e.detail.count : null;
        if (count == null) return;
        this.textContent = count > 99 ? '99+' : String(count);
        this.closest('[data-cart-icon]')?.classList.toggle('has-items', count > 0);
      };
      Creme.on('creme:cart-update', this.update);
    }
    disconnectedCallback() { document.removeEventListener('creme:cart-update', this.update); }
  }

  /* ======================================================================
     <c-toast> — non-blocking feedback
     ====================================================================== */
  class CToast extends HTMLElement {
    connectedCallback() {
      this.list = this.querySelector('[data-toast-list]') || this;
      this.timer = null;
    }
    show(message, type) {
      if (!message) return;
      clearTimeout(this.timer);
      const el = document.createElement('div');
      el.className = 'toast toast--' + (type || 'default');
      el.setAttribute('role', 'status');
      el.textContent = message;
      el.style.cssText = 'padding:12px 18px;border-radius:4px;background:var(--color-ink);color:var(--color-bg);font-size:.86rem;box-shadow:0 10px 30px rgba(0,0,0,.18);';
      this.list.appendChild(el);
      this.timer = setTimeout(() => el.remove(), 3600);
      setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3300);
    }
  }

  /* ======================================================================
     <c-marquee> — seamless looping text
     ====================================================================== */
  class CMarquee extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-marquee-track]');
      if (!this.track) return;
      const speed = parseFloat(this.getAttribute('data-speed')) || 40;
      this.track.style.setProperty('--marquee-duration', speed + 's');
      this.track.innerHTML = this.track.innerHTML; // duplicate for seamless loop
    }
  }

  /* ======================================================================
     <c-header> — sticky shrink + transparent state
     ====================================================================== */
  class CHeader extends HTMLElement {
    connectedCallback() {
      if (!this.classList.contains('header--sticky')) return;
      this._onScroll = () => {
        this.classList.toggle('is-scrolled', window.scrollY > 24);
      };
      this._onScroll();
      window.addEventListener('scroll', this._onScroll, { passive: true });
    }
    disconnectedCallback() { window.removeEventListener('scroll', this._onScroll); }
  }

  /* ======================================================================
     <c-animate> — reveal on scroll
     ====================================================================== */
  class CAnimate extends HTMLElement {
    connectedCallback() {
      document.documentElement.classList.add('anim-ready');
      if (isTouch || !('IntersectionObserver' in window)) {
        this.classList.add('is-inview');
        return;
      }
      this.style.setProperty('--animate-delay', (parseFloat(this.getAttribute('data-delay')) || 0) + 'ms');
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { entry.target.classList.add('is-inview'); this.observer.unobserve(entry.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
      this.observer.observe(this);
    }
    disconnectedCallback() { if (this.observer) this.observer.disconnect(); }
  }

  /* ======================================================================
     <c-accordion-list> — used by <c-accordion-item> parents
     ====================================================================== */
  class CAccordionList extends HTMLElement { connectedCallback() { /* behaviour handled by items */ } }

  def('c-drawer', CDrawer);
  def('c-accordion-item', CAccordionItem);
  def('c-accordion-list', CAccordionList);
  def('c-details', CDetails);
  def('c-media', CMedia);
  def('c-cart-count', CCartCount);
  def('c-toast', CToast);
  def('c-marquee', CMarquee);
  def('c-header', CHeader);
  def('c-animate', CAnimate);

  /* ======================================================================
     Page load / ajax behaviour
     ====================================================================== */
  Creme.initPage = function () {
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      if (!el.textContent.trim()) el.textContent = '0';
    });
    // Keep the announcement rotator in sync
    Creme.emit('creme:page-load');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', Creme.initPage);
  } else {
    Creme.initPage();
  }

  // Refresh custom elements after Shopify Ajax page load
  Creme.on('page:load', () => Creme.initPage());

  // Close drawers on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('c-drawer.is-open').forEach((d) => d.close());
    }
  });
})();
