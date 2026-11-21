// kit/api.js: SoftN browser-sandbox API client backed by the embedded PHP Slim 4 + XDB SQLite worker.
// Same-origin `/api/...` requests are intercepted by SoftN Container and dispatched directly to the
// app's isolated PHP Slim 4 backend inside the browser (zero external network egress required).

export class ApiError extends Error {
  constructor(status, body, fallback) {
    const said = body && typeof body === 'object' ? body.error || body.message : null;
    super(typeof said === 'string' && said ? said : fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body && typeof body === 'object' && typeof body.code === 'string' ? body.code : '';
    this.field = body && typeof body === 'object' && typeof body.field === 'string' ? body.field : '';
    this.body = body;
  }
}

const FALLBACK = {
  0: 'The local app backend could not be reached. Reload the app and try again.',
  401: 'Please sign in to continue.',
  403: 'You do not have access to do that.',
  404: 'That record could not be found.',
  409: 'That record changed while you were editing. Refresh and try again.',
  413: 'That payload is too large to send.',
  422: 'Some details were not accepted. Check the form and try again.',
  429: 'Too many requests just now. Wait a moment and try again.',
};

const MAX_CONCURRENT = 4;
let activeSlots = 0;
const slotQueue = [];
function acquireSlot() {
  if (activeSlots < MAX_CONCURRENT) { activeSlots++; return Promise.resolve(); }
  return new Promise((resolve) => slotQueue.push(resolve));
}
function releaseSlot() {
  const next = slotQueue.shift();
  if (next) next();
  else if (activeSlots > 0) activeSlots--;
}

let inFlight = 0;
const watchers = new Set();
const tell = () => { for (const fn of watchers) fn(inFlight); };

/** Called with the number of requests under way whenever it changes (for a progress bar). */
export function onBusy(fn) { watchers.add(fn); return () => watchers.delete(fn); }

function withQuery(path, query) {
  if (!query) return path;
  const pairs = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }
  return pairs.length ? path + '?' + pairs.join('&') : path;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendOnce(method, path, query, body) {
  await acquireSlot();
  try {
    const url = withQuery(path, query);
    const headers = { Accept: 'application/json' };
    const init = { method, headers };
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        init.body = body;
      } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
        init.body = body;
      } else if (typeof body === 'string') {
        headers['Content-Type'] = 'application/json';
        init.body = body;
      } else {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
    }
    return await fetch(url, init);
  } finally {
    releaseSlot();
  }
}

async function request(method, path, { query, body } = {}) {
  inFlight++; tell();
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      try {
        response = await sendOnce(method, path, query, body);
      } catch (err) {
        const detail = err && typeof err.message === 'string' ? err.message.trim() : '';
        const isTransient = method === 'GET' || /busy|wait|timeout|network|failed to fetch/i.test(detail);
        if (attempt < 2 && isTransient) {
          await pause(350 * (attempt + 1));
          continue;
        }
        const msg = detail ? `${FALLBACK[0]} (${detail})` : FALLBACK[0];
        throw new ApiError(0, detail ? { error: msg, detail } : null, msg);
      }
      let data = null;
      const text = await response.text().catch(() => '');
      if (text) {
        try { data = JSON.parse(text); } catch { data = { error: text }; }
      }
      if ((response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) && attempt < 2) {
        await pause(400 * (attempt + 1));
        continue;
      }
      if (!response.ok) {
        throw new ApiError(response.status, data, FALLBACK[response.status] || 'Something went wrong on the server. Try again in a moment.');
      }
      return data ?? {};
    }
  } finally {
    if (inFlight > 0) inFlight--;
    tell();
  }
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body = {}) => request('POST', path, { body }),
  put: (path, body = {}) => request('PUT', path, { body }),
  patch: (path, body = {}) => request('PATCH', path, { body }),
  delete: (path, body = {}) => request('DELETE', path, { body }),
};

/** What to show a person for any thrown thing. */
export function messageOf(error) {
  if (error instanceof ApiError) return error.message;
  return (error && error.userMessage) || (error && error.message) || 'Something went wrong. Try again.';
}
