/* ==========================================================================
   Creme — theme.js
   Announcement rotator, predictive search, filters, dialogs, page transition.
   ========================================================================== */
(function () {
  'use strict';
  var Creme = window.Creme;

  /* --- Announcement bar rotation -------------------------------------- */
  class CAnnouncement extends HTMLElement {
    connectedCallback() {
      this.messages = Array.from(this.querySelectorAll('[data-announcement-message]'));
      if (this.messages.length < 2 || !this.hasAttribute('data-rotate')) return;
      this.index = 0;
      this.messages[0].classList.add('is-active');
      this.timer = setInterval(() => this.next(), parseInt(this.getAttribute('data-rotate'), 10) || 5000);

      this.addEventListener('mouseenter', () => clearInterval(this.timer));
      this.addEventListener('mouseleave', () => { clearInterval(this.timer); this.timer = setInterval(() => this.next(), 5000); });

      var close = this.querySelector('[data-announcement-close]');
      if (close) {
        close.addEventListener('click', function () {
          try { sessionStorage.setItem('creme_announcement_closed', '1'); } catch (e) {}
          close.closest('c-announcement').remove();
        });
        try { if (sessionStorage.getItem('creme_announcement_closed') === '1') this.remove(); } catch (e) {}
      }
    }
    disconnectedCallback() { clearInterval(this.timer); }
    next() {
      this.messages[this.index].classList.remove('is-active');
      this.index = (this.index + 1) % this.messages.length;
      this.messages[this.index].classList.add('is-active');
    }
  }
  Creme.define('c-announcement', CAnnouncement);

  /* --- Predictive search ----------------------------------------------- */
  class CPredictiveSearch extends HTMLElement {
    connectedCallback() {
      if (this.dataset.initialized) return;
      this.dataset.initialized = 'true';
      this.input = this.querySelector('[data-search-input]');
      this.results = this.querySelector('[data-search-results]');
      this.form = this.querySelector('form');
      if (!this.input) return;

      var self = this;
      this._run = Creme.debounce(function () { self.search(); }, 280);
      this.input.addEventListener('input', this._run);
      this.input.addEventListener('focus', () => { if (this.input.value.length > 1) this.search(); });
      if (this.form) this.form.addEventListener('submit', () => { this.results.innerHTML = ''; });
      document.addEventListener('click', function (e) {
        if (!self.contains(e.target)) self.close();
      });
    }
    search() {
      var term = this.input.value.trim();
      if (term.length < 2) { this.close(); return; }
      var url = '/search/suggest.json?q=' + encodeURIComponent(term) +
        '&resources[type]=product,collection,page,query&resources[limit]=8';
      var self = this;
      fetch(url, { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (d) { self.render(d, term); })
        .catch(function () { self.close(); });
    }
    esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    render(data, term) {
      var resources = data.resources || {};
      var products = (resources.results && resources.results.products) || [];
      var html = '';

      if (products.length) {
        html += '<ul class="grid grid--4" style="--card-min:170px">' + products.map(function (p) {
          var img = p.featured_image
            ? '<img src="' + p.featured_image.url + '" alt="" width="170" height="220" loading="lazy" style="width:100%;border-radius:4px;aspect-ratio:3/4;object-fit:cover">'
            : '<div class="placeholder-svg" style="aspect-ratio:3/4"></div>';
          return '<li class="card"><a class="card__media" href="' + p.url + '">' + img + '</a>' +
            '<div class="card__info"><span class="card__title">' + this.esc(p.title) + '</span>' +
            '<span class="card__price">' + this.esc(p.price) + '</span></div></li>';
        }).join('') + '</ul>';
      }

      var collections = (resources.results && resources.results.collections) || [];
      var pages = (resources.results && resources.results.pages) || [];
      if (collections.length) {
        html += '<p class="eyebrow" style="margin-top:20px">Collections</p><ul class="flex-wrap" style="gap:8px">' +
          collections.map(function (c) {
            return '<li><a class="filter-chip" href="' + c.url + '">' + this.esc(c.title) + '</a></li>';
          }).join('') + '</ul>';
      }
      if (pages.length) {
        html += '<p class="eyebrow" style="margin-top:20px">Pages</p><ul class="flex-wrap" style="gap:8px">' +
          pages.map(function (p) {
            return '<li><a class="filter-chip" href="' + p.url + '">' + this.esc(p.title) + '</a></li>';
          }).join('') + '</ul>';
      }

      if (!html) {
        html = '<p class="text-center text-ink-soft">No results for “' + this.esc(term) + '”.</p>';
      } else {
        html += '<p style="margin-top:20px"><a class="link-arrow" href="/search?q=' + encodeURIComponent(term) + '">' +
          'View all results <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1 7h12M8 2l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></a></p>';
      }

      this.results.innerHTML = html;
      this.classList.add('is-open');
    }
    close() { this.classList.remove('is-open'); if (this.results) this.results.innerHTML = ''; }
  }
  Creme.define('c-predictive-search', CPredictiveSearch);

  /* --- <c-search-panel> ------------------------------------------------ */
  class CSearchPanel extends HTMLElement {
    connectedCallback() {
      this.panel = this.querySelector('[data-search-panel]');
      this.toggle = document.querySelector(this.getAttribute('data-open-target') || '');
      if (!this.panel) return;
      var self = this;
      if (this.toggle) this.toggle.addEventListener('click', function (e) { e.preventDefault(); self.toggleOpen(); });
      this.querySelectorAll('[data-search-close]').forEach((b) => b.addEventListener('click', function () { self.close(); }));
      document.addEventListener('click', function (e) {
        if (!self.contains(e.target) && !self.toggle?.contains(e.target)) self.close();
      });
    }
    toggleOpen() { this.panel.classList.contains('is-open') ? this.close() : this.open(); }
    open() {
      this.panel.classList.add('is-open');
      this.toggle?.setAttribute('aria-expanded', 'true');
      const input = this.panel.querySelector('[data-search-input]');
      if (input) setTimeout(() => input.focus(), 120);
    }
    close() {
      this.panel.classList.remove('is-open');
      this.toggle?.setAttribute('aria-expanded', 'false');
    }
  }
  Creme.define('c-search-panel', CSearchPanel);

  /* --- <c-drawer-nav> — mobile menu ------------------------------------ */
  class CDrawerNav extends HTMLElement {
    connectedCallback() {
      this.isOpen = false;
      this._onKey = Creme.focusTrap(this);
      this.toggle = document.querySelector(this.getAttribute('data-open-target') || '');
      this.addEventListener('keydown', this._onKey);
      this.querySelectorAll('[data-nav-close]').forEach((b) => b.addEventListener('click', () => this.close()));
      this.addEventListener('click', (e) => { if (e.target === this) this.close(); });
      if (this.toggle) {
        this.toggle.addEventListener('click', (e) => { e.preventDefault(); this.toggleOpen(); });
      }
      this.querySelectorAll('[data-nav-sub-toggle]').forEach((btn) => {
        btn.addEventListener('click', function () {
          var item = btn.closest('[data-nav-item]');
          var open = item.classList.toggle('is-open');
          btn.setAttribute('aria-expanded', String(open));
        });
      });
    }
    disconnectedCallback() { this.removeEventListener('keydown', this._onKey); }
    toggleOpen() { this.isOpen ? this.close() : this.open(); }
    open() {
      this.isOpen = true;
      this.classList.add('is-open');
      this.toggle?.setAttribute('aria-expanded', 'true');
      Creme.scrollLock(true);
    }
    close() {
      this.isOpen = false;
      this.classList.remove('is-open');
      this.toggle?.setAttribute('aria-expanded', 'false');
      Creme.scrollLock(false);
    }
  }
  Creme.define('c-drawer-nav', CDrawerNav);

  /* --- Filter / sort helpers on collection pages ------------------------ */
  Creme.on('creme:filter-change', function (e) {
    var url = new URL(window.location.href);
    Object.keys(e.detail).forEach(function (k) {
      if (e.detail[k] === '' || e.detail[k] == null) url.searchParams.delete(k);
      else url.searchParams.set(k, e.detail[k]);
    });
    url.searchParams.delete('page');
    var form = document.querySelector('[data-filter-form]');
    if (form) {
      var data = new FormData(form);
      var target = new URL(url.toString());
      data.forEach(function (v, k) { if (v) target.searchParams.set(k, v); });
      url = target;
    }
    window.location.href = url.toString();
  });

  /* --- Bind the collection filter / sort controls ------------------------ */
  function bindFilterControls() {
    document.querySelectorAll('[data-filter-key]').forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('change', function () {
        var payload = {};
        payload[el.getAttribute('data-filter-key')] = el.value;
        Creme.emit('creme:filter-change', payload);
      });
    });
  }
  bindFilterControls();
  Creme.on('creme:page-load', bindFilterControls);

  /* --- Optional page-transition veil ------------------------------------- */
  function runPageTransition() {
    var veil = document.querySelector('[data-page-transition]');
    if (!veil) return;
    veil.classList.add('is-done');
    setTimeout(function () { veil.remove(); }, 400);
  }
  runPageTransition();
  window.addEventListener('pageshow', runPageTransition);

  /* --- Newsletter forms ------------------------------------------------ */
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-newsletter-form]');
    if (!form) return;
    e.preventDefault();
    var btn = form.querySelector('[type="submit"]');
    var msg = form.querySelector('[data-form-message]');
    if (btn) btn.classList.add('is-loading');
    if (msg) msg.innerHTML = '';

    var action = form.getAttribute('action') || '/contact';
    fetch(action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (btn) btn.classList.remove('is-loading');
        if (msg) {
          msg.className = 'form__message form__message--' + (res.ok ? 'success' : 'error');
          msg.textContent = res.ok
            ? (res.d.message || 'Thanks — you are on the list.')
            : (res.d.errors ? Object.values(res.d.errors).flat()[0] : 'Something went wrong. Please try again.');
        }
        if (res.ok) form.reset();
      })
      .catch(function () {
        if (btn) btn.classList.remove('is-loading');
        if (msg) {
          msg.className = 'form__message form__message--error';
          msg.textContent = 'Something went wrong. Please try again.';
        }
      });
  });

  /* --- Copy link (social share) ----------------------------------------- */
  Creme.on('creme:page-load', function () {
    document.querySelectorAll('[data-copy-link]').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        var value = btn.getAttribute('data-copy-value') || window.location.href;
        var done = function () {
          var original = btn.innerHTML;
          btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>';
          Cart.toast('Link copied');
          setTimeout(function () { btn.innerHTML = original; }, 1800);
        };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(value).then(done);
        } else {
          var ta = document.createElement('textarea');
          ta.value = value;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); done(); } catch (e) {}
          ta.remove();
        }
      });
    });
  });

  /* --- Product page: open / close description dialog -------------------- */
  Creme.on('creme:page-load', function () {
    document.querySelectorAll('[data-dialog-open]').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        var dlg = document.getElementById(btn.getAttribute('data-dialog-open'));
        if (!dlg) return;
        dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
      });
    });
    document.querySelectorAll('dialog[data-dialog]').forEach(function (dlg) {
      if (dlg.dataset.bound) return;
      dlg.dataset.bound = '1';
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    });
  });
})();
