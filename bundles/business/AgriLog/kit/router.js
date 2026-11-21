// kit/router.js: screens by address, inside the app.
//
//   const router = createRouter({
//     '/': home,
//     '/clients': clientList,
//     '/clients/:id': clientPage,          // -> params.id
//   }, { onChange: (route) => draw(route), notFound: home });
//   router.go('/clients/12', { tab: 'notes' });   // #/clients/12?tab=notes
//   html`<a href="#/clients/12">Open</a>`           // plain links work too
//
// The sandbox gives the app an address of its own (the browser's bar does not show it and the
// browser's Back button leaves the app), so the router keeps its own trail for router.back(),
// and remembers the last screen for a while so a reload returns to it.

const REMEMBER_KEY = 'kit.route';
const REMEMBER_MS = 30 * 60 * 1000;

function parse(hash) {
  const text = (hash || '').replace(/^#/, '') || '/';
  const cut = text.indexOf('?');
  const decode = (part) => { try { return decodeURIComponent(part); } catch { return part; } };
  const path = (cut < 0 ? text : text.slice(0, cut)).replace(/\/+$/, '').split('/').map(decode).join('/') || '/';
  const query = {};
  if (cut >= 0) {
    for (const pair of text.slice(cut + 1).split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
      query[key] = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
    }
  }
  return { path, query };
}

function build(path, query) {
  const pairs = [];
  for (const [key, value] of Object.entries(query || {})) {
    if (value === null || value === undefined || value === '') continue;
    pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }
  return '#' + path.split('/').map(encodeURIComponent).join('/') + (pairs.length ? '?' + pairs.join('&') : '');
}

export function createRouter(routes, { onChange, notFound = null, remember = true } = {}) {
  const table = Object.entries(routes).map(([pattern, handler]) => {
    const names = [];
    const source = pattern.replace(/\/+$/, '').replace(/:[A-Za-z_]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) || '/';
    return { pattern, handler, names, test: new RegExp('^' + source + '$') };
  });
  const trail = [];
  let current = null;

  function match(hash) {
    const { path, query } = parse(hash);
    for (const row of table) {
      const found = row.test.exec(path);
      if (!found) continue;
      const params = {};
      row.names.forEach((name, i) => { params[name] = found[i + 1]; });
      return { path, query, params, pattern: row.pattern, handler: row.handler, hash: build(path, query) };
    }
    return { path, query, params: {}, pattern: null, handler: notFound, hash: build(path, query) };
  }

  function apply() {
    const route = match(location.hash);
    if (current && current.hash === route.hash) return;
    current = route;
    if (trail[trail.length - 1] !== route.hash) trail.push(route.hash);
    if (trail.length > 50) trail.shift();
    if (remember) {
      try { localStorage.setItem(REMEMBER_KEY, JSON.stringify({ hash: route.hash, at: Date.now() })); } catch { /* storage full or off */ }
    }
    if (onChange) onChange(route);
  }

  window.addEventListener('hashchange', apply);

  return {
    /** Start: open the remembered screen (if recent), else the address as it is. */
    start() {
      if (remember && (!location.hash || location.hash === '#' || location.hash === '#/')) {
        try {
          const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null');
          if (saved && typeof saved.hash === 'string' && Date.now() - saved.at < REMEMBER_MS && match(saved.hash).pattern) {
            location.hash = saved.hash;
          }
        } catch { /* nothing remembered */ }
      }
      apply();
    },
    get current() { return current; },
    /** Go to a screen. replace: true swaps the current one instead of adding to the trail. */
    go(path, query, { replace = false } = {}) {
      const hash = build(path, query);
      if (replace && trail.length) trail.pop();
      if (location.hash === hash) { current = null; apply(); } else location.hash = hash;
    },
    /** Change the current screen's query (filters, tabs) without leaving it. */
    setQuery(patch, { replace = true } = {}) {
      this.go(current.path, { ...current.query, ...patch }, { replace });
    },
    /** Back to the screen before this one, or to `fallback` when there is none. */
    back(fallback = '/') {
      trail.pop();
      const previous = trail.pop();
      if (previous) location.hash = previous; else this.go(fallback);
    },
    canGoBack() { return trail.length > 1; },
    href: build,
  };
}
