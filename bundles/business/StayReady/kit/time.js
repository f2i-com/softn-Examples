// kit/time.js: dates and times a person can read, in THEIR time zone.
//
// Inside the SoftN sandbox the clock is UTC and the locale is fixed (en-US), whatever the device
// says: `new Date().getHours()`, `toLocaleDateString()` and friends are wrong for most people.
// So nothing in an app formats a date itself. It stores instants as epoch seconds (the backend's
// `softn.time.now()`) and calendar days as 'YYYY-MM-DD', and reads them through this module, which
// works in one named zone: the app's default until the person picks their own (see ZONES).
//
//   setZone(profile.zone || settings.zone);     // once, after the session loads
//   fmtDateTime(message.created_at)   -> '19 Nov 2026, 2:05 pm'
//   ago(message.created_at)           -> '5 min ago'
//   today()                           -> '2026-11-19'   (the person's calendar day)
//   toInstant('2026-11-19', '14:05')  -> epoch seconds of that wall-clock time in the zone
//
// Instants may be given as epoch seconds, epoch milliseconds or a Date.

export const DEFAULT_ZONE = 'Australia/Sydney';
let zone = DEFAULT_ZONE;

export const ZONES = [
  ['Australia/Sydney', 'Sydney, Melbourne, Canberra'], ['Australia/Brisbane', 'Brisbane'], ['Australia/Adelaide', 'Adelaide'],
  ['Australia/Darwin', 'Darwin'], ['Australia/Perth', 'Perth'], ['Australia/Hobart', 'Hobart'], ['Pacific/Auckland', 'Auckland'],
  ['Pacific/Fiji', 'Fiji'], ['Asia/Tokyo', 'Tokyo, Seoul'], ['Asia/Shanghai', 'Beijing, Shanghai, Hong Kong'], ['Asia/Singapore', 'Singapore, Kuala Lumpur'],
  ['Asia/Manila', 'Manila'], ['Asia/Jakarta', 'Jakarta, Bangkok, Hanoi'], ['Asia/Kolkata', 'India'], ['Asia/Karachi', 'Pakistan'],
  ['Asia/Dubai', 'Dubai'], ['Asia/Jerusalem', 'Jerusalem'], ['Europe/Istanbul', 'Istanbul'], ['Europe/Moscow', 'Moscow'],
  ['Africa/Johannesburg', 'Johannesburg'], ['Africa/Nairobi', 'Nairobi'], ['Africa/Lagos', 'Lagos'], ['Europe/Athens', 'Athens, Helsinki'],
  ['Europe/Berlin', 'Berlin, Paris, Rome, Madrid'], ['Europe/London', 'London, Dublin, Lisbon'], ['Atlantic/Reykjavik', 'Reykjavik'],
  ['America/Sao_Paulo', 'São Paulo'], ['America/Argentina/Buenos_Aires', 'Buenos Aires'], ['America/Halifax', 'Halifax'],
  ['America/New_York', 'New York, Toronto'], ['America/Chicago', 'Chicago, Mexico City'], ['America/Denver', 'Denver'],
  ['America/Phoenix', 'Phoenix'], ['America/Los_Angeles', 'Los Angeles, Vancouver'], ['America/Anchorage', 'Anchorage'],
  ['Pacific/Honolulu', 'Honolulu'], ['UTC', 'UTC'],
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export { MONTHS, MONTHS_LONG, DAYS, DAYS_LONG };

const formatters = new Map();
function formatterFor(name) {
  let made = formatters.get(name);
  if (!made) {
    made = new Intl.DateTimeFormat('en-GB', { timeZone: name, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatters.set(name, made);
  }
  return made;
}

/** True when the engine knows this IANA zone name. */
export function isZone(name) {
  if (typeof name !== 'string' || !name) return false;
  try { formatterFor(name).format(new Date(0)); return true; } catch { formatters.delete(name); return false; }
}

/** Use this zone from now on (ignored when it is not a zone the engine knows). Returns the zone in use. */
export function setZone(name) { if (isZone(name)) zone = name; return zone; }
export const getZone = () => zone;

/** Milliseconds of an instant given as seconds, milliseconds, ISO timestamp or a Date. NaN when it is none of them. */
export function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return NaN;
    if (!Number.isNaN(Number(trimmed))) value = Number(trimmed);
    else if (/^\d{4}-\d{2}-\d{2}[T ]/.test(trimmed)) {
      const parsed = Date.parse(trimmed);
      return Number.isFinite(parsed) ? parsed : NaN;
    } else return NaN;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return NaN;
  return Math.abs(value) < 1e11 ? value * 1000 : value;
}

/** The current instant in epoch seconds. */
export const nowSeconds = () => Math.floor(Date.now() / 1000);

// The engine writes the six numbers in an order of its own (it ignores the locale asked for), so
// the order is read once from an instant whose six numbers are all different.
let order = null;
function fieldOrder() {
  if (!order) {
    const sample = formatterFor('UTC').format(new Date(Date.UTC(2001, 1, 3, 4, 5, 6))).match(/\d+/g).map(Number);
    order = { y: sample.indexOf(2001), m: sample.indexOf(2), d: sample.indexOf(3), h: sample.indexOf(4), min: sample.indexOf(5), s: sample.indexOf(6) };
  }
  return order;
}

/** The wall clock of an instant in the zone: { y, m (1-12), d, h, min, s, wd (0 = Sunday) }. */
export function wall(value, inZone = zone) {
  const ms = toMs(value);
  if (Number.isNaN(ms)) return null;
  const digits = formatterFor(inZone).format(new Date(ms)).match(/\d+/g).map(Number);
  const at = fieldOrder();
  const y = digits[at.y], m = digits[at.m], d = digits[at.d], h = digits[at.h], min = digits[at.min], s = digits[at.s];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, h: h === 24 ? 0 : h, min, s, wd };
}

/** How far the zone is ahead of UTC at that instant, in minutes. */
export function offsetMinutes(value, inZone = zone) {
  const ms = toMs(value);
  const w = wall(ms, inZone);
  return Math.round((Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(ms / 1000) * 1000) / 60000);
}

const pad = (n) => String(n).padStart(2, '0');

/** The calendar day of an instant in the zone, as 'YYYY-MM-DD'. */
export function isoDate(value, inZone = zone) {
  const w = wall(value, inZone);
  return w ? `${w.y}-${pad(w.m)}-${pad(w.d)}` : '';
}

/** The time of day of an instant in the zone, as 'HH:MM' (for <input type="time">). */
export function isoTime(value, inZone = zone) {
  const w = wall(value, inZone);
  return w ? `${pad(w.h)}:${pad(w.min)}` : '';
}

/** Today's calendar day in the zone, as 'YYYY-MM-DD'. */
export const today = (inZone = zone) => isoDate(Date.now(), inZone);

/** Epoch seconds of a wall-clock day ('YYYY-MM-DD') and time ('HH:MM', default midnight) in the zone. */
export function toInstant(day, time = '00:00', inZone = zone) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  const clock = /^(\d{1,2}):(\d{2})/.exec(time || '00:00');
  if (!date || !clock) return null;
  const guess = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]), Number(clock[1]), Number(clock[2]));
  let at = guess - offsetMinutes(guess, inZone) * 60000;
  const again = guess - offsetMinutes(at, inZone) * 60000;
  if (again !== at) at = again;
  return Math.floor(at / 1000);
}

