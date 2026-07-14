/* MELD cart drawer.
 *
 * Why this exists: every CTA used to hard-navigate a cold stranger straight into
 * Shopify's payment form on another domain. 19 people added to cart, 81 loaded the
 * checkout, and ZERO ever reached a card field. They were never blocked. They looked
 * at a payment form 40 seconds after meeting the brand and refused.
 *
 * Mechanism note (do not "fix" this back to the Ajax Cart API): Shopify's /cart/*.js
 * endpoints send NO CORS headers, so a drawer on meldhair.com can never read them.
 * Verified live 2026-07-14. Cart state therefore lives in localStorage here, and we
 * only hand off to Shopify when the buyer explicitly chooses to pay.
 *
 * The handoff appends ?skip_shop_pay=true. Without it, the cart permalink 302s through
 * shop.app (a THIRD domain) before landing back on shop.meldhair.com. Verified.
 */
(function () {
  'use strict';

  var KEY = 'meld_cart_v1';
  var cfg = window.MELD_SHOP;
  if (!cfg) return;

  function read() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY));
      return (c && c.plan && c.shade && c.qty > 0) ? c : null;
    } catch (e) { return null; }
  }
  function write(c) {
    try { c ? localStorage.setItem(KEY, JSON.stringify(c)) : localStorage.removeItem(KEY); }
    catch (e) { /* private mode: drawer still works for this pageview */ }
    paintCount();
  }

  function plan(p) { return cfg.plans[p] || cfg.plans.b; }
  function lineTotal(c) { return plan(c.plan).price * c.qty; }

  /* ---------- nav count ---------- */
  function paintCount() {
    var c = read();
    var n = c ? c.qty : 0;
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = 'Cart (' + n + ')';
    });
  }

  /* ---------- drawer ---------- */
  var root;
  function build() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'meld-cart';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML =
      '<div class="meld-cart-scrim" data-cart-close></div>' +
      '<aside class="meld-cart-panel" role="dialog" aria-modal="true" aria-label="Your cart">' +
        '<header class="meld-cart-head">' +
          '<span class="meld-cart-title">Your cart</span>' +
          '<button class="meld-cart-x" data-cart-close aria-label="Close cart">&times;</button>' +
        '</header>' +
        '<div class="meld-cart-body"></div>' +
        '<footer class="meld-cart-foot">' +
          '<ul class="meld-cart-trust">' +
            '<li>60-day money-back guarantee</li>' +
            '<li>FREE shipping, all 50 states</li>' +
            '<li>Wrong shade? We swap it free</li>' +
          '</ul>' +
          '<button class="meld-cart-go" type="button">Checkout</button>' +
          '<button class="meld-cart-keep" type="button" data-cart-close>Keep shopping</button>' +
        '</footer>' +
      '</aside>';
    document.body.appendChild(root);

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-cart-close]')) close();
    });
    root.querySelector('.meld-cart-go').addEventListener('click', checkout);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('open')) close();
    });
    return root;
  }

  function paint() {
    var body = build().querySelector('.meld-cart-body');
    var c = read();

    if (!c) {
      body.innerHTML = '<p class="meld-cart-empty">Your cart is empty.</p>';
      build().querySelector('.meld-cart-foot').style.display = 'none';
      return;
    }
    build().querySelector('.meld-cart-foot').style.display = '';

    var p = plan(c.plan);
    body.innerHTML =
      '<div class="meld-cart-item">' +
        '<img class="meld-cart-img" src="' + cfg.image + '" alt="" width="72" height="72">' +
        '<div class="meld-cart-info">' +
          '<span class="meld-cart-name">MELD Hair Density Filler</span>' +
          '<span class="meld-cart-meta">' + c.shade + '</span>' +
          '<span class="meld-cart-meta">' + p.label + '</span>' +
          '<span class="meld-cart-meta meld-cart-weight">' + p.jars + ' &times; 4g / 0.14oz</span>' +
        '</div>' +
        '<div class="meld-cart-qty">' +
          '<button type="button" data-q="-1" aria-label="Decrease quantity">&minus;</button>' +
          '<span>' + c.qty + '</span>' +
          '<button type="button" data-q="1" aria-label="Increase quantity">+</button>' +
        '</div>' +
      '</div>' +
      '<div class="meld-cart-sum">' +
        '<span>Subtotal</span>' +
        '<span class="meld-cart-total">$' + lineTotal(c) + '</span>' +
      '</div>' +
      '<p class="meld-cart-ship">Shipping: <strong>FREE</strong></p>';

    body.querySelectorAll('[data-q]').forEach(function (b) {
      b.addEventListener('click', function () {
        var cur = read(); if (!cur) return;
        cur.qty = Math.max(0, cur.qty + parseInt(b.dataset.q, 10));
        write(cur.qty === 0 ? null : cur);
        paint();
      });
    });
  }

  function open() { build(); paint(); root.classList.add('open'); root.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
  function close() { if (!root) return; root.classList.remove('open'); root.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }

  function add(planKey, shade) {
    var p = planKey || cfg.currentPlan();
    var s = shade || cfg.currentShade();
    var cur = read();
    if (cur && cur.plan === p && cur.shade === s) cur.qty += 1;
    else cur = { plan: p, shade: s, qty: 1 };
    write(cur);
    open();
  }

  function checkout() {
    var c = read(); if (!c) return;
    var vid = cfg.variantMap[c.plan] && cfg.variantMap[c.plan][c.shade];
    if (!vid) { alert('Sorry, that shade is unavailable. Please pick another.'); return; }
    // skip_shop_pay avoids a 302 bounce through shop.app, a third domain the buyer never chose.
    var url = 'https://' + cfg.domain + '/cart/' + vid + ':' + c.qty + '?skip_shop_pay=true';
    if (window.meldDecorateCheckout) url = window.meldDecorateCheckout(url);
    window.location.href = url;
  }

  window.MELDCart = { add: add, open: open, close: close, count: function () { var c = read(); return c ? c.qty : 0; } };

  if (document.readyState !== 'loading') paintCount();
  else document.addEventListener('DOMContentLoaded', paintCount);
})();
