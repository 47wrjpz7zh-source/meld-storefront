/* ============================================================
   MELD exit-intent email-capture popup (10% off).
   - Self-contained: injects its own styles + DOM, no dependencies.
   - Desktop trigger: mouse leaves the viewport toward the top (exit intent).
   - Mobile trigger: 25s dwell OR a fast scroll back toward the top.
   - Shows once per FREQUENCY_DAYS (localStorage), never again after convert.
   - On submit: POSTs the email to the MELD subscribe webhook (W5), then
     reveals the discount code. Capture is best-effort: if the webhook is
     down (W5 still INACTIVE) the user still gets the code; the email is
     also cached locally as a fallback so nothing is lost.

   GATE (Daniel): the code DISCOUNT_CODE below must exist as a real 10%-off
   discount in Shopify Admin > Discounts. Until then it is a placeholder.
   The capture only lands in Supabase + fires the welcome series once the
   W5 "New Subscriber Welcome" n8n workflow is ACTIVATED (go-token).

   DISABLED 2026-07-28. The gate above was never met and then went stale:
   MELD10 exists in Shopify but its status is EXPIRED (ended 2026-07-14), so
   checkout REJECTS it. The popup was live on the homepage, promising leaving
   visitors 10% off with a code that cannot be redeemed. Turned off at the
   ENABLED flag below rather than by deleting the script, so re-enabling is a
   single-word edit once a real, live 10% discount exists in Shopify.
   ============================================================ */
