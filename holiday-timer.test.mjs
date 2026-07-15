/* Unit test for holiday-timer.js -- run: node holiday-timer.test.mjs
   Proves the floating-date math, the year-boundary rollover, and the
   countdown-format boundary. Exits non-zero on any failure. */
import t from './holiday-timer.js';

let fails = 0;
function eq(actual, expected, msg) {
  const a = String(actual), e = String(expected);
  if (a !== e) { console.error(`FAIL ${msg}\n  expected: ${e}\n  got:      ${a}`); fails++; }
  else { console.log(`ok   ${msg}`); }
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* --- floating dates, 2026 --- */
eq(ymd(t.nthWeekday(2026, 1, 1, 3)), '2026-02-16', "Presidents' Day 2026 (3rd Mon Feb)");
eq(ymd(t.lastWeekday(2026, 4, 1)),   '2026-05-25', 'Memorial Day 2026 (last Mon May)');
eq(ymd(t.nthWeekday(2026, 5, 0, 3)), '2026-06-21', "Father's Day 2026 (3rd Sun Jun)");
eq(ymd(t.nthWeekday(2026, 8, 1, 1)), '2026-09-07', 'Labor Day 2026 (1st Mon Sep)');
eq(ymd(t.thanksgiving(2026)),        '2026-11-26', 'Thanksgiving 2026 (4th Thu Nov)');
eq(ymd(t.blackFriday(2026)),         '2026-11-27', 'Black Friday 2026 (Thanksgiving +1)');
eq(ymd(t.cyberMonday(2026)),         '2026-11-30', 'Cyber Monday 2026 (Thanksgiving +4)');

/* --- floating dates, 2027 (prove it is not hardcoded to one year) --- */
eq(ymd(t.nthWeekday(2027, 1, 1, 3)), '2027-02-15', "Presidents' Day 2027");
eq(ymd(t.lastWeekday(2027, 4, 1)),   '2027-05-31', 'Memorial Day 2027');
eq(ymd(t.nthWeekday(2027, 5, 0, 3)), '2027-06-20', "Father's Day 2027");
eq(ymd(t.nthWeekday(2027, 8, 1, 1)), '2027-09-06', 'Labor Day 2027');
eq(ymd(t.thanksgiving(2027)),        '2027-11-25', 'Thanksgiving 2027');

/* --- selection / rollover --- */
eq(t.nextHoliday(new Date(2026, 6, 5, 12)).label, 'Labor Day Sale',  'after July 4 -> Labor Day');
eq(t.nextHoliday(new Date(2026, 6, 4, 20)).label, 'July 4th Sale',   'evening of July 4 still shows July 4 (deadline = midnight after)');
eq(t.nextHoliday(new Date(2026, 10, 28, 12)).label, 'Cyber Monday Sale', 'Sat after Black Friday -> Cyber Monday');
const ny = t.nextHoliday(new Date(2026, 11, 26, 12));
eq(ny.label, 'New Year Sale',  'Dec 26 -> New Year (year-boundary rollover)');
eq(ymd(ny.date), '2027-01-01',  'Dec 26 rollover targets NEXT year Jan 1');

/* --- format boundary --- */
eq(t.format(0),         '00:00:00',     'format 0');
eq(t.format(3661000),   '01:01:01',     'format 1h1m1s');
eq(t.format(86400000),  '1d 00:00:00',  'format exactly 24h shows 1d');
eq(t.format(90000000),  '1d 01:00:00',  'format 25h');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exitCode = fails ? 1 : 0;
