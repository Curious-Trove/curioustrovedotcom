// Undo for the studio. A step is the whole code text, because the code is the
// file: undo puts back an earlier text and the graph is parsed from it again.
// Changes of the same kind close together (typing, dragging one param) are one step.

const MERGE_MS = 900, LIMIT = 200;

export class History {
  constructor(changed = () => {}) {
    this.changed = () => { changed(this); if (this.onChange) this.onChange(); };
    this.reset();
  }
  reset() {
    this.past = [];
    this.future = [];
    this.cur = null;
    this.kind = null;
    this.at = 0;
    this.holding = 0;
    this.silent = 0;
    this.changed();
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  // called with the code after every change that took
  record(text, kind = null) {
    if (this.silent || text === this.cur) return;
    if (this.cur == null || this.holding) { this.cur = text; return; }
    const now = Date.now();
    const merge = kind && kind === this.kind && now - this.at < MERGE_MS && !this.future.length;
    if (!merge) {
      this.past.push(this.cur);
      if (this.past.length > LIMIT) this.past.shift();
    }
    this.future = [];
    this.cur = text;
    this.kind = kind;
    this.at = now;
    this.changed();
  }

  // everything fn changes is one step
  group(fn) {
    const before = this.cur;
    this.holding++;
    try { return fn(); } finally {
      this.holding--;
      if (!this.holding && this.cur !== before && before != null) {
        this.past.push(before);
        if (this.past.length > LIMIT) this.past.shift();
        this.future = [];
        this.kind = null;
        this.changed();
      }
    }
  }

  // changes made while putting a step back are not steps
  quiet(fn) {
    this.silent++;
    try { return fn(); } finally { this.silent--; }
  }

  undo() {
    if (!this.past.length) return null;
    this.future.push(this.cur);
    this.cur = this.past.pop();
    this.kind = null;
    this.changed();
    return this.cur;
  }
  redo() {
    if (!this.future.length) return null;
    this.past.push(this.cur);
    this.cur = this.future.pop();
    this.kind = null;
    this.changed();
    return this.cur;
  }
}