(function () {
  'use strict';

  /* ---- KILL SWITCH (2026-07-28) ----
     Flip to true ONLY after a live (not expired) 10% discount matching
     DISCOUNT_CODE exists in Shopify Admin > Discounts. Nothing else needs
     to change: the whole popup is inert while this is false. */
  var ENABLED = false;
  if (!ENABLED) return;

  var SUBSCRIBE_URL  = 'https://mysticstudio.app.n8n.cloud/webhook/meld/subscribe';
  var DISCOUNT_CODE  = 'MELD10';          // <-- must match a real 10% Shopify discount
  var FREQUENCY_DAYS = 14;
  var SEEN_KEY       = 'meld_exit_popup_seen';
  var DONE_KEY       = 'meld_exit_popup_converted';
  var FALLBACK_KEY   = 'meld_exit_popup_emails';

  function now() { return new Date().getTime(); }
  function seenRecently() {
    try {
      if (localStorage.getItem(DONE_KEY)) return true;
      var t = parseInt(localStorage.getItem(SEEN_KEY) || '0', 10);
      return t && (now() - t) < FREQUENCY_DAYS * 864e5;
    } catch (e) { return false; }
  }
  function markSeen() { try { localStorage.setItem(SEEN_KEY, String(now())); } catch (e) {} }
  function markDone() { try { localStorage.setItem(DONE_KEY, '1'); } catch (e) {} }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function injectStyles() {
    var css =
      '.meld-eip-overlay{position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(20,16,14,0.62);opacity:0;transition:opacity .28s ease;padding:20px;}' +
      '.meld-eip-overlay.open{opacity:1;}' +
      '.meld-eip-card{position:relative;width:100%;max-width:430px;background:#F7F4EF;border:1px solid rgba(26,26,26,0.12);' +
      'border-radius:14px;box-shadow:0 18px 60px rgba(20,16,14,0.32);padding:40px 34px 32px;' +
      'transform:translateY(14px);transition:transform .28s ease;font-family:Georgia,"Times New Roman",serif;}' +
      '.meld-eip-overlay.open .meld-eip-card{transform:translateY(0);}' +
      '.meld-eip-close{position:absolute;top:14px;right:16px;background:none;border:none;font-size:20px;line-height:1;' +
      'color:rgba(26,26,26,0.45);cursor:pointer;padding:4px;}' +
      '.meld-eip-kicker{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.2em;' +
      'text-transform:uppercase;color:#B2321E;margin:0 0 14px;}' +
      '.meld-eip-head{font-size:25px;line-height:1.2;font-weight:600;color:#1A1A1A;margin:0 0 10px;}' +
      '.meld-eip-sub{font-size:14px;line-height:1.6;color:rgba(26,26,26,0.7);margin:0 0 22px;}' +
      '.meld-eip-form{display:flex;flex-direction:column;gap:12px;}' +
      '.meld-eip-input{height:50px;border:1px solid rgba(26,26,26,0.22);border-radius:8px;padding:0 16px;font-size:15px;' +
      'font-family:Georgia,serif;background:#fff;color:#1A1A1A;width:100%;box-sizing:border-box;}' +
      '.meld-eip-input:focus{outline:none;border-color:#B2321E;}' +
      '.meld-eip-btn{height:52px;border:none;border-radius:8px;background:#B2321E;color:#F7F4EF;cursor:pointer;' +
      'font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:14px;letter-spacing:.05em;font-weight:500;}' +
      '.meld-eip-btn:disabled{opacity:.6;cursor:default;}' +
      '.meld-eip-fine{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:10px;line-height:1.6;' +
      'color:rgba(26,26,26,0.45);margin:14px 0 0;text-align:center;}' +
      '.meld-eip-err{color:#B2321E;font-size:12px;margin:2px 0 0;min-height:14px;}' +
      '.meld-eip-code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:22px;letter-spacing:.14em;' +
      'color:#1A1A1A;background:#fff;border:1px dashed #B2321E;border-radius:8px;padding:16px;text-align:center;margin:6px 0 4px;}' +
      '.meld-eip-shop{display:inline-flex;align-items:center;justify-content:center;height:50px;width:100%;margin-top:14px;' +
      'background:#1A1A1A;color:#F7F4EF;border-radius:8px;text-decoration:none;' +
      'font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:14px;letter-spacing:.05em;}';
    var s = document.createElement('style');
    s.setAttribute('data-meld-eip', '');
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
  }

  function build() {
    var overlay = document.createElement('div');
    overlay.className = 'meld-eip-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '10 percent off your first order');
    overlay.innerHTML =
      '<div class="meld-eip-card">' +
        '<button class="meld-eip-close" aria-label="Close">&times;</button>' +
        '<div class="meld-eip-step1">' +
          '<p class="meld-eip-kicker">// Before you go</p>' +
          '<h2 class="meld-eip-head">Take 10% off your first order.</h2>' +
          '<p class="meld-eip-sub">Drop your email and we will send your code, plus a quick shade-match guide so you order the right one the first time.</p>' +
          '<form class="meld-eip-form" novalidate>' +
            '<input class="meld-eip-input" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" aria-label="Email address" required>' +
            '<p class="meld-eip-err" aria-live="polite"></p>' +
            '<button class="meld-eip-btn" type="submit">Reveal my code</button>' +
          '</form>' +
          '<p class="meld-eip-fine">No spam. Unsubscribe anytime. Discreet billing and shipping.</p>' +
        '</div>' +
        '<div class="meld-eip-step2" style="display:none;">' +
          '<p class="meld-eip-kicker">// You are in</p>' +
          '<h2 class="meld-eip-head">Here is your 10% code.</h2>' +
          '<p class="meld-eip-sub">Apply it at checkout. Works on every shade and bundle.</p>' +
          '<div class="meld-eip-code">' + DISCOUNT_CODE + '</div>' +
          '<a class="meld-eip-shop" href="#buybox">Shop now</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function cacheEmail(email) {
    try {
      var arr = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
      arr.push({ email: email, at: now() });
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function submitEmail(email) {
    // Best-effort capture. keepalive so it survives the page unload path.
    try {
      return fetch(SUBSCRIBE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'exit_intent_popup' }),
        keepalive: true
      }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (seenRecently()) return;
    injectStyles();
    var overlay = build();
    var card    = overlay.querySelector('.meld-eip-card');
    var step1   = overlay.querySelector('.meld-eip-step1');
    var step2   = overlay.querySelector('.meld-eip-step2');
    var form    = overlay.querySelector('.meld-eip-form');
    var input   = overlay.querySelector('.meld-eip-input');
    var errEl   = overlay.querySelector('.meld-eip-err');
    var btn     = overlay.querySelector('.meld-eip-btn');
    var shown   = false;

    function open() {
      if (shown) return;
      shown = true;
      markSeen();
      overlay.classList.add('open');
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 320);
    }
    function close() {
      overlay.classList.remove('open');
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
      teardown();
    }

    overlay.querySelector('.meld-eip-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function escH(e) { if (e.key === 'Escape' && shown) close(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (input.value || '').trim().toLowerCase();
      if (!validEmail(email)) { errEl.textContent = 'Please enter a valid email.'; return; }
      errEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Sending...';
      cacheEmail(email);
      submitEmail(email);
      markDone();
      step1.style.display = 'none';
      step2.style.display = 'block';
    });

    // Shopping-cart shade carries through naturally; the Shop now link just
    // scrolls to the buy box where the existing checkout wiring takes over.
    overlay.querySelector('.meld-eip-shop').addEventListener('click', function () {
      setTimeout(close, 60);
    });

    // ---- Triggers ----
    function onMouseOut(e) {
      if (e.clientY <= 0 && (!e.relatedTarget && !e.toElement)) open();
    }
    var mobileTimer = setTimeout(function () {
      if (window.matchMedia && window.matchMedia('(max-width:760px)').matches) open();
    }, 25000);
    var lastY = window.pageYOffset, scrollH;
    function onScroll() {
      var y = window.pageYOffset;
      if (y < lastY - 40 && y < 600) open();   // fast scroll-up near the top
      lastY = y;
    }
    document.addEventListener('mouseout', onMouseOut);
    window.addEventListener('scroll', onScroll, { passive: true });

    function teardown() {
      document.removeEventListener('mouseout', onMouseOut);
      window.removeEventListener('scroll', onScroll);
      clearTimeout(mobileTimer);
    }
  });
})();
