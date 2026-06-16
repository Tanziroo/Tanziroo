// Live + shareable outfit sync.
//
// Every transport is feature-detected, so this module is completely inert in a
// non-browser context (e.g. the smoke test) and degrades gracefully wherever a
// given capability is missing.
//
// Transports, in order of "no setup -> more setup":
//   1. URL hash      — the whole look encodes into #look=..., so any link is a
//                      deep link. Powers "Share look" (native share sheet).
//   2. localStorage + BroadcastChannel — live sync across tabs/windows on the
//                      same device.
//   3. WebSocket room — optional true cross-device live sync. Activated by
//                      setting window.__SYNC_WS (relay url) and window.__SYNC_ROOM.

const KEY = 'cryptcouture:look';
const g = typeof globalThis !== 'undefined' ? globalThis : {};

const b64 = {
  enc: (state) => btoa(unescape(encodeURIComponent(JSON.stringify(state)))),
  dec: (str) => { try { return JSON.parse(decodeURIComponent(escape(atob(str)))); } catch { return null; } },
};

export function createSync({ onRemote } = {}) {
  const loc = g.location;
  const ls = (() => { try { return g.localStorage; } catch { return null; } })();
  const wsUrl = g.__SYNC_WS;
  const room = g.__SYNC_ROOM || 'crypt';
  let bc = null, ws = null, last = '';

  const emit = (code) => { if (code && code !== last) { last = code; const s = b64.dec(code); if (s) onRemote?.(s); } };

  // 1) restore from a shared/deep link on load
  if (loc && loc.hash && loc.hash.includes('look=')) {
    const m = loc.hash.match(/look=([^&]+)/);
    if (m) emit(m[1]);
  }

  // 2) same-device live across tabs
  if (ls && g.addEventListener) {
    g.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) emit(e.newValue); });
  }
  if (typeof g.BroadcastChannel === 'function') {
    try { bc = new g.BroadcastChannel(KEY); bc.onmessage = (e) => emit(e.data); } catch { /* ignore */ }
  }

  // 3) optional cross-device live relay
  function connectWS() {
    if (!wsUrl || typeof g.WebSocket !== 'function') return;
    try {
      ws = new g.WebSocket(wsUrl);
      ws.onmessage = (e) => { try { const msg = JSON.parse(e.data); if (msg.room === room) emit(msg.code); } catch { /* ignore */ } };
      ws.onclose = () => setTimeout(connectWS, 2000);
    } catch { /* ignore */ }
  }
  connectWS();

  function push(state) {
    const code = b64.enc(state);
    last = code;
    if (loc && g.history?.replaceState) { try { g.history.replaceState(null, '', '#look=' + code); } catch { /* ignore */ } }
    if (ls) { try { ls.setItem(KEY, code); } catch { /* ignore */ } }
    if (bc) { try { bc.postMessage(code); } catch { /* ignore */ } }
    if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ room, code })); } catch { /* ignore */ } }
  }

  function shareUrl() {
    if (!loc) return '';
    return loc.origin + loc.pathname + loc.search + loc.hash;
  }

  async function share(state) {
    if (state) push(state);
    const url = shareUrl();
    const nav = g.navigator;
    if (nav?.share) { try { await nav.share({ title: 'Crypt Couture look', url }); return 'shared'; } catch { return 'cancelled'; } }
    if (nav?.clipboard?.writeText) { try { await nav.clipboard.writeText(url); return 'copied'; } catch { /* ignore */ } }
    return url;
  }

  return { push, share, shareUrl, room, live: !!wsUrl };
}
