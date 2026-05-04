/**
 * CtrlK Shortcut Engine — Scope-aware keyboard shortcuts with chords.
 * @module @ctrlk/keys
 */
const RESERVED = new Set(['ctrl+t','ctrl+w','ctrl+n','ctrl+tab','ctrl+shift+tab','f5','f11','f12','ctrl+shift+i','ctrl+shift+j']);
const MODIFIER_KEYS = new Set(['Control','Shift','Alt','Meta']);

export class ShortcutEngine {
  constructor(bus, commands) {
    this._bus = bus; this._commands = commands;
    this._bindings = new Map(); this._chords = new Map();
    this._scopes = new Map(); this._scopes.set('global', { element: null, parent: null });
    this._activeScope = 'global'; this._enabled = true;
    this._ignoreTags = new Set(['INPUT','TEXTAREA','SELECT']);
    this._pendingChordPrefix = null; this._chordTimer = null; this._chordTimeout = 800;
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleFocusIn = this._handleFocusIn.bind(this);
    this._attached = false;
  }
  attach() { if (this._attached) return; document.addEventListener('keydown', this._handleKeyDown, true); document.addEventListener('focusin', this._handleFocusIn, true); this._attached = true; }
  detach() { if (!this._attached) return; document.removeEventListener('keydown', this._handleKeyDown, true); document.removeEventListener('focusin', this._handleFocusIn, true); this._attached = false; }
  setEnabled(e) { this._enabled = !!e; }
  registerScope(id, { element, parent = 'global' }) { this._scopes.set(id, { element, parent }); }
  bind(combo, commandId, options = {}) {
    const { scope = 'global', when = null } = options;
    const n = this._normalize(combo);
    if (RESERVED.has(n)) { console.warn(`[CtrlK] Cannot bind reserved: ${combo}`); return () => {}; }
    if (!this._bindings.has(n)) this._bindings.set(n, []);
    const b = { commandId, scope, when };
    this._bindings.get(n).push(b);
    const cmd = this._commands.get(commandId); if (cmd && !cmd.shortcut) cmd.shortcut = combo;
    this._bus.emit('keys:bound', { combo: n, commandId, scope });
    return () => { const arr = this._bindings.get(n); if (arr) { const i = arr.indexOf(b); if (i !== -1) arr.splice(i, 1); if (!arr.length) this._bindings.delete(n); } };
  }
  chord(sequence, commandId, options = {}) {
    const { scope = 'global' } = options;
    if (!Array.isArray(sequence) || sequence.length < 2) throw new Error('[CtrlK] Chord must be array of 2+ combos');
    const ns = sequence.map(s => this._normalize(s)); const prefix = ns[0];
    if (!this._chords.has(prefix)) this._chords.set(prefix, []);
    this._chords.get(prefix).push({ sequence: ns, commandId, scope });
    this._bus.emit('keys:chord-bound', { sequence: ns, commandId, scope });
    return () => { const arr = this._chords.get(prefix); if (arr) { const ch = arr.find(c => c.commandId === commandId); if (ch) arr.splice(arr.indexOf(ch), 1); } };
  }
  unbindAll(commandId) {
    for (const [c, bs] of this._bindings) { const f = bs.filter(b => b.commandId !== commandId); if (!f.length) this._bindings.delete(c); else this._bindings.set(c, f); }
  }
  getAll() {
    const r = [];
    for (const [c, bs] of this._bindings) for (const b of bs) {
      const cmd = this._commands.get(b.commandId);
      r.push({ combo: this._displayCombo(c), commandId: b.commandId, scope: b.scope, title: cmd?.title || b.commandId, category: cmd?.category || 'General' });
    }
    return r.sort((a, b) => a.category.localeCompare(b.category) || a.combo.localeCompare(b.combo));
  }
  getConflicts() {
    const conflicts = [];
    for (const [c, bs] of this._bindings) {
      const byScope = new Map(); for (const b of bs) { if (!byScope.has(b.scope)) byScope.set(b.scope, []); byScope.get(b.scope).push(b.commandId); }
      for (const [s, cmds] of byScope) { if (cmds.length > 1) conflicts.push({ combo: this._displayCombo(c), scope: s, commands: cmds }); }
    }
    return conflicts;
  }
  _handleKeyDown(event) {
    if (!this._enabled) return;
    const target = event.target; const isInput = this._ignoreTags.has(target.tagName) || target.isContentEditable;
    const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
    if (isInput && !hasModifier) return;
    if (MODIFIER_KEYS.has(event.key)) return;
    const combo = this._comboFromEvent(event);
    if (this._pendingChordPrefix) {
      clearTimeout(this._chordTimer);
      const chords = this._chords.get(this._pendingChordPrefix) || [];
      for (const ch of chords) { if (ch.sequence.length === 2 && ch.sequence[1] === combo && this._isScopeActive(ch.scope)) { event.preventDefault(); event.stopPropagation(); this._pendingChordPrefix = null; this._commands.execute(ch.commandId); return; } }
      this._pendingChordPrefix = null;
    }
    if (this._chords.has(combo) && !this._findBinding(combo)) {
      this._pendingChordPrefix = combo;
      this._chordTimer = setTimeout(() => { this._pendingChordPrefix = null; }, this._chordTimeout);
      event.preventDefault(); this._bus.emit('keys:chord-pending', { prefix: this._displayCombo(combo) }); return;
    }
    const binding = this._findBinding(combo);
    if (binding) { event.preventDefault(); event.stopPropagation(); this._commands.execute(binding.commandId); }
  }
  _findBinding(combo) {
    const bs = this._bindings.get(combo); if (!bs?.length) return null;
    let scope = this._activeScope;
    while (scope) { for (const b of bs) { if (b.scope === scope && (!b.when || b.when())) return b; } const sd = this._scopes.get(scope); scope = sd?.parent || (scope !== 'global' ? 'global' : null); }
    return null;
  }
  _handleFocusIn(event) {
    let el = event.target, ns = 'global';
    while (el && el !== document.body) { const s = el.getAttribute?.('data-ctrlk-scope'); if (s && this._scopes.has(s)) { ns = s; break; } el = el.parentElement; }
    if (ns !== this._activeScope) { const prev = this._activeScope; this._activeScope = ns; this._bus.emit('keys:scope-changed', { from: prev, to: ns }); }
  }
  _isScopeActive(scope) {
    if (scope === 'global') return true;
    let c = this._activeScope; while (c) { if (c === scope) return true; const d = this._scopes.get(c); c = d?.parent || (c !== 'global' ? 'global' : null); } return false;
  }
  _comboFromEvent(e) {
    const p = []; if (e.ctrlKey || e.metaKey) p.push('ctrl'); if (e.altKey) p.push('alt'); if (e.shiftKey) p.push('shift');
    let k = e.key.toLowerCase();
    const map = {' ':'space','escape':'esc','arrowup':'up','arrowdown':'down','arrowleft':'left','arrowright':'right'};
    if (map[k]) k = map[k]; p.push(k); return p.join('+');
  }
  _normalize(c) { return c.toLowerCase().split('+').map(s=>s.trim()).filter(Boolean).sort((a,b)=>{const o={ctrl:0,alt:1,shift:2};return(o[a]??3)-(o[b]??3)}).join('+'); }
  _displayCombo(n) {
    const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
    return n.split('+').map(p => { if (mac) { if (p==='ctrl') return '⌘'; if (p==='alt') return '⌥'; if (p==='shift') return '⇧'; }
      else { if (p==='ctrl') return 'Ctrl'; if (p==='alt') return 'Alt'; if (p==='shift') return 'Shift'; }
      if (p==='space') return 'Space'; if (p==='esc') return 'Esc'; return p.toUpperCase(); }).join(mac ? '' : '+');
  }
}
