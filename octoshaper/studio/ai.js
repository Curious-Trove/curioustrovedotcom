// AI connection settings, in the desktop app only (the web edition has no agent
// server): whether agents may connect, the port, an access token, the folder agents
// may save into, how to connect a client, and what agents did lately. The settings
// live in the app (desktop/src/agent.rs), which applies them at once and keeps them.
import { modal, h } from './dialogs.js?v=e2bbaab254';
import { invoke } from './platform.js?v=e2bbaab254';

const ago = ms => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 5 ? 'just now' : s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};
const shellQuote = s => /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;

function copyBlock(label, text) {
  const wrap = h('div', 'snippet');
  const head = h('div', 'snippet-head');
  head.append(h('span', null, label));
  const b = h('button', 'small', 'Copy');
  b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; } catch { b.textContent = 'Blocked'; }
    setTimeout(() => { b.textContent = 'Copy'; }, 1200);
  });
  head.append(b);
  wrap.append(head, h('pre', null, text));
  return wrap;
}

export async function aiSettingsDialog(link) {
  let s;
  try { s = await invoke('agent_settings'); } catch (e) { return modal({ title: 'AI connections', body: `The app could not read its AI settings: ${e}` }); }
  const draft = { enabled: s.enabled, port: s.port, token: s.token || '', save_dir: s.save_dir || '' };

  const body = h('div', 'ai-settings');
  const status = h('div', 'ai-status');
  const form = h('div', 'ai-form');
  const connect = h('div', 'ai-connect');
  const activity = h('div', 'ai-activity');
  body.append(status, form, h('div', 'ai-section', 'Connect an agent'), connect, h('div', 'ai-section', 'Recent activity'), activity);

  const paintStatus = () => {
    status.className = 'ai-status ' + (s.listening ? 'ok' : s.enabled ? 'bad' : 'off');
    status.replaceChildren(h('i'), h('span', null, s.listening ? `Agents on this computer can connect at ${s.mcp}` : s.enabled ? `Agents can't connect: ${s.error || 'the server is not running'}` : 'The agent server is off. Agents can’t reach the studio.'));
    if (s.cli && s.cli.length) status.append(h('small', null, `Started with ${s.cli.join(', ')} on the command line; changes here replace them until the app restarts.`));
  };

  // the form
  const row = (label, input, note) => {
    const r = h('label', 'ai-row');
    r.append(h('span', 'ai-label', label), input);
    if (note) r.append(h('span', 'ai-note', note));
    form.append(r);
    return r;
  };
  const on = h('input');
  on.type = 'checkbox';
  on.checked = draft.enabled;
  on.addEventListener('change', () => { draft.enabled = on.checked; });
  const onWrap = h('span', 'check-label');
  onWrap.append(on, document.createTextNode(' Let AI agents on this computer use the studio'));
  row('Agent server', onWrap);

  const port = h('input', 'ai-port');
  port.type = 'number';
  port.min = 1024; port.max = 65535;
  port.value = draft.port;
  port.addEventListener('input', () => { draft.port = parseInt(port.value, 10); });
  row('Port', port, 'Only this computer can connect (127.0.0.1).');

  const tokenWrap = h('span', 'ai-inline');
  const token = h('input', 'ai-token');
  token.spellcheck = false;
  token.placeholder = 'none: any local program may connect';
  token.value = draft.token;
  token.addEventListener('input', () => { draft.token = token.value.trim(); paintConnect(); });
  const gen = h('button', 'small', 'Generate');
  gen.type = 'button';
  gen.addEventListener('click', e => {
    e.preventDefault();
    const b = new Uint8Array(18);
    crypto.getRandomValues(b);
    token.value = draft.token = btoa(String.fromCharCode(...b)).replace(/[+/=]/g, '');
    paintConnect();
  });
  const clearTok = h('button', 'small', 'Clear');
  clearTok.type = 'button';
  clearTok.addEventListener('click', e => { e.preventDefault(); token.value = draft.token = ''; paintConnect(); });
  tokenWrap.append(token, gen, clearTok);
  row('Access token', tokenWrap, 'With a token, clients must send Authorization: Bearer <token>.');

  const dirWrap = h('span', 'ai-inline');
  const dir = h('span', 'ai-dir');
  const paintDir = () => { dir.textContent = draft.save_dir || 'Nowhere: saving stays yours'; dir.classList.toggle('none', !draft.save_dir); };
  const choose = h('button', 'small', 'Choose…');
  choose.type = 'button';
  choose.addEventListener('click', async e => {
    e.preventDefault();
    const p = await invoke('pick_folder').catch(() => null);
    if (p) { draft.save_dir = p; paintDir(); }
  });
  const noDir = h('button', 'small', 'Clear');
  noDir.type = 'button';
  noDir.addEventListener('click', e => { e.preventDefault(); draft.save_dir = ''; paintDir(); });
  dirWrap.append(dir, choose, noDir);
  paintDir();
  row('Agents may save into', dirWrap, 'The save tool writes .octo and .glb files here, and only when you ask an agent to save.');

  const paused = h('input');
  paused.type = 'checkbox';
  paused.checked = !!(link && link.paused);
  paused.addEventListener('change', () => link && link.setPaused(paused.checked));
  const pausedWrap = h('span', 'check-label');
  pausedWrap.append(paused, document.createTextNode(' Pause agents in this window'));
  row('This window', pausedWrap);

  // how to connect
  const paintConnect = () => {
    const url = `http://localhost:${draft.port || s.port}/mcp`;
    const auth = draft.token ? ` --header ${shellQuote('Authorization: Bearer ' + draft.token)}` : '';
    const exe = s.exe || 'octoshaper';
    connect.replaceChildren(
      copyBlock('Claude Code', `claude mcp add --transport http octoshaper ${url}${auth}`),
      copyBlock('Clients that start a command (Claude Desktop and others): add to their MCP config', JSON.stringify({ mcpServers: { octoshaper: { command: exe, args: ['--stdio'] } } }, null, 2)),
      copyBlock('Clients that take a URL (Cursor and others)', JSON.stringify({ mcpServers: { octoshaper: draft.token ? { url, headers: { Authorization: `Bearer ${draft.token}` } } : { url } } }, null, 2)),
      copyBlock('Plain HTTP, for scripts', `curl -s http://localhost:${draft.port || s.port}/api/get_graph -H 'Content-Type: application/json'${draft.token ? ` -H ${shellQuote('Authorization: Bearer ' + draft.token)}` : ''} -d '{}'`),
    );
  };

  const paintActivity = () => {
    activity.replaceChildren();
    const clients = s.clients || [];
    if (clients.length) {
      const c = h('div', 'ai-clients');
      c.append(h('span', 'ai-label', 'Clients'));
      for (const x of clients) c.append(h('span', 'chip', `${x.name}${x.version ? ' ' + x.version : ''} · ${ago(x.at)}`));
      activity.append(c);
    }
    const list = s.activity || [];
    if (!list.length) { activity.append(h('div', 'ai-empty', 'No agent has used the studio since the app started.')); return; }
    const t = h('div', 'ai-log');
    for (const a of list.slice().reverse().slice(0, 30)) {
      const r = h('div', 'ai-log-row' + (a.ok ? '' : ' bad'));
      r.append(h('span', 'when', ago(a.at)), h('span', 'tool', a.tool), h('span', 'win', a.window ? `window ${a.window}` : ''), h('span', 'ms', `${a.ms} ms`), h('span', 'err', a.ok ? '' : a.error || 'failed'));
      t.append(r);
    }
    activity.append(t);
  };

  paintStatus();
  paintConnect();
  paintActivity();
  const timer = setInterval(async () => {
    try { s = { ...s, ...(await invoke('agent_settings')), }; paintStatus(); paintActivity(); } catch { /* app busy */ }
  }, 2000);

  const err = h('div', 'export-err');
  body.append(err);
  const apply = async () => {
    if (!(draft.port >= 1024 && draft.port <= 65535)) { err.textContent = 'The port is a number from 1024 to 65535.'; return false; }
    try {
      s = await invoke('agent_configure', { settings: { enabled: draft.enabled, port: draft.port, token: draft.token || null, save_dir: draft.save_dir || null } });
      err.textContent = '';
      paintStatus();
      if (link) link.update(s);
      return true;
    } catch (e) { err.textContent = String(e); return false; }
  };
  const r = await modal({
    title: 'AI connections', body, wide: true,
    buttons: [{ label: 'Close', value: 'close' }, { label: 'Apply', value: 'apply', primary: true, check: apply }],
  });
  clearInterval(timer);
  return r;
}
