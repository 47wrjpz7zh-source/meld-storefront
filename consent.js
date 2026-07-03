/* ============================================================
   MELD cookie / tracking consent banner
   Self-hosted, no third-party requests. CSP-safe (script-src 'self').
   Geo-aware (timezone-based, no network):
   - EEA/UK (GDPR/ePrivacy = opt-in): Consent Mode v2 default = denied,
     blocking Accept/Decline banner, pixel loads ONLY after Accept.
   - US / rest-of-world (CCPA/CPRA = opt-out) with no GPC: grant by default
     so the pixel fires on load; a slim "Do Not Sell or Share" opt-out bar
     is shown. Global Privacy Control (GPC), if present, forces opt-out.
   - A previously saved choice in localStorage always wins.
   Exposes window.meldConsent + window.meldOnConsent(cb) so the Meta /
   Google pixels load per the resolved consent state.
   (Reminder: pixels also require the CSP allowlist in vercel.json.)
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'meld_consent';
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}

  /* --- Region + GPC detection (timezone-based, zero network) --- */
  function gpcOptOut() {
    try { return navigator.globalPrivacyControl === true; } catch (e) { return false; }
  }
  function isEEA() {
    /* EEA + UK + CH/IS/NO/LI, detected by timezone. Over-including a few
       non-EEA Europe/* zones (e.g. Moscow) is harmless: they just see opt-in. */
    try {
      var tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '');
      if (/^Europe\//.test(tz)) return true;
      if (tz === 'Atlantic/Canary' || tz === 'Atlantic/Reykjavik' ||
          tz === 'Atlantic/Madeira' || tz === 'Atlantic/Azores') return true;
      return false;
    } catch (e) { return false; }
  }
  var region = isEEA() ? 'EEA' : 'US';
  var defaultGrant = (region === 'US') && !gpcOptOut();
  var effective = saved ? saved : (defaultGrant ? 'granted' : 'denied');

  /* --- Google Consent Mode v2 --- */
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
  /* Emit default(denied) first, then update to granted if applicable
     (correct Consent Mode v2 ordering). */
  applyConsent('denied');
  if (effective === 'granted') applyConsent('granted');

  /* --- Public API for marketing/analytics tags --- */
  var listeners = [];
  window.meldConsent = {
    status: saved || (defaultGrant ? 'granted' : 'unset'),
    granted: effective === 'granted'
  };
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
    /* Best-effort stop of an already-loaded pixel on opt-out. */
    if (choice === 'denied' && window.fbq) { try { window.fbq('consent', 'revoke'); } catch (e) {} }
  }

  /* Already chosen: nothing to render (US default-grant is NOT persisted,
     so GPC + future opt-out stay re-evaluable on each load). */
  if (saved === 'granted' || saved === 'denied') return;

  function injectStyles() {
    if (document.getElementById('meld-consent-style')) return;
    var style = document.createElement('style');
    style.id = 'meld-consent-style';
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
  }

  /* EEA / UK: opt-in. Pixel waits for Accept (unchanged behavior). */
  function buildOptIn() {
    injectStyles();
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

  /* US / rest-of-world: NO banner. The pixel fires on load; the footer
     "Do Not Sell My Info" link (/privacy#do-not-sell) plus honoring Global
     Privacy Control cover CCPA/CPRA opt-out without an intrusive banner. */
  if (region !== 'EEA') return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildOptIn);
  } else {
    buildOptIn();
  }
})();