// ---- calendar days ('YYYY-MM-DD'), no zone involved ------------------------------------------

const dayNumber = (day) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const dayFromNumber = (n) => { const date = new Date(n * 86400000); return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`; };

export const isDay = (day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && dayFromNumber(dayNumber(day)) === day;
export const addDays = (day, count) => dayFromNumber(dayNumber(day) + count);
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);
export const weekdayOf = (day) => new Date(dayNumber(day) * 86400000).getUTCDay();
/** The Monday (or Sunday, with mondayFirst false) on or before the day. */
export const startOfWeek = (day, mondayFirst = true) => addDays(day, -((weekdayOf(day) - (mondayFirst ? 1 : 0) + 7) % 7));
export function addMonths(day, count) {
  const [y, m, d] = day.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + count, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}
/** The weeks of a month for a calendar: rows of seven 'YYYY-MM-DD', padded with the days around it. */
export function monthGrid(year, month, mondayFirst = true) {
  const first = `${year}-${pad(month)}-01`;
  let cursor = startOfWeek(first, mondayFirst);
  const weeks = [];
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  } while (cursor.slice(0, 7) === first.slice(0, 7));
  return weeks;
}

// ---- reading ---------------------------------------------------------------------------------

/** 'YYYY-MM-DD' -> '19 Nov 2026'. Options: weekday ('short' | 'long'), month ('short' | 'long'), year (true | false | 'auto': only when not this year). */
export function fmtDay(day, { weekday = null, month = 'short', year = true } = {}) {
  if (!isDay(day)) return '';
  const [y, m, d] = day.split('-').map(Number);
  const showYear = year === 'auto' ? y !== Number(today().slice(0, 4)) : year;
  const lead = weekday ? (weekday === 'long' ? DAYS_LONG : DAYS)[weekdayOf(day)] + (weekday === 'long' ? ', ' : ' ') : '';
  return `${lead}${d} ${(month === 'long' ? MONTHS_LONG : MONTHS)[m - 1]}${showYear ? ' ' + y : ''}`;
}

/** 'Today', 'Tomorrow', 'Yesterday', else the day ('Thu 19 Nov', with the year when it is not this one). */
export function fmtDayNear(day) {
  if (!isDay(day)) return '';
  const gap = daysBetween(today(), day);
  if (gap === 0) return 'Today';
  if (gap === 1) return 'Tomorrow';
  if (gap === -1) return 'Yesterday';
  return fmtDay(day, { weekday: 'short', year: 'auto' });
}

/** An instant or YYYY-MM-DD day in the zone: '19 Nov 2026' (same options as fmtDay). */
export const fmtDate = (value, options) => (isDay(value) ? fmtDay(value, options) : fmtDay(isoDate(value), options));

/** An instant's time of day in the zone: '2:05 pm'. */
export function fmtTime(value) {
  const w = wall(value);
  if (!w) return '';
  return `${w.h % 12 === 0 ? 12 : w.h % 12}:${pad(w.min)} ${w.h < 12 ? 'am' : 'pm'}`;
}

/** '19 Nov 2026, 2:05 pm' (the year only when it is not this one). */
export function fmtDateTime(value) {
  const day = isoDate(value);
  return day ? `${fmtDay(day, { year: 'auto' })}, ${fmtTime(value)}` : '';
}

/** For a message list: the time today, 'Yesterday', the weekday this week, else the date. */
export function fmtStamp(value) {
  const day = isoDate(value);
  if (!day) return '';
  const gap = daysBetween(day, today());
  if (gap === 0) return fmtTime(value);
  if (gap === 1) return 'Yesterday';
  if (gap > 1 && gap < 7) return DAYS_LONG[weekdayOf(day)];
  return fmtDay(day, { year: 'auto' });
}

/** 'just now', '5 min ago', '3 h ago', 'yesterday', '4 days ago', else the date. Future instants read 'in 5 min'. */
export function ago(value) {
  const ms = toMs(value);
  if (Number.isNaN(ms)) return '';
  const seconds = Math.round((Date.now() - ms) / 1000);
  const past = seconds >= 0;
  const gap = Math.abs(seconds);
  const say = (text) => (past ? `${text} ago` : `in ${text}`);
  if (gap < 45) return past ? 'just now' : 'in a moment';
  if (gap < 3600) return say(`${Math.max(1, Math.round(gap / 60))} min`);
  if (gap < 86400) return say(`${Math.round(gap / 3600)} h`);
  const days = Math.abs(daysBetween(isoDate(ms), today()));
  if (days <= 1) return past ? 'yesterday' : 'tomorrow';
  if (days < 30) return say(`${days} days`);
  return fmtDate(ms, { year: 'auto' });
}

/** A length of time in words: 95 -> '1 h 35 min'. */
export function fmtDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60), m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
