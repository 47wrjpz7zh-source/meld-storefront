/* holiday-timer.js -- MELD promo bar
   A REAL countdown to the next upcoming US retail holiday. Replaces the old
   fake daily-reset countdown (which recomputed "midnight tomorrow" every tick
   and so silently reset to ~24h every day). Client-side only, no backend.
   Auto-detects the next holiday (including floating dates), themes the copy,
   and rolls forward on its own when a holiday passes -- including across the
   Dec -> Jan year boundary.

   Also Node-requirable so the date math is unit-tested (holiday-timer.test.mjs).

   TIMEZONE: every date is the visitor's LOCAL time on purpose. This is a
   "counts down on your own clock" bar. Do NOT convert to UTC. */
(function (root) {
  'use strict';

  /* ---- EDITORIAL CONFIG (copy) --------------------------------------------
     Framing is a themed "{Holiday} Sale" + a real-deadline countdown. The
     standing offer below is permanent and truthful; only the theme rolls. */
  var OFFER = 'Buy 2 Get 1 Free';
  var COUNTDOWN_PREFIX = 'Ends in ';        // shown before the ticking clock
  var HIGHLIGHT_WITHIN_DAYS = 7;            // darken the bar in the final week
  /* ------------------------------------------------------------------------ */

  /* ---- date helpers (month0 is 0-based: Jan=0; weekday 0=Sun..6=Sat) ---- */
  function nthWeekday(year, month0, weekday, n) {
    var first = new Date(year, month0, 1);
    var shift = (weekday - first.getDay() + 7) % 7;      // days to the first `weekday`
    return new Date(year, month0, 1 + shift + (n - 1) * 7);
  }
  function lastWeekday(year, month0, weekday) {
    var last = new Date(year, month0 + 1, 0);            // last day of month0
    var shift = (last.getDay() - weekday + 7) % 7;
    return new Date(year, month0, last.getDate() - shift);
  }
  function thanksgiving(year) { return nthWeekday(year, 10, 4, 4); }                 // 4th Thu of Nov
  function blackFriday(year) { return new Date(year, 10, thanksgiving(year).getDate() + 1); }
  function cyberMonday(year) { return new Date(year, 10, thanksgiving(year).getDate() + 4); }
  function fixed(month0, day) { return function (year) { return new Date(year, month0, day); }; }

  /* ---- the US retail calendar (grooming-relevant set) ---- */
  var HOLIDAYS = [
    { id: 'newyear',     label: 'New Year Sale',        date: fixed(0, 1) },
    { id: 'valentines',  label: "Valentine's Day Sale", date: fixed(1, 14) },
    { id: 'presidents',  label: "Presidents' Day Sale", date: function (y) { return nthWeekday(y, 1, 1, 3); } },
    { id: 'memorial',    label: 'Memorial Day Sale',    date: function (y) { return lastWeekday(y, 4, 1); } },
    { id: 'fathers',     label: "Father's Day Sale",    date: function (y) { return nthWeekday(y, 5, 0, 3); } },
    { id: 'july4',       label: 'July 4th Sale',        date: fixed(6, 4) },
    { id: 'labor',       label: 'Labor Day Sale',       date: function (y) { return nthWeekday(y, 8, 1, 1); } },
    { id: 'halloween',   label: 'Halloween Sale',       date: fixed(9, 31) },
    { id: 'veterans',    label: 'Veterans Day Sale',    date: fixed(10, 11) },
    { id: 'blackfriday', label: 'Black Friday Sale',    date: blackFriday },
    { id: 'cybermonday', label: 'Cyber Monday Sale',    date: cyberMonday },
    { id: 'christmas',   label: 'Holiday Sale',         date: fixed(11, 25) }
  ];

  /* deadline = local midnight starting the day AFTER the holiday, so the theme
     persists through the holiday day itself, then rolls. JS Date overflow
     (e.g. Dec 25 -> Dec 26, Oct 31 -> Nov 1) makes day+1 correct across months. */
  function deadlineFor(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  }

  /* nearest holiday whose deadline is still in the future. Builds this year AND
     next year so December correctly rolls into next January. */
  function nextHoliday(now) {
    var y = now.getFullYear();
    var all = [];
    [y, y + 1].forEach(function (yr) {
      HOLIDAYS.forEach(function (h) {
        var d = h.date(yr);
        all.push({ id: h.id, label: h.label, offer: OFFER, date: d, deadline: deadlineFor(d) });
      });
    });
    all.sort(function (a, b) { return a.deadline - b.deadline; });
    for (var i = 0; i < all.length; i++) {
      if (all[i].deadline.getTime() > now.getTime()) return all[i];
    }
    return all[all.length - 1]; // unreachable: next year is always ahead of now
  }

  /* ---- countdown formatting: "Dd HH:MM:SS", days shown only when >= 24h ---- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function format(ms) {
    if (ms < 0) ms = 0;
    var total = Math.floor(ms / 1000);
    var days = Math.floor(total / 86400);
    var clock = pad(Math.floor((total % 86400) / 3600)) + ':' +
                pad(Math.floor((total % 3600) / 60)) + ':' +
                pad(total % 60);
    return days > 0 ? (days + 'd ' + clock) : clock;
  }

  var api = {
    nextHoliday: nextHoliday, nthWeekday: nthWeekday, lastWeekday: lastWeekday,
    thanksgiving: thanksgiving, blackFriday: blackFriday, cyberMonday: cyberMonday,
    deadlineFor: deadlineFor, format: format, HOLIDAYS: HOLIDAYS
  };
  if (root) root.MeldHolidayTimer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ---- DOM wiring (browser only; Node stops above) ---- */
  if (typeof document === 'undefined') return;

  function el(id) { return document.getElementById(id); }
  function render() {
    var now = new Date();
    var hol = nextHoliday(now);
    var remaining = hol.deadline.getTime() - now.getTime();

    var barText = el('promoBarText');
    if (barText) {
      barText.innerHTML = '<strong>' + hol.label + '</strong>' +
        '<span class="promo-offer"> &middot; ' + hol.offer + '</span>';
    }
    var sticky = el('stickyPromoText');
    if (sticky) sticky.textContent = hol.label;

    var cd = el('promoCountdown');
    if (cd) cd.textContent = COUNTDOWN_PREFIX + format(remaining);

    var bar = el('promoBar');
    if (bar) bar.classList.toggle('promo-highlight', remaining <= HIGHLIGHT_WITHIN_DAYS * 86400000);
  }
  function start() { render(); setInterval(render, 1000); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof self !== 'undefined' ? self : this);
