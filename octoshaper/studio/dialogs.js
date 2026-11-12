// Dialogs in the studio's own style (never the browser's alert/confirm, which block
// the desktop app's webview): a modal card with a title, a body and buttons.
import { keyRows } from './keys.js?v=e2bbaab254';

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
export { h };

// resolves with the value of the button pressed, or null for Escape / outside click
export function modal({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], wide = false, onOpen }) {
  return new Promise(resolve => {
    const back = h('div', 'modal-back');
    const card = h('div', 'modal' + (wide ? ' wide' : ''));
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    const head = h('div', 'modal-head');
    head.append(h('span', 'modal-title', title));
    const x = h('button', 'icon modal-x', '×');
    x.title = 'Close';
    head.append(x);
    const content = h('div', 'modal-body');
    if (typeof body === 'string') content.append(h('p', null, body));
    else if (body) content.append(body);
    const foot = h('div', 'modal-foot');
    const done = v => { back.remove(); removeEventListener('keydown', key, true); resolve(v); };
    for (const b of buttons) {
      if (b.spacer) { foot.append(h('span', 'spacer')); continue; }
      const btn = h('button', b.primary ? 'primary' : b.danger ? 'danger' : '', b.label);
      btn.addEventListener('click', async () => {
        if (b.check && !(await b.check())) return;
        done(typeof b.value === 'function' ? b.value() : b.value);
      });
      foot.append(btn);
    }
    card.append(head, content);
    if (buttons.length) card.append(foot);
    back.append(card);
    document.body.append(back);
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
      else if (e.key === 'Enter' && !e.target.closest('textarea') && !e.target.closest('button')) {
        const p = buttons.find(b => b.primary);
        if (p) { e.preventDefault(); foot.querySelector('button.primary').click(); }
      } else e.stopPropagation();
    };
    addEventListener('keydown', key, true);
    x.addEventListener('click', () => done(null));
    back.addEventListener('pointerdown', e => { if (e.target === back) done(null); });
    if (onOpen) onOpen(card, done);
    const first = card.querySelector('input, select, textarea') || foot.querySelector('button.primary');
    if (first) setTimeout(() => first.focus(), 0);
  });
}

export function confirmClose(name) {
  return modal({
    title: 'Save changes?',
    body: `${name} has changes that are not saved to a file. If you close it without saving, they are lost.`,
    buttons: [{ label: 'Don’t save', value: 'discard', danger: true }, { spacer: true }, { label: 'Cancel', value: 'cancel' }, { label: 'Save', value: 'save', primary: true }],
  }).then(v => v || 'cancel');
}

export async function askText({ title, label, value = '', okLabel = 'OK', check }) {
  const wrap = h('label', 'field');
  wrap.append(h('span', null, label));
  const input = h('input');
  input.value = value;
  input.spellcheck = false;
  wrap.append(input);
  setTimeout(() => input.select(), 10);
  const v = await modal({ title, body: wrap, buttons: [{ label: 'Cancel', value: null }, { label: okLabel, primary: true, value: () => input.value.trim(), check: () => !check || check(input.value.trim(), input) }] });
  return v || null;
}

// ---- keyboard shortcuts ----

export function shortcutsDialog(groups) {
  const body = h('div', 'shortcuts');
  for (const g of groups) keyRows(g, body);
  return modal({ title: 'Keyboard shortcuts', body, wide: true, buttons: [{ label: 'Close', value: true, primary: true }] });
}
