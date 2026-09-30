/* Hermes HUD — app logic
 *
 * Platform contract (Meta Ray-Ban Display Web Apps):
 *  - Directional input (arrows) is handled by Chromium WebView spatial
 *    navigation. This file never builds a manual focus index and never
 *    preventDefault()s arrow keys.
 *  - Enter activates the focused element natively. We listen for `click` /
 *    `submit` and never synthesize clicks from key events (double-activation).
 *  - Focus is the cursor: there is no hover and no free pointer. Every action
 *    is a native button, input, or form.
 */

'use strict';

const STORE_KEY = 'hermes-hud.v1';

const DEFAULTS = {
  items: [],       // { id, text, done, source: 'local'|'feed', at }
  feedUrl: '',
  lastSync: null,
};

/* ---------------------------------------------------------------- state -- */

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      feedUrl: typeof parsed.feedUrl === 'string' ? parsed.feedUrl : '',
      lastSync: typeof parsed.lastSync === 'number' ? parsed.lastSync : null,
    };
  } catch (err) {
    console.warn('Could not read saved state; starting fresh.', err);
    try { localStorage.removeItem(STORE_KEY); } catch (_) {}
    return { ...DEFAULTS };
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    // QuotaExceededError or storage disabled — keep running in memory.
    console.warn('Could not save state.', err);
    return false;
  }
}

/* --------------------------------------------------------------- helpers -- */

const $ = (id) => document.getElementById(id);

function uid() {
  return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function clockText(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
}

function dateText(d) {
  return d.toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
  });
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------------------------------------------------------------- render -- */

function renderItems() {
  const list = $('item-list');
  list.textContent = '';

  for (const item of state.items) {
    const li = document.createElement('li');
    li.className = 'item';
    li.dataset.done = String(!!item.done);
    li.dataset.id = item.id;

    // Body is a button so the whole row is one focus stop.
    const body = document.createElement('button');
    body.type = 'button';
    body.className = 'item-text';
    body.dataset.act = 'toggle';
    body.dataset.focusId = 'toggle:' + item.id;

    const text = document.createElement('span');
    text.textContent = item.text;
    body.appendChild(text);

    if (item.source === 'feed' || item.at) {
      const meta = document.createElement('span');
      meta.className = 'item-meta';
      meta.textContent = item.source === 'feed'
        ? 'from feed'
        : new Date(item.at).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          });
      body.appendChild(meta);
    }

    body.addEventListener('click', () => toggleItem(item.id));

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn';
    del.dataset.act = 'delete';
    del.dataset.focusId = 'delete:' + item.id;
    del.setAttribute('aria-label', 'Delete: ' + item.text);
    del.textContent = '\u2715';
    del.addEventListener('click', () => deleteItem(item.id));

    actions.appendChild(del);
    li.append(body, actions);
    list.appendChild(li);
  }

  $('empty-state').hidden = state.items.length > 0;
  $('count-line').textContent =
    state.items.length + (state.items.length === 1 ? ' item' : ' items');
}

function renderSettings() {
  const url = $('feed-url');
  if (document.activeElement !== url) url.value = state.feedUrl;

  $('feed-state').textContent = !state.feedUrl
    ? 'Not configured.'
    : state.lastSync
      ? 'Last sync ' + new Date(state.lastSync).toLocaleTimeString()
      : 'Configured, not synced yet.';
}

function renderStatus() {
  $('status-line').textContent = state.feedUrl ? 'Feed linked' : 'Local only';
}

function renderAll() {
  renderItems();
  renderSettings();
  renderStatus();
}

/* Focus restoration: we only ever move focus via the standard API, and only
   when a re-render removed the element that held it. */
function withFocusRestore(mutate) {
  const active = document.activeElement;
  const key = active && active.dataset ? active.dataset.focusId : null;
  mutate();
  if (!key) return;
  const next = document.querySelector(`[data-focus-id="${key}"]`);
  if (next) next.focus();
}

/* --------------------------------------------------------------- actions -- */

function addItem(text) {
  const clean = text.trim();
  if (!clean) return false;
  state.items.unshift({ id: uid(), text: clean, done: false, source: 'local', at: Date.now() });
  save();
  renderItems();
  return true;
}

function toggleItem(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  item.done = !item.done;
  save();
  withFocusRestore(renderItems);
}

function deleteItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  save();
  withFocusRestore(renderItems);
}

function clearCompleted() {
  const before = state.items.length;
  state.items = state.items.filter((i) => !i.done);
  save();
  renderItems();
  toast(before === state.items.length ? 'Nothing to clear' : 'Cleared completed');
}

function resetAll() {
  state = { ...DEFAULTS };
  try { localStorage.removeItem(STORE_KEY); } catch (_) {}
  renderAll();
  toast('Reset');
}

/* ------------------------------------------------------------------ feed -- */

function normaliseFeed(payload) {
  const raw = Array.isArray(payload) ? payload
    : Array.isArray(payload && payload.items) ? payload.items
    : null;
  if (!raw) throw new Error('Feed must be an array or { items: [...] }');

  return raw
    .map((entry) => {
      if (typeof entry === 'string') return { text: entry, done: false };
      if (!entry || typeof entry !== 'object') return null;
      const text = entry.text || entry.title || entry.label;
      if (!text) return null;
      return { text: String(text), done: !!entry.done };
    })
    .filter(Boolean)
    .slice(0, 200);
}

async function syncFeed() {
  if (!state.feedUrl) { toast('No feed URL set'); return; }
  $('status-line').textContent = 'Syncing\u2026';
  try {
    const res = await fetch(state.feedUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const incoming = normaliseFeed(await res.json());

    // Replace feed-sourced rows only; local items are never touched.
    const local = state.items.filter((i) => i.source !== 'feed');
    const feed = incoming.map((entry) => ({
      id: uid(), text: entry.text, done: entry.done, source: 'feed', at: Date.now(),
    }));
    state.items = [...local, ...feed];
    state.lastSync = Date.now();
    save();
    renderAll();
    toast('Synced ' + feed.length + (feed.length === 1 ? ' item' : ' items'));
  } catch (err) {
    // Network, CORS, or parse failure: keep showing what we already have.
    renderStatus();
    toast('Sync failed: ' + err.message);
  }
}

/* ------------------------------------------------------------------ views -- */

function showView(name) {
  const isItems = name === 'items';
  $('view-items').hidden = !isItems;
  $('view-settings').hidden = isItems;

  $('tab-items').setAttribute('aria-current', isItems ? 'page' : 'false');
  $('tab-settings').setAttribute('aria-current', isItems ? 'false' : 'page');

  // If focus was inside the view we just hid, it has fallen to <body> and
  // directional input has no starting point. Park it on the active tab so the
  // next directional press moves into the new content.
  const active = document.activeElement;
  if (!active || active === document.body || active.closest('[hidden]')) {
    (isItems ? $('tab-items') : $('tab-settings')).focus();
  }

  if (!isItems) renderSettings();
}

/* ------------------------------------------------------------------- boot -- */

function tickClock() {
  const now = new Date();
  $('clock').textContent = clockText(now);
  $('hud-date').textContent = dateText(now);
}

function init() {
  tickClock();
  setInterval(tickClock, 10000);

  renderAll();
  showView('items');

  $('tab-items').addEventListener('click', () => showView('items'));
  $('tab-settings').addEventListener('click', () => showView('settings'));

  $('add-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('new-item');
    if (addItem(input.value)) {
      input.value = '';
      input.focus();               // sanctioned focus move: keep the flow going
    } else {
      toast('Enter some text first');
    }
  });

  $('feed-form').addEventListener('submit', (event) => {
    event.preventDefault();
    state.feedUrl = $('feed-url').value.trim();
    save();
    renderSettings();
    renderStatus();
    toast(state.feedUrl ? 'Feed URL saved' : 'Feed cleared');
  });

  $('sync-btn').addEventListener('click', syncFeed);
  $('clear-done-btn').addEventListener('click', clearCompleted);
  $('reset-btn').addEventListener('click', resetAll);

  $('export-btn').addEventListener('click', async () => {
    const payload = JSON.stringify(state, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      toast('Copied ' + state.items.length + ' items');
    } catch (_) {
      // Clipboard may be unavailable; fall back to a selectable dump.
      $('about-note').textContent = payload.slice(0, 900);
      toast('Clipboard blocked — dumped below');
    }
  });

  // Optional offline shell. Failure is non-fatal.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .catch((err) => console.warn('Offline support unavailable.', err));
  }

  if (state.feedUrl) syncFeed();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}