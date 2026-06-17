/* ============================================================
   MELD cookie / tracking consent banner
   Self-hosted, no third-party requests. CSP-safe (script-src 'self').
   - Sets Google Consent Mode v2 DEFAULT = denied before any tag loads.
   - Persists choice in localStorage ('meld_consent' = 'granted' | 'denied').
   - Exposes window.meldConsent + window.meldOnConsent(cb) so the
     Phase 6 Meta / Google pixels load ONLY after explicit consent.
     (Reminder: adding those pixels also requires extending the CSP
      allowlist in vercel.json, or they will be blocked.)
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'meld_consent';
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}

  /* --- Google Consent Mode v2 default: denied until granted --- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  function applyConsent(state) {
    var v = state === 'granted' ? 'granted' : 'denied';
    gtag('consent', state === 'granted' ? 'update' : 'default', {
      ad_storage: v,
      ad_user_data: v,
      ad_personalization: v,
      analytics_storage: v
    });
  }
  applyConsent(saved === 'granted' ? 'granted' : 'denied');

  /* --- Public API for Phase 6 marketing/analytics tags --- */
  var listeners = [];
  window.meldConsent = { status: saved || 'unset', granted: saved === 'granted' };
  window.meldOnConsent = function (cb) {
    if (window.meldConsent.granted) { try { cb(); } catch (e) {} }
    else { listeners.push(cb); }
  };
  function fireGranted() {
    listeners.splice(0).forEach(function (cb) { try { cb(); } catch (e) {} });
  }

  function persist(choice) {
    try { localStorage.setItem(KEY, choice); } catch (e) {}
    window.meldConsent = { status: choice, granted: choice === 'granted' };
    applyConsent(choice);
    if (choice === 'granted') fireGranted();
  }

  /* Already chosen: nothing to render. */
  if (saved === 'granted' || saved === 'denied') return;

  function build() {
    var style = document.createElement('style');
    style.textContent =
      '.meld-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;' +
      'max-width:880px;margin:0 auto;background:#1A1A1A;color:#E8E8E8;' +
      'border:1px solid rgba(232,232,232,0.14);border-radius:12px;' +
      'box-shadow:0 8px 28px rgba(0,0,0,0.35);padding:18px 20px;' +
      'display:flex;gap:18px;align-items:center;flex-wrap:wrap;' +
      "font-family:'IBM Plex Mono','Courier New',monospace;}" +
      '.meld-consent p{margin:0;flex:1 1 360px;font-size:13px;line-height:1.6;color:#BDBDBD;}' +
      '.meld-consent a{color:#E8E8E8;text-decoration:underline;}' +
      '.meld-consent-btns{display:flex;gap:10px;flex:0 0 auto;}' +
      '.meld-consent button{font-family:inherit;font-size:13px;letter-spacing:0.04em;' +
      'border:none;border-radius:8px;padding:10px 18px;cursor:pointer;}' +
      '.meld-consent .accept{background:#B2321E;color:#fff;}' +
      '.meld-consent .accept:hover{background:#C5391F;}' +
      '.meld-consent .decline{background:transparent;color:#BDBDBD;border:1px solid rgba(232,232,232,0.22);}' +
      '.meld-consent .decline:hover{color:#fff;}' +
      '@media(max-width:560px){.meld-consent-btns{flex:1 1 100%;}.meld-consent button{flex:1;}}';
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.className = 'meld-consent';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-label', 'Cookie and tracking consent');
    bar.innerHTML =
      '<p>We use cookies to run this store and, only with your consent, to measure and ' +
      'improve our ads. See our <a href="/privacy">Privacy Policy</a> or ' +
      '<a href="/privacy#do-not-sell">do not sell or share my info</a>.</p>' +
      '<div class="meld-consent-btns">' +
      '<button type="button" class="decline">Decline</button>' +
      '<button type="button" class="accept">Accept</button>' +
      '</div>';
    document.body.appendChild(bar);

    bar.querySelector('.accept').addEventListener('click', function () {
      persist('granted'); bar.remove();
    });
    bar.querySelector('.decline').addEventListener('click', function () {
      persist('denied'); bar.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
