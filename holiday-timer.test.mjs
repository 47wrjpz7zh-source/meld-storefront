/* Unit test for holiday-timer.js -- run: node holiday-timer.test.mjs
   Proves the floating-date math, the year-boundary rollover, the countdown
   format boundary, that every event has an emoji, and (the real point of the
   dense calendar) that the max gap between consecutive events stays small so
   the countdown is never far out. Exits non-zero on any failure. */
import t from './holiday-timer.js';

let fails = 0;
function eq(actual, expected, msg) {
  const a = String(actual), e = String(expected);
  if (a !== e) { console.error(`FAIL ${msg}\n  expected: ${e}\n  got:      ${a}`); fails++; }
  else { console.log(`ok   ${msg}`); }
}
function ok(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); fails++; } else { console.log(`ok   ${msg}`); }
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* --- floating dates, 2026 --- */
eq(ymd(t.nthWeekday(2026, 1, 1, 3)), '2026-02-16', "Presidents' Day 2026 (3rd Mon Feb)");
eq(ymd(t.lastWeekday(2026, 4, 1)),   '2026-05-25', 'Memorial Day 2026 (last Mon May)');
eq(ymd(t.fathersDay(2026)),          '2026-06-21', "Father's Day 2026 (3rd Sun Jun)");
eq(ymd(t.mensHealthWeek(2026)),      '2026-06-15', "Men's Health Week Mon 2026 (Father's - 6)");
eq(ymd(t.nthWeekday(2026, 8, 1, 1)), '2026-09-07', 'Labor Day 2026 (1st Mon Sep)');
eq(ymd(t.thanksgiving(2026)),        '2026-11-26', 'Thanksgiving 2026 (4th Thu Nov)');
eq(ymd(t.blackFriday(2026)),         '2026-11-27', 'Black Friday 2026 (Thanksgiving +1)');
eq(ymd(t.cyberMonday(2026)),         '2026-11-30', 'Cyber Monday 2026 (Thanksgiving +4)');
eq(ymd(t.nthWeekday(2026, 1, 0, 2)), '2026-02-08', 'Big Game Sunday 2026 (2nd Sun Feb)');

/* --- Easter (Computus), known-good values --- */
eq(ymd(t.easter(2025)), '2025-04-20', 'Easter 2025');
eq(ymd(t.easter(2026)), '2026-04-05', 'Easter 2026');
eq(ymd(t.easter(2027)), '2027-03-28', 'Easter 2027');

/* --- floating dates, 2027 (prove it is not hardcoded to one year) --- */
eq(ymd(t.nthWeekday(2027, 1, 1, 3)), '2027-02-15', "Presidents' Day 2027");
eq(ymd(t.lastWeekday(2027, 4, 1)),   '2027-05-31', 'Memorial Day 2027');
eq(ymd(t.fathersDay(2027)),          '2027-06-20', "Father's Day 2027");
eq(ymd(t.nthWeekday(2027, 8, 1, 1)), '2027-09-06', 'Labor Day 2027');
eq(ymd(t.thanksgiving(2027)),        '2027-11-25', 'Thanksgiving 2027');

/* --- selection / rollover (denser calendar) --- */
eq(t.nextHoliday(new Date(2026, 6, 5, 12)).label,  'Summer Reunion Sale', 'after July 4 -> Summer Reunion (Jul 15)');
eq(t.nextHoliday(new Date(2026, 6, 4, 20)).label,  'July 4th Sale',       'evening of July 4 still shows July 4');
eq(t.nextHoliday(new Date(2026, 10, 28, 12)).label,'Cyber Monday Sale',   'Sat after Black Friday -> Cyber Monday');
const nye = t.nextHoliday(new Date(2026, 11, 26, 12));
eq(nye.label, "New Year's Eve Sale", 'Dec 26 -> New Year\'s Eve (Dec 31)');
const roll = t.nextHoliday(new Date(2027, 0, 1, 12));
eq(roll.label, 'New Year Sale', 'Jan 1 2027 -> New Year (built from next-year set)');
eq(ymd(roll.date), '2027-01-01', 'rollover targets the correct year');

/* --- every event carries an emoji + a label; selection surfaces the emoji --- */
ok(t.HOLIDAYS.length >= 30, `calendar is dense (${t.HOLIDAYS.length} events)`);
ok(t.HOLIDAYS.every(h => typeof h.emoji === 'string' && h.emoji.length > 0), 'every event has an emoji');
ok(t.HOLIDAYS.every(h => typeof h.label === 'string' && h.label.length > 0), 'every event has a label');
ok(!!t.nextHoliday(new Date(2026, 6, 5, 12)).emoji, 'nextHoliday() returns an emoji');
const emojis = t.HOLIDAYS.map(h => h.emoji);
ok(new Set(emojis).size === emojis.length, 'emojis are unique (no two events share one)');

/* --- DENSITY: the real point. Max gap between consecutive event deadlines
       across 2026-2027 must stay small so the countdown is never far out. --- */
let all = [];
[2026, 2027].forEach(y => t.HOLIDAYS.forEach(h => { const d = h.date(y); all.push(t.deadlineFor(d).getTime()); }));
all.sort((a, b) => a - b);
let maxGap = 0;
for (let i = 1; i < all.length; i++) maxGap = Math.max(maxGap, (all[i] - all[i - 1]) / 86400000);
ok(maxGap <= 21, `max gap between events <= 21 days (actual ${Math.round(maxGap)}d) -- countdown never 50+ out`);

/* --- format boundary --- */
eq(t.format(0),         '00:00:00',     'format 0');
eq(t.format(3661000),   '01:01:01',     'format 1h1m1s');
eq(t.format(86400000),  '1d 00:00:00',  'format exactly 24h shows 1d');
eq(t.format(90000000),  '1d 01:00:00',  'format 25h');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exitCode = fails ? 1 : 0;
