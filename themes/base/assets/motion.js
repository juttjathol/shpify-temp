/* ==========================================================================
   Base theme - motion
   --------------------------------------------------------------------------
   Vanilla, no dependencies, loaded with defer alongside global.js.

   Design rules this file follows:
   - It only ever adds a class or writes a custom property. With JavaScript
     off, or under prefers-reduced-motion, the page renders exactly as it
     should - content just appears instead of animating in.
   - Nothing that runs on scroll reads layout. Parallax is a single transform
     written from a rAF loop, never a getBoundingClientRect per element.
   - Every observer is disconnected when the page is hidden, so a backgrounded
     tab costs nothing.

   Opt-in via data attributes:
     data-reveal           fade up on enter (also "clip" for a wipe, "fade")
     data-reveal-group     children get a staggered delay, in DOM order
     data-parallax="0.18"  drifts the element as the page scrolls
     data-magnetic         button leans toward the cursor (pointer:fine only)
     data-count-to="120"   counts a number up when it scrolls into view
   ========================================================================== */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  function prefersReduced() { return reduceMotion.matches; }

  /* ----------------------------------------------------------------------
     Scroll reveals
     ---------------------------------------------------------------------- */
  function initReveals() {
    // data-reveal-group staggers its children without needing a per-item class.
    document.querySelectorAll('[data-reveal-group]').forEach(function (group) {
      var step = parseInt(group.getAttribute('data-reveal-group'), 10) || 90;
      group.querySelectorAll('[data-reveal]').forEach(function (el, i) {
        el.style.setProperty('--reveal-delay', Math.min(i * step, 900) + 'ms');
      });
    });

    var targets = document.querySelectorAll('[data-reveal]');
    if (!targets.length) return;

    if (prefersReduced() || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-revealed'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    targets.forEach(function (el) { observer.observe(el); });
  }

  /* ----------------------------------------------------------------------
     Product cards enter in sequence rather than all at once.
     ---------------------------------------------------------------------- */
  function initCards() {
    var cards = document.querySelectorAll('.card');
    if (!cards.length) return;

    if (prefersReduced() || !('IntersectionObserver' in window)) {
      cards.forEach(function (c) { c.classList.add('is-revealed'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var row = el.closest('[data-card-grid]');
        if (row) {
          var index = Array.prototype.indexOf.call(row.children, el);
          el.style.setProperty('--card-delay', Math.min(index, 7) * 70 + 'ms');
        }
        el.classList.add('is-revealed');
        observer.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    cards.forEach(function (c) { observer.observe(c); });
  }

  /* ----------------------------------------------------------------------
     Parallax - one rAF loop, transform only.
     ---------------------------------------------------------------------- */
  function initParallax() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
    if (!items.length || prefersReduced()) return;

    var ticking = false;

    function update() {
      ticking = false;
      var vh = window.innerHeight;
      items.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        // Only touch elements near the viewport.
        if (rect.bottom < -200 || rect.top > vh + 200) return;
        var strength = parseFloat(el.getAttribute('data-parallax')) || 0.15;
        // -1 above the fold, +1 below it.
        var progress = (rect.top + rect.height / 2 - vh / 2) / (vh / 2 + rect.height / 2);
        el.style.setProperty('--parallax', (progress * strength * 100).toFixed(2) + 'px');
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  /* ----------------------------------------------------------------------
     Counters
     ---------------------------------------------------------------------- */
  function initCounters() {
    var nodes = document.querySelectorAll('[data-count-to]');
    if (!nodes.length) return;

    function run(el) {
      var target = parseFloat(el.getAttribute('data-count-to'));
      if (isNaN(target)) return;
      if (prefersReduced()) { el.textContent = String(target); return; }

      var duration = 1400;
      var start = null;
      function frame(ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / duration, 1);
        // easeOutExpo
        var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        el.textContent = String(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    if (!('IntersectionObserver' in window)) { nodes.forEach(run); return; }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        run(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    nodes.forEach(function (n) { observer.observe(n); });
  }

  /* ----------------------------------------------------------------------
     Magnetic buttons - desktop pointers only.
     ---------------------------------------------------------------------- */
  function initMagnetic() {
    if (!finePointer.matches || prefersReduced()) return;

    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      var strength = parseFloat(el.getAttribute('data-magnetic')) || 0.25;

      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - (r.left + r.width / 2)) * strength;
        var y = (e.clientY - (r.top + r.height / 2)) * strength;
        el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      });

      el.addEventListener('pointerleave', function () {
        el.style.transform = '';
      });
    });
  }

  /* ----------------------------------------------------------------------
     Back to top
     ---------------------------------------------------------------------- */
  function initToTop() {
    var btn = document.querySelector('[data-to-top]');
    if (!btn) return;

    function onScroll() {
      btn.classList.toggle('is-visible', window.scrollY > window.innerHeight * 0.6);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' });
    });
  }

  /* ----------------------------------------------------------------------
     Sticky add to cart - appears once the real form button scrolls away.
     ---------------------------------------------------------------------- */
  function initStickyAtc() {
    var bar = document.querySelector('[data-sticky-atc]');
    var anchor = document.querySelector('[data-atc-anchor]');
    if (!bar || !anchor) return;

    if (!('IntersectionObserver' in window)) {
      bar.classList.add('is-active');
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        bar.classList.toggle('is-active', !entry.isIntersecting && entry.boundingClientRect.top < 0);
      });
    }, { rootMargin: '0px 0px -100% 0px' });
    observer.observe(anchor);
  }

  /* ----------------------------------------------------------------------
     Image hotspots
     ---------------------------------------------------------------------- */
  function initHotspots() {
    var stage = document.querySelector('[data-hotspot-stage]');
    if (!stage) return;

    var cards = Array.prototype.slice.call(stage.querySelectorAll('[data-hotspot-card]'));

    function closeAll(except) {
      cards.forEach(function (card) {
        if (card === except) return;
        card.classList.remove('is-open');
        var btn = card.querySelector('[data-hotspot-toggle]');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    }

    stage.querySelectorAll('[data-hotspot-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var card = stage.querySelector('#' + btn.getAttribute('aria-controls'));
        if (!card) return;
        var isOpen = card.classList.contains('is-open');
        closeAll(card);
        card.classList.toggle('is-open', !isOpen);
        btn.setAttribute('aria-expanded', String(!isOpen));
      });
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-hotspot-card]') && !e.target.closest('[data-hotspot-toggle]')) closeAll();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll();
    });
  }

  /* ----------------------------------------------------------------------
     Quick view - fetches a product and shows it in the shared drawer.
     ---------------------------------------------------------------------- */
  function initQuickView() {
    var drawer = document.querySelector('[data-drawer="quickview"]');
    var body = drawer && drawer.querySelector('[data-quickview-body]');
    if (!drawer || !body) return;

    function render(product) {
      var featured = product.featured_image
        ? '<img src="' + product.featured_image.replace(/(\\.jpg|\\.png|\\.webp).*$/, '_500x500$1') + '" alt="" width="200" height="250">'
        : '<div class="placeholder-svg" style="aspect-ratio:4/5"></div>';

      var price = product.price;
      if (product.compare_at_price > product.price) {
        price = '<del>' + money(product.compare_at_price) + '</del> <ins>' + money(product.price) + '</ins>';
      } else {
        price = money(product.price);
      }

      body.innerHTML =
        '<div class="quickview__media">' + featured + '</div>' +
        '<div class="quickview__body">' +
          '<h2 class="quickview__title">' + product.title + '</h2>' +
          '<p style="color:var(--color-text-soft); margin-bottom:16px;">' + price + '</p>' +
          '<p style="font-size:.875rem; margin-bottom:16px;">' + stripTags(product.description || '') + '</p>' +
          '<form method="post" action="' + cartAddUrl() + '">' +
            '<input type="hidden" name="id" value="' + (product.variants && product.variants[0] ? product.variants[0].id : '') + '">' +
            '<input type="hidden" name="quantity" value="1">' +
            '<button class="btn btn--primary btn--full" type="submit">Add to cart</button>' +
          '</form>' +
          '<a class="text-link" style="margin-top:16px;" href="' + product.url + '">View full details</a>' +
        '</div>';
    }

    function money(cents) {
      return (window.Currency && window.Currency.format_money)
        ? window.Currency.format_money(cents)
        : '$' + (cents / 100).toFixed(2);
    }
    function stripTags(s) { var d = document.createElement('div'); d.innerHTML = s; return d.textContent.slice(0, 180); }
    function cartAddUrl() {
      return (window.Shopify && window.Shopify.routes && window.Shopify.routes.cart_add_url) || '/cart/add';
    }

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-quickview]');
      if (!trigger) return;
      e.preventDefault();
      var handle = trigger.getAttribute('data-quickview');
      var url = '/products/' + handle + '.js';

      body.innerHTML = '<div class="quickview__body"><p>Loading&hellip;</p></div>';
      drawer.setAttribute('open', '');
      document.documentElement.style.overflow = 'hidden';

      fetch(url, { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(render)
        .catch(function () {
          body.innerHTML = '<div class="quickview__body"><p>Could not load this product.</p></div>';
        });
    });
  }

  /* ----------------------------------------------------------------------
     Predictive search
     ---------------------------------------------------------------------- */
  function initPredictiveSearch() {
    var input = document.querySelector('[data-predictive-input]');
    var out = document.querySelector('[data-predictive-results]');
    if (!input || !out) return;

    var timer = null;
    var lastQuery = '';

    function hide() { out.hidden = true; }

    function render(results, query) {
      if (!results.length) {
        out.innerHTML = '<p style="padding:12px 0; color:var(--color-text-soft);">No results for &ldquo;' + query + '&rdquo;</p>';
        out.hidden = false;
        return;
      }
      var html = '<ul>';
      results.slice(0, 6).forEach(function (item) {
        var img = item.image ? '<img src="' + item.image + '" alt="" width="48" height="48">' : '<span class="placeholder-svg" style="width:48px;height:48px"></span>';
        html +=
          '<li><a class="search-results__item" href="' + item.url + '">' + img +
          '<span><span>' + item.title + '</span><br><small style="color:var(--color-text-mute);">' + (item.vendor || item.type || '') + '</small></span></a></li>';
      });
      html += '</ul>';
      out.innerHTML = html;
      out.hidden = false;
    }

    input.addEventListener('input', function () {
      var query = input.value.trim();
      window.clearTimeout(timer);
      if (query.length < 2 || query === lastQuery) { if (!query) hide(); return; }
      lastQuery = query;
      timer = window.setTimeout(function () {
        var url = '/search/suggest.json?q=' + encodeURIComponent(query) + '&resources[type]=product,query&resources[limit]=6';
        fetch(url, { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var products = (data.resources && data.resources.results && data.resources.results.products) || [];
            var q = data.resources && data.resources.results && data.resources.results.query;
            var items = products.map(function (p) {
              return {
                title: p.title,
                url: p.url,
                vendor: p.vendor,
                image: p.featured_image ? p.featured_image.replace(/(\\.jpg|\\.png|\\.webp).*$/, '_160x.jpg') : null,
              };
            });
            if (q && q.complete && q.complete_query) {
              items.unshift({ title: 'View all results for &ldquo;' + q.complete_query + '&rdquo;', url: '/search?q=' + encodeURIComponent(q.complete_query), type: 'Search' });
            }
            render(items, query);
          })
          .catch(hide);
      }, 260);
    });

    input.addEventListener('blur', function () { window.setTimeout(hide, 180); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  }

  /* ----------------------------------------------------------------------
     Product gallery
     ---------------------------------------------------------------------- */
  function initGallery() {
    var gallery = document.querySelector('[data-gallery]');
    if (!gallery) return;
    var main = gallery.querySelector('[data-gallery-main]');
    var thumbs = gallery.querySelectorAll('[data-gallery-thumb]');
    if (!main) return;

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        var full = thumb.getAttribute('data-full');
        if (full) {
          main.src = full;
          main.srcset = thumb.getAttribute('data-srcset') || '';
        }
        thumbs.forEach(function (t) { t.classList.remove('is-active'); });
        thumb.classList.add('is-active');
      });
    });
  }

  /* ----------------------------------------------------------------------
     Recently viewed
     ---------------------------------------------------------------------- */
  var RECENT_KEY = 'base-recently-viewed';

  function initRecentlyViewed() {
    var mount = document.querySelector('[data-recently-viewed]');
    if (!mount) return;

    function read() {
      try { return JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]'); }
      catch (e) { return []; }
    }

    // Only on a product page, and only once per handle.
    if (document.body.classList.contains('template-product')) {
      var handle = (document.body.getAttribute('data-product-handle') || '').trim();
      if (handle) {
        var items = read().filter(function (h) { return h !== handle; });
        items.unshift(handle);
        try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 6))); } catch (e) { /* ignore */ }
      }
    }

    var handles = read().slice(0, 4);
    if (!handles.length) { mount.closest('[data-recently-section]') && mount.closest('[data-recently-section]').remove(); return; }

    // A predictable endpoint: /recommendations/products.json?product_ids=
    fetch('/collections/all/products.json?limit=250')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.products) return;
        var matched = data.products.filter(function (p) { return handles.indexOf(p.handle) !== -1; }).slice(0, 4);
        if (!matched.length) { var sec = mount.closest('[data-recently-section]'); if (sec) sec.remove(); return; }
        mount.innerHTML = matched.map(function (p) {
          var img = p.featured_image
            ? '<img src="' + p.featured_image.replace(/(\\.jpg|\\.png|\\.webp).*$/, '_400x.jpg') + '" alt="" width="200" height="267" loading="lazy">'
            : '<div class="placeholder-svg" style="aspect-ratio:3/4"></div>';
          return '<div class="card"><a class="card__media" href="' + p.url + '">' + img +
            '</a><div class="card__body"><h3 class="card__title"><a href="' + p.url + '">' + p.title + '</a></h3>' +
            '<span class="card__price">' + (window.Currency && window.Currency.format_money ? window.Currency.format_money(p.price) : '$' + (p.price / 100).toFixed(2)) + '</span></div></div>';
        }).join('');
      })
      .catch(function () { var sec = mount.closest('[data-recently-section]'); if (sec) sec.remove(); });
  }

  /* ----------------------------------------------------------------------
     Boot
     ---------------------------------------------------------------------- */
  function init() {
    initReveals();
    initCards();
    initParallax();
    initCounters();
    initMagnetic();
    initToTop();
    initStickyAtc();
    initHotspots();
    initQuickView();
    initPredictiveSearch();
    initGallery();
    initRecentlyViewed();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // A merchant toggling motion in the editor should see the result live.
  document.addEventListener('shopify:section:load', init);
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener('change', function () { if (!prefersReduced()) init(); });
  }
})();
