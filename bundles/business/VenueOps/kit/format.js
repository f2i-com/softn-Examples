// kit/format.js: numbers, money and words, written out by hand because the sandbox's locale is fixed.

/** 1234567.891 -> '1,234,567.89' (decimals: how many to show; trailing zeros kept only when `fixed`). */
export function num(value, { decimals = 0, fixed = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const rounded = Math.abs(n).toFixed(decimals);
  let [whole, fraction = ''] = rounded.split('.');
  whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!fixed) fraction = fraction.replace(/0+$/, '');
  return (n < 0 && Number(rounded) !== 0 ? '-' : '') + whole + (fraction ? '.' + fraction : '');
}

const SYMBOLS = { AUD: '$', USD: '$', NZD: '$', CAD: '$', SGD: '$', GBP: '£', EUR: '€', JPY: '¥', INR: '₹', ZAR: 'R', CHF: 'CHF ' };
const NO_CENTS = new Set(['JPY', 'KRW', 'VND']);

/** Money from minor units (cents): money(123450) -> '$1,234.50'. Pass { cents: false } for whole units. */
export function money(amount, { currency = 'AUD', cents = true, code = false } = {}) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const zero = NO_CENTS.has(currency);
  const value = cents && !zero ? n / 100 : n;
  const text = num(Math.abs(value), { decimals: zero ? 0 : 2, fixed: true });
  const symbol = SYMBOLS[currency] ?? currency + ' ';
  return (value < 0 ? '-' : '') + symbol + text + (code ? ' ' + currency : '');
}

/** '12.50' or '1,234.5' typed by a person -> minor units (1250), or null when it is not an amount. */
export function parseMoney(text) {
  const cleaned = String(text ?? '').replace(/[^0-9.\-]/g, '');
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  return Math.round(Number(cleaned) * 100);
}

/** plural(3, 'client') -> '3 clients'; plural(1, 'person', 'people') -> '1 person'. */
export function plural(count, one, many = one + 's') {
  return `${num(count)} ${Number(count) === 1 ? one : many}`;
}

/** 'Ada Lovelace' -> 'AL'. */
export function initials(name) {
  // Only words that begin with a letter or digit count: 'Harriet (host)' is 'H', not 'H('.
  const words = String(name ?? '').trim().split(/\s+/).filter((word) => /^[A-Za-z0-9À-￿]/.test(word));
  if (!words.length) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

/** Cut text to a length on a word boundary, with an ellipsis. */
export function truncate(text, max = 120) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const whole = s[max - 1] === ' ' || space <= max * 0.6;
  return (whole ? cut : cut.slice(0, space)).replace(/[\s.,;:]+$/, '') + '…';
}

/** 1536 -> '1.5 KB'. */
export function bytes(count) {
  const n = Number(count) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${num(n / 1024, { decimals: 1 })} KB`;
  return `${num(n / 1024 / 1024, { decimals: 1 })} MB`;
}

/** A stable colour (hue 0-359) for a name, for avatars and tags. */
export function hueOf(text) {
  let hash = 0;
  for (const ch of String(text ?? '')) hash = (hash * 31 + ch.codePointAt(0)) % 360;
  return hash;
}

/** One list from several, each said once: listWords(['a','b','c']) -> 'a, b and c'. */
export function listWords(items) {
  const list = items.filter(Boolean).map(String);
  if (list.length < 2) return list.join('');
  return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
}
