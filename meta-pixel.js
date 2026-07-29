/* ============================================================
   MELD Meta Pixel loader — consent-gated, CSP-safe.
   - Self-hosted (served from 'self'), so it passes script-src 'self'.
   - Loads the Meta Pixel ONLY after the visitor clicks Accept,
     via window.meldOnConsent(cb) defined in consent.js.
   - The actual fbevents.js loads from connect.facebook.net, which is
     why vercel.json must allowlist Facebook domains (see staged vercel.json).
   - Load this AFTER consent.js, both with `defer`, so consent.js runs first:
       <script src="/consent.js"    defer></script>
       <script src="/meta-pixel.js" defer></script>
   - Pixel ID is set below (1734219527777672), confirmed live 2026-06-25.

   Phase 1.5 (2026-06-20, T5): real selectors wired from the live
   index.html checkout layer. ViewContent on PDP load, InitiateCheckout on
   every buy CTA, and cross-domain attribution (fbclid/_fbc/_fbp) appended
   to the Shopify cart URL so the purchase on shop.meldhair.com can be
   matched back. Purchase itself fires server-side via Shopify CAPI
   (Admin > Facebook & Instagram > Data Sharing = Maximum), not here.
   STAGED ONLY. Not pushed. One-line integration point flagged in the runbook.
   ============================================================ */
(function () {
  'use strict';

  var PIXEL_ID    = '1734219527777672'; // "Meld Hair's pixel" — set 2026-06-25
  var SHOP_DOMAIN = 'shop.meldhair.com';
  var CURRENCY    = 'USD';

  /* Buy CTAs that hand off to the Shopify cart.
     - The three IDs are index.html's checkout wiring (unchanged).
     - [data-meld-checkout] is the generic hook. Any page can mark a buy CTA
       with that attribute and it is tracked, with no new IDs added here.
       Added 2026-07-28: the 5 SEO sub-pages use their own IDs (railCta,
       inlineCta1/2, finalCta, stickyCta), so an ID list could never match
       them and InitiateCheckout never fired on any sub-page. */
  var CTA_SELECTORS = '#ctaBtn, #stickyCtaBtn, #orderCtaBtn, .nav-cart, [data-meld-checkout]';

  // Plan -> price + variant map (mirror of index.html VARIANT_MAP / variant-ids.json).
  // KEEP IN SYNC: index.html VARIANT_MAP, variant-ids.json, and the 5 comparison
  // sub-pages' B2G1_BLACK. Phase 21 (2026-07-16) moved B2G1 to a separate
  // fixed-bundle product (15185853677936); the old bundle variants are DELETED and
  // their cart permalinks now return HTTP 410.
  var PLAN_PRICE = { a: 59, b: 35 }; // a = Buy 2 Get 1 Free (default), b = 1 jar
  var VARIANT_MAP = {
    a: { 'Black':'54044216263024','Dark Brown':'54044216295792','Light Brown':'54044216328560','Blonde':'54044216361328' },
    b: { 'Black':'53739434803568','Dark Brown':'53739434967408','Light Brown':'53739435000176','Blonde':'53739435032944' }
  };

  function currentPlan() {
    var pb = document.querySelector('.plan-btn.selected');
    return (pb && pb.dataset.plan) ? pb.dataset.plan : 'a';
  }
  function currentShade() {
    var sw = document.querySelector('.color-swatch.active');
    return (sw && sw.dataset.name) ? sw.dataset.name : 'Black';
  }
  function currentVariantId() {
    var p = currentPlan(), s = currentShade();
    return (VARIANT_MAP[p] && VARIANT_MAP[p][s]) || null;
  }
  function getCookie(name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? decodeURIComponent(m.pop()) : '';
  }
  function getQueryParam(name) {
    try { return new URLSearchParams(window.location.search).get(name) || ''; }
    catch (e) { return ''; }
  }

  /* Cross-domain bridge: append fbclid + _fbc + _fbp to the Shopify cart URL.
     Exposed globally so index.html's goToCheckout() can decorate its redirect.
     Integration (one line, applied at push time per the runbook):
       window.location.href = window.meldDecorateCheckout
         ? window.meldDecorateCheckout(url) : url;                               */
  window.meldDecorateCheckout = function (url) {
    if (!url || url.indexOf(SHOP_DOMAIN) === -1) return url;
    var parts = [];
    var fbclid = getQueryParam('fbclid');
    var fbc = getCookie('_fbc');
    var fbp = getCookie('_fbp');
    if (fbclid) parts.push('fbclid=' + encodeURIComponent(fbclid));
    if (fbc)    parts.push('_fbc=' + encodeURIComponent(fbc));
    if (fbp)    parts.push('_fbp=' + encodeURIComponent(fbp));
    if (!parts.length) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + parts.join('&');
  };

  function initPixel() {
    if (window.fbq) return; // already initialized
    /* Standard Meta fbevents.js loader */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', PIXEL_ID);   // add { em: '<hashed_email>' } here for Advanced Matching when known
    fbq('track', 'PageView');

    /* ViewContent on the product page (index.html is the PDP). */
    var vid = currentVariantId();
    fbq('track', 'ViewContent', {
      content_ids: vid ? [vid] : [],
      content_type: 'product',
      content_name: 'MELD Hair Density Filler',
      value: PLAN_PRICE[currentPlan()] || 59,
      currency: CURRENCY
    });

    /* InitiateCheckout on any buy CTA that hands off to Shopify.
       Delegated on `document` in the CAPTURE phase, not bound per element, for
       two reasons:
         1. The sub-pages' own handlers call window.location.href on click. A
            listener on the element itself races that navigation. A capture
            listener on an ancestor always runs first, so the event is sent
            before the page starts unloading.
         2. It matches CTAs added after consent, and needs no re-binding. */
    var lastEl = null, lastAt = 0;
    function trackInitiateCheckout(el) {
      var t = new Date().getTime();
      if (el === lastEl && (t - lastAt) < 800) return; // keydown+click on one CTA = one event
      lastEl = el; lastAt = t;
      var v = currentVariantId();
      fbq('track', 'InitiateCheckout', {
        content_ids: v ? [v] : [],
        content_type: 'product',
        value: PLAN_PRICE[currentPlan()] || 59,
        currency: CURRENCY,
        num_items: currentPlan() === 'a' ? 3 : 1
      });
    }
    function matchCta(node) {
      if (!node || typeof node.closest !== 'function') return null;
      try { return node.closest(CTA_SELECTORS); } catch (e) { return null; }
    }
    document.addEventListener('click', function (e) {
      var el = matchCta(e.target);
      if (el) trackInitiateCheckout(el);
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var el = matchCta(e.target);
      if (el) trackInitiateCheckout(el);
    }, true);
    /* NOTE: Purchase is NOT fired here. It fires server-side via Shopify CAPI
       on the checkout domain. The decorateCheckout bridge above carries
       fbclid/_fbc/_fbp across so CAPI can match the event to this session. */
  }

  if (typeof window.meldOnConsent === 'function') {
    window.meldOnConsent(initPixel);
  } else {
    /* Defensive: with correct defer order consent.js runs first and this branch
       won't fire. Kept so a load-order slip fails safe instead of erroring. */
    document.addEventListener('DOMContentLoaded', function () {
      if (typeof window.meldOnConsent === 'function') window.meldOnConsent(initPixel);
    });
  }
})();
