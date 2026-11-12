// The environment editor (View ▸ Environment ▸ Edit): the GLSL of the light the 3D view
// shows models in. Editing a built-in one saves a copy under a new name. See environment.js.
import { modal, h } from './dialogs.js?v=e2bbaab254';
import { environment, BUILT_IN, saveEnvironment, removeEnvironment, setEnvironment, previewEnvironment } from './environment.js?v=e2bbaab254';
import { checkEnvironment } from './render.js?v=e2bbaab254';

const HELP = 'Five functions, directions in the world with y up: sunDir(), sunColor(), ambient(n), background(d) (alpha 0 shows the window) and fog(col, d, far) (far from 0 to 1). uTime is seconds and uWindow the window\'s colour. It is the studio\'s: no file and no export holds it.';

export async function editEnvironment() {
  const was = environment();
  const builtIn = BUILT_IN.some(e => e.name === was.name);
  const body = h('div', 'env-edit');
  const nameRow = h('label', 'env-name');
  const name = h('input');
  name.value = builtIn ? `my ${was.name}` : was.name;
  name.spellcheck = false;
  nameRow.append(h('span', null, 'Name'), name);
  const code = h('textarea', 'env-code');
  code.value = was.code;
  code.spellcheck = false;
  code.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Tab') { e.preventDefault(); const a = code.selectionStart; code.setRangeText('  ', a, code.selectionEnd, 'end'); }
  });
  const msg = h('div', 'env-msg');
  const help = h('p', 'hint', HELP);
  body.append(nameRow, code, msg, help);
  // try it in every view as it is typed; a mistake shows its message and keeps the last good one
  let timer = 0;
  const tryIt = () => {
    const err = checkEnvironment(code.value);
    msg.textContent = err ? err.split('\n').slice(0, 3).join('\n') : '';
    msg.classList.toggle('bad', !!err);
    if (!err) previewEnvironment({ name: was.name, code: code.value });
    return !err;
  };
  code.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(tryIt, 300); });
  const buttons = [];
  if (!builtIn) buttons.push({ label: 'Remove', danger: true, value: 'remove' }, { spacer: true });
  else buttons.push({ spacer: true });
  buttons.push({ label: 'Cancel', value: null }, {
    label: 'Save', primary: true, value: 'save',
    check: () => {
      const n = name.value.trim();
      if (!n) { msg.textContent = 'Give it a name.'; msg.classList.add('bad'); return false; }
      if (BUILT_IN.some(e => e.name === n)) { msg.textContent = `${n} is a built-in environment: give yours another name.`; msg.classList.add('bad'); return false; }
      return tryIt();
    },
  });
  const res = await modal({ title: 'Environment', body, buttons, wide: true, onOpen: () => code.focus() });
  clearTimeout(timer);
  if (res === 'save') saveEnvironment(name.value.trim(), code.value);
  else if (res === 'remove') removeEnvironment(was.name);
  else setEnvironment(was.name); // back to what it was
}
