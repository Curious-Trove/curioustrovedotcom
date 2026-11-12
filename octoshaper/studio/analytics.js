// Usage counts for the published web edition, through umami (cookieless, no personal
// data). Only a web release has a site id: tools/release-web.sh writes it into
// <meta name="octo-umami">, so `make serve`, tests and the desktop app send nothing.
//
// Events say what kind of thing was done, never what it was done to: no file names, no
// code, no text a person typed. A sample's id and an export's format are fine.
import { VERSION } from './version.js?v=e2bbaab254';

const meta = name => { const m = document.querySelector(`meta[name="${name}"]`); return m ? m.content : ''; };
const site = window.__TAURI__ ? '' : meta('octo-umami');
const host = meta('octo-umami-host') || 'https://cloud.umami.is/script.js';
// count only the published site, not a copy someone serves from elsewhere
const domains = meta('octo-umami-domains');

let queue = site ? [] : null;
const once = new Set();

if (site) {
  const s = document.createElement('script');
  s.defer = true;
  s.src = host;
  s.dataset.websiteId = site;
  if (domains) s.dataset.domains = domains;
  s.dataset.doNotTrack = 'true';
  s.addEventListener('load', () => { const q = queue; queue = null; for (const [n, d] of q) send(n, d); });
  s.addEventListener('error', () => { queue = null; });
  document.head.append(s);
}

function send(name, data) {
  try { if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, { version: VERSION, ...data }); } catch { /* blocked or offline */ }
}

// track('Studio Export', { format: 'glb' })
export function track(name, data = {}) {
  if (!site) return;
  if (queue) { if (queue.length < 50) queue.push([name, data]); return; }
  send(name, data);
}

// the first time in this page that something happens: a session that edited at all
export function trackOnce(name, data) {
  if (once.has(name)) return;
  once.add(name);
  track(name, data);
}

// An error. What failed and the kind of error always; the message only for errors the
// studio did not expect (bugs), where it says which code broke. Messages of expected
// failures ("Could not open …") name the person's files, so they stay here.
export function trackError(where, e, { bug = false } = {}) {
  const data = { where: String(where).slice(0, 60), kind: (e && e.name) || 'Error' };
  if (bug) {
    data.message = String(e && e.message || e || 'unknown')
      .replace(/[^\s'"`/\\]+\.(?:octo|png|glb|gltf|txt)\b/gi, '<file>')
      .replace(/\s+/g, ' ').slice(0, 160);
    const at = e && e.stack && /(\w+\.js):(\d+):\d+/.exec(e.stack);
    if (at) data.at = `${at[1]}:${at[2]}`;
  }
  track('Studio Error', data);
}

export const tracking = !!site;
