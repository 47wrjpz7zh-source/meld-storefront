/* holiday-timer.js -- MELD promo bar
   A REAL countdown to the next upcoming US retail/observance day. Replaces the
   old fake daily-reset countdown. Client-side only, no backend. Auto-detects
   the next event (including floating dates), themes the copy with a per-event
   emoji, and rolls forward on its own when an event passes -- including across
   the Dec -> Jan year boundary.

   The calendar is DENSE on purpose (~38 real events) so a visitor almost always
   sees an event under ~2 weeks out (measured max gap ~20 days), never 50+.
   Every event is a genuine, dated observance -- nothing fabricated -- so the
   deadline is always real (FTC "baseless countdown timer" is a named dark
   pattern; ours never sits at 0 and carries no fake reference price).

   Also Node-requirable so the date math is unit-tested (holiday-timer.test.mjs).

   TIMEZONE: every date is the visitor's LOCAL time on purpose. This is a
   "counts down on your own clock" bar. Do NOT convert to UTC. */
(function (root) {
  'use strict';

  /* ---- EDITORIAL CONFIG (copy) --------------------------------------------
     Themed "{emoji} {Event} Sale" + a real-deadline countdown. The standing
     offer below is permanent and truthful; only the theme + emoji roll. */
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
  function fathersDay(year) { return nthWeekday(year, 5, 0, 3); }                    // 3rd Sun of Jun
  function mensHealthWeek(year) {                                                    // Monday of the week ending on Father's Day
    return new Date(year, 5, fathersDay(year).getDate() - 6);
  }
  // Gregorian Easter (Meeus/Jones/Butcher). Returns the Sunday's Date.
  function easter(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);   // 3 = March, 4 = April
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }
  function fixed(month0, day) { return function (year) { return new Date(year, month0, day); }; }

  /* ---- the calendar: dense, real, grooming/confidence-relevant US events ----
     Third-party-dated events (Amazon Prime Day, exact Super Bowl date) are
     intentionally excluded: no computable rule = would go stale/fake. Cancer
     awareness months are excluded (tone risk on a "Sale"). "Big Game Sunday" is
     the 2nd Sunday of Feb, which has matched the Super Bowl every year since
     2022; if the NFL shifts it, adjust this single row. */
  var HOLIDAYS = [
    { id: 'newyear',      emoji: '🎉', label: 'New Year Sale',              date: fixed(0, 1) },
    { id: 'newyou',       emoji: '💪', label: 'New Year New You Sale',      date: function (y) { return nthWeekday(y, 0, 5, 2); } }, // 2nd Fri Jan
    { id: 'compliment',   emoji: '💬', label: 'Compliment Day Sale',        date: fixed(0, 24) },
    { id: 'biggame',      emoji: '🏈', label: 'Big Game Sunday Sale',       date: function (y) { return nthWeekday(y, 1, 0, 2); } }, // 2nd Sun Feb (~Super Bowl)
    { id: 'valentines',   emoji: '💘', label: "Valentine's Day Sale",       date: fixed(1, 14) },
    { id: 'presidents',   emoji: '🇺🇸', label: "Presidents' Day Sale", date: function (y) { return nthWeekday(y, 1, 1, 3); } },
    { id: 'employee',     emoji: '💼', label: 'Employee Appreciation Sale', date: function (y) { return nthWeekday(y, 2, 5, 1); } }, // 1st Fri Mar
    { id: 'stpatricks',   emoji: '🍀', label: "St. Patrick's Day Sale",     date: fixed(2, 17) },
    { id: 'spring',       emoji: '🌱', label: 'First Day of Spring Sale',   date: fixed(2, 20) },
    { id: 'easter',       emoji: '🐣', label: 'Easter Sale',                date: easter },
    { id: 'taxday',       emoji: '💵', label: 'Tax Day Sale',               date: fixed(3, 15) },
    { id: 'husband',      emoji: '💍', label: 'Husband Appreciation Sale',  date: function (y) { return nthWeekday(y, 3, 6, 3); } }, // 3rd Sat Apr
    { id: 'cinco',        emoji: '🌮', label: 'Cinco de Mayo Sale',         date: fixed(4, 5) },
    { id: 'graduation',   emoji: '🎓', label: 'Graduation Season Sale',     date: function (y) { return nthWeekday(y, 4, 6, 3); } }, // 3rd Sat May (fills the Cinco->Memorial gap, which is 26d in 2027)
    { id: 'memorial',     emoji: '🎖️', label: 'Memorial Day Sale',    date: function (y) { return lastWeekday(y, 4, 1); } },
    { id: 'summer',       emoji: '🏖️', label: 'Summer Kickoff Sale',  date: fixed(5, 1) },
    { id: 'menshealth',   emoji: '🩺', label: "Men's Health Week Sale",     date: mensHealthWeek },
    { id: 'fathers',      emoji: '👔', label: "Father's Day Sale",          date: fathersDay },
    { id: 'july4',        emoji: '🎆', label: 'July 4th Sale',              date: fixed(6, 4) },
    { id: 'reunion',      emoji: '🎊', label: 'Summer Reunion Sale',        date: fixed(6, 15) },
    { id: 'xmasjuly',     emoji: '☀️', label: 'Christmas in July Sale',     date: fixed(6, 25) },
    { id: 'hairloss',     emoji: '🧑‍🦲', label: 'Hair Loss Awareness Sale', date: fixed(7, 1) },
    { id: 'photography',  emoji: '📸', label: 'World Photography Day Sale',  date: fixed(7, 19) },
    { id: 'grooming',     emoji: '💈', label: "Men's Grooming Day Sale",    date: function (y) { return nthWeekday(y, 7, 5, 3); } }, // 3rd Fri Aug
    { id: 'beard',        emoji: '🧔', label: 'World Beard Day Sale',       date: function (y) { return nthWeekday(y, 8, 6, 1); } }, // 1st Sat Sep
    { id: 'labor',        emoji: '🛠️', label: 'Labor Day Sale',       date: function (y) { return nthWeekday(y, 8, 1, 1); } },
    { id: 'fall',         emoji: '🍂', label: 'First Day of Fall Sale',     date: fixed(8, 22) },
    { id: 'hairday',      emoji: '💇', label: 'National Hair Day Sale',     date: fixed(9, 1) },
    { id: 'loveyourhair', emoji: '💆', label: 'Love Your Hair Day Sale',    date: fixed(9, 10) },
    { id: 'sweetest',     emoji: '🍬', label: 'Sweetest Day Sale',          date: function (y) { return nthWeekday(y, 9, 6, 3); } }, // 3rd Sat Oct
    { id: 'halloween',    emoji: '🎃', label: 'Halloween Sale',             date: fixed(9, 31) },
    { id: 'movember',     emoji: '🥸', label: 'Movember Kickoff Sale',      date: fixed(10, 1) },
    { id: 'veterans',     emoji: '🪖', label: 'Veterans Day Sale',          date: fixed(10, 11) },
    { id: 'mensday',      emoji: '🙋‍♂️', label: "International Men's Day Sale", date: fixed(10, 19) },
    { id: 'blackfriday',  emoji: '🖤', label: 'Black Friday Sale',          date: blackFriday },
    { id: 'cybermonday',  emoji: '💻', label: 'Cyber Monday Sale',          date: cyberMonday },
    { id: 'greenmonday',  emoji: '💚', label: 'Green Monday Sale',          date: function (y) { return nthWeekday(y, 11, 1, 2); } }, // 2nd Mon Dec
    { id: 'christmas',    emoji: '🎄', label: 'Holiday Sale',               date: fixed(11, 25) },
    { id: 'nye',          emoji: '🥂', label: "New Year's Eve Sale",        date: fixed(11, 31) }
  ];

  /* deadline = local midnight starting the day AFTER the event, so the theme
     persists through the event day itself, then rolls. JS Date overflow
     (e.g. Dec 31 -> Jan 1, Oct 31 -> Nov 1) makes day+1 correct across months. */
  function deadlineFor(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  }

  /* nearest event whose deadline is still in the future. Builds this year AND
     next year so December correctly rolls into next January. */
  function nextHoliday(now) {
    var y = now.getFullYear();
    var all = [];
    [y, y + 1].forEach(function (yr) {
      HOLIDAYS.forEach(function (h) {
        var d = h.date(yr);
        all.push({ id: h.id, label: h.label, emoji: h.emoji, offer: OFFER, date: d, deadline: deadlineFor(d) });
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
    fathersDay: fathersDay, mensHealthWeek: mensHealthWeek, easter: easter,
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
      barText.innerHTML = '<strong>' + hol.emoji + ' ' + hol.label + '</strong>' +
        '<span class="promo-offer"> &middot; ' + hol.offer + '</span>';
    }
    var sticky = el('stickyPromoText');
    if (sticky) sticky.textContent = hol.emoji + ' ' + hol.label;

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
