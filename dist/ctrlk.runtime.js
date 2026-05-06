/**
 * CtrlK v1.0.0 — Power-User Runtime for Enterprise Web Applications
 * ctrlk.dev · MIT License
 * 
 * 18 modules · 153 tests · Zero dependencies
 * 
 * Drop-in: <script src="ctrlk.runtime.js"></script>
 * The command palette opens with Ctrl+K. Zero config.
 * 
 * Built: 2026-05-06T09:01:28.697Z
 */
(function(global) {
'use strict';

  // ═══ event-bus.js ═══
/**
 * CtrlK EventBus — Central nervous system of the runtime.
 * Namespaced events, wildcards, once listeners, error isolation.
 * @module @ctrlk/core/event-bus
 */
class EventBus {
  constructor() {
    this._listeners = new Map();
    this._onceListeners = new Map();
    this._wildcardListeners = new Set();
    this._debug = false;
  }
  on(event, handler) {
    if (typeof handler !== 'function') throw new Error(`[CtrlK] EventBus.on: handler must be a function`);
    if (event === '*') { this._wildcardListeners.add(handler); return () => this._wildcardListeners.delete(handler); }
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => { const s = this._listeners.get(event); if (s) { s.delete(handler); if (!s.size) this._listeners.delete(event); } };
  }
  once(event, handler) {
    if (!this._onceListeners.has(event)) this._onceListeners.set(event, new Set());
    this._onceListeners.get(event).add(handler);
    return () => { const s = this._onceListeners.get(event); if (s) s.delete(handler); };
  }
  emit(event, data) {
    if (this._debug) console.log(`[CtrlK] Event: ${event}`, data);
    const fire = (set) => { for (const h of set) { try { h(data, event); } catch (err) { console.error(`[CtrlK] Error in ${event}:`, err); } } };
    const l = this._listeners.get(event); if (l) fire(l);
    const o = this._onceListeners.get(event); if (o) { fire(o); this._onceListeners.delete(event); }
    const ns = event.split(':')[0]; const nsl = this._listeners.get(`${ns}:*`); if (nsl) fire(nsl);
    if (this._wildcardListeners.size) fire(this._wildcardListeners);
  }
  off(event) {
    if (event === undefined) { this._listeners.clear(); this._onceListeners.clear(); this._wildcardListeners.clear(); }
    else { this._listeners.delete(event); this._onceListeners.delete(event); }
  }
  setDebug(enabled) { this._debug = !!enabled; }
  listenerCount(event) { return (this._listeners.get(event)?.size || 0) + (this._onceListeners.get(event)?.size || 0); }
}


  // ═══ command-registry.js ═══
/**
 * CtrlK Command Registry — Every app action as a named, invocable command.
 * Fuzzy search, when predicates, execution logging.
 * @module @ctrlk/core/command-registry
 */
class CommandRegistry {
  constructor(bus) {
    this._bus = bus;
    this._commands = new Map();
    this._executionLog = [];
    this._logLimit = 500;
  }
  register(def) {
    if (!def.id || typeof def.id !== 'string') throw new Error('[CtrlK] Command must have a string id');
    if (typeof def.execute !== 'function') throw new Error(`[CtrlK] Command "${def.id}" must have an execute function`);
    if (this._commands.has(def.id)) console.warn(`[CtrlK] Command "${def.id}" already registered — overwriting`);
    const command = { id: def.id, title: def.title || def.id, category: def.category || 'General', execute: def.execute,
      when: def.when || null, undo: def.undo || null, icon: def.icon || null, shortcut: def.shortcut || null,
      description: def.description || null, _registeredAt: Date.now() };
    this._commands.set(def.id, command);
    this._bus.emit('command:registered', { id: def.id, title: command.title, category: command.category });
    return () => this.unregister(def.id);
  }
  registerMany(defs) { const u = defs.map(d => this.register(d)); return () => u.forEach(fn => fn()); }
  unregister(id) { if (this._commands.delete(id)) this._bus.emit('command:unregistered', { id }); }
  execute(id, ...args) {
    const cmd = this._commands.get(id);
    if (!cmd) { console.warn(`[CtrlK] Command not found: "${id}"`); return undefined; }
    if (cmd.when && !cmd.when()) { console.warn(`[CtrlK] Command "${id}" not available in current context`); return undefined; }
    let result;
    try { result = cmd.execute(...args); } catch (err) { console.error(`[CtrlK] Error executing "${id}":`, err); this._bus.emit('command:error', { id, error: err, args }); throw err; }
    const entry = { id, args, timestamp: Date.now(), result, undoable: !!cmd.undo };
    this._executionLog.push(entry);
    if (this._executionLog.length > this._logLimit) this._executionLog.shift();
    this._bus.emit('command:executed', entry);
    return result;
  }
  get(id) { return this._commands.get(id); }
  has(id) { return this._commands.has(id); }
  getAvailable() { return [...this._commands.values()].filter(c => !c.when || c.when()); }
  getAll() { return Array.from(this._commands.values()); }
  search(query, options = {}) {
    const { onlyAvailable = true, limit = 20 } = options;
    const cmds = onlyAvailable ? this.getAvailable() : this.getAll();
    const q = (query || '').toLowerCase().trim();
    if (!q) return cmds.slice(0, limit).map(c => ({ command: c, score: 0, matches: [] }));
    const results = [];
    for (const cmd of cmds) {
      const { score, matches } = this._scoreCommand(cmd, q);
      if (score > 0) results.push({ command: cmd, score, matches });
    }
    return results.sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title)).slice(0, limit);
  }
  getGrouped(onlyAvailable = true) {
    const cmds = onlyAvailable ? this.getAvailable() : this.getAll();
    const groups = new Map();
    for (const cmd of cmds) { if (!groups.has(cmd.category)) groups.set(cmd.category, []); groups.get(cmd.category).push(cmd); }
    return groups;
  }
  getLog(limit = 50) { return this._executionLog.slice(-limit); }
  clear() { this._commands.clear(); this._bus.emit('command:cleared', {}); }
  _scoreCommand(cmd, q) {
    let score = 0; const matches = [];
    const fields = [{ text: cmd.title, weight: 10 }, { text: cmd.id, weight: 6 }, { text: cmd.category, weight: 4 }, { text: cmd.description || '', weight: 3 }];
    for (const { text, weight } of fields) {
      const lower = text.toLowerCase();
      if (lower === q) { score += weight * 10; matches.push(text); }
      else if (lower.startsWith(q)) { score += weight * 5; matches.push(text); }
      else if (lower.includes(q)) { score += weight * 3; matches.push(text); }
      else { const words = lower.split(/[\s.\-_:]+/); for (const w of words) { if (w.startsWith(q)) { score += weight * 2; matches.push(text); break; } }
        if (score === 0 && this._fuzzyMatch(lower, q)) { score += weight; matches.push(text); } }
    }
    return { score, matches };
  }
  _fuzzyMatch(text, query) { let qi = 0; for (let i = 0; i < text.length && qi < query.length; i++) { if (text[i] === query[qi]) qi++; } return qi === query.length; }
}


  // ═══ shortcut-engine.js ═══
/**
 * CtrlK Shortcut Engine — Scope-aware keyboard shortcuts with chords.
 * @module @ctrlk/keys
 */
const RESERVED = new Set(['ctrl+t','ctrl+w','ctrl+n','ctrl+tab','ctrl+shift+tab','f5','f11','f12','ctrl+shift+i','ctrl+shift+j']);
const MODIFIER_KEYS = new Set(['Control','Shift','Alt','Meta']);

class ShortcutEngine {
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


  // ═══ command-palette.js ═══
/**
 * CtrlK Command Palette — Ctrl+K searchable command UI.
 * Self-contained: injects its own DOM and styles.
 * @module @ctrlk/palette
 */
const PALETTE_CSS = `.ctrlk-po{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99998;opacity:0;transition:opacity .15s;backdrop-filter:blur(2px)}.ctrlk-po.ctrlk-v{opacity:1}.ctrlk-p{position:fixed;top:20%;left:50%;transform:translateX(-50%) scale(.96);width:min(560px,90vw);max-height:420px;background:#1a1b23;border:1px solid #2a2b38;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5);z-index:99999;display:flex;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;opacity:0;transition:opacity .15s,transform .15s}.ctrlk-p.ctrlk-v{opacity:1;transform:translateX(-50%) scale(1)}.ctrlk-pi-w{display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid #2a2b38;gap:10px}.ctrlk-pi{flex:1;background:0;border:0;outline:0;color:#e8eaf0;font-size:15px;font-family:inherit;caret-color:#e8a44a}.ctrlk-pi::placeholder{color:#4a4d62}.ctrlk-pr{flex:1;overflow-y:auto;padding:6px 0;scrollbar-width:thin;scrollbar-color:#2a2b38 transparent}.ctrlk-pc{padding:8px 16px 4px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#4a4d62}.ctrlk-px{display:flex;align-items:center;padding:8px 16px;cursor:pointer;gap:10px;transition:background .1s}.ctrlk-px:hover,.ctrlk-px.ctrlk-s{background:#25263a}.ctrlk-px-i{width:20px;text-align:center;font-size:14px;flex-shrink:0}.ctrlk-px-b{flex:1;min-width:0}.ctrlk-px-t{font-size:13px;color:#c8ccd8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ctrlk-px-d{font-size:11px;color:#4a4d62}.ctrlk-px-k{flex-shrink:0;display:flex;gap:3px}.ctrlk-kbd{display:inline-block;padding:2px 6px;font-size:10px;font-family:'SF Mono',Consolas,monospace;color:#8a8da2;background:#12131a;border:1px solid #2a2b38;border-radius:3px}.ctrlk-pe{padding:20px 16px;text-align:center;color:#4a4d62;font-size:13px}.ctrlk-pf{display:flex;align-items:center;gap:12px;padding:8px 16px;border-top:1px solid #2a2b38;font-size:10px;color:#4a4d62}.ctrlk-pf kbd{padding:1px 5px;font-size:10px;color:#6b6e82;background:#12131a;border:1px solid #2a2b38;border-radius:2px}.ctrlk-ci{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a1b23;border:1px solid #e8a44a40;border-radius:6px;padding:8px 16px;font-family:monospace;font-size:13px;color:#e8a44a;z-index:99997;opacity:0;transition:opacity .15s;pointer-events:none}.ctrlk-ci.ctrlk-v{opacity:1}`;

class CommandPalette {
  constructor(bus, commands) {
    this._bus = bus; this._commands = commands;
    this._root = null; this._overlay = null; this._input = null; this._resultsList = null; this._chordIndicator = null;
    this._isOpen = false; this._selectedIndex = 0; this._currentResults = []; this._recentCommandIds = []; this._injected = false;
  }
  inject() {
    if (this._injected) return;
    const s = document.createElement('style'); s.id = 'ctrlk-palette-styles'; s.textContent = PALETTE_CSS; document.head.appendChild(s);
    this._overlay = document.createElement('div'); this._overlay.className = 'ctrlk-po'; this._overlay.addEventListener('click', () => this.close());
    this._root = document.createElement('div'); this._root.className = 'ctrlk-p'; this._root.setAttribute('role', 'dialog');
    this._root.innerHTML = `<div class="ctrlk-pi-w"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b6e82" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input class="ctrlk-pi" type="text" placeholder="Type a command..." autocomplete="off" spellcheck="false"/><span style="font-size:11px;color:#4a4d62">ESC</span></div><div class="ctrlk-pr" role="listbox"></div><div class="ctrlk-pf"><span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> execute</span><span><kbd>Esc</kbd> close</span></div>`;
    this._input = this._root.querySelector('.ctrlk-pi'); this._resultsList = this._root.querySelector('.ctrlk-pr');
    this._input.addEventListener('input', () => this._onInput()); this._root.addEventListener('keydown', (e) => this._onKeyDown(e));
    this._chordIndicator = document.createElement('div'); this._chordIndicator.className = 'ctrlk-ci';
    document.body.appendChild(this._overlay); document.body.appendChild(this._root); document.body.appendChild(this._chordIndicator);
    this._bus.on('keys:chord-pending', ({ prefix }) => { this._chordIndicator.textContent = `${prefix} → ...`; this._chordIndicator.classList.add('ctrlk-v'); setTimeout(() => this._chordIndicator.classList.remove('ctrlk-v'), 900); });
    this._bus.on('command:executed', ({ id }) => { this._recentCommandIds = [id, ...this._recentCommandIds.filter(r => r !== id)].slice(0, 5); });
    this._injected = true;
  }
  open() { if (this._isOpen) return; this._isOpen = true; this._selectedIndex = 0; this._input.value = ''; this._overlay.classList.add('ctrlk-v'); this._root.classList.add('ctrlk-v'); requestAnimationFrame(() => { this._input.focus(); this._onInput(); }); this._bus.emit('palette:opened', {}); }
  close() { if (!this._isOpen) return; this._isOpen = false; this._overlay.classList.remove('ctrlk-v'); this._root.classList.remove('ctrlk-v'); this._bus.emit('palette:closed', {}); }
  toggle() { this._isOpen ? this.close() : this.open(); }
  get isOpen() { return this._isOpen; }
  _onInput() { const q = this._input.value.trim(); this._currentResults = this._commands.search(q, { onlyAvailable: true, limit: 25 }); this._selectedIndex = 0; this._renderResults(q); }
  _onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); this._selectedIndex = Math.min(this._selectedIndex + 1, this._currentResults.length - 1); this._updateSelection(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this._selectedIndex = Math.max(this._selectedIndex - 1, 0); this._updateSelection(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (this._currentResults[this._selectedIndex]) { const cmd = this._currentResults[this._selectedIndex].command; this.close(); requestAnimationFrame(() => this._commands.execute(cmd.id)); } }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
  }
  _renderResults(q) {
    if (!this._currentResults.length) { this._resultsList.innerHTML = `<div class="ctrlk-pe">${q ? `No commands matching "${q}"` : 'No commands registered'}</div>`; return; }
    const groups = new Map();
    if (!q && this._recentCommandIds.length) { const rec = []; for (const id of this._recentCommandIds) { const f = this._currentResults.find(r => r.command.id === id); if (f) rec.push(f); } if (rec.length) groups.set('Recent', rec); }
    for (const r of this._currentResults) { const c = r.command.category; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(r); }
    let html = '', gi = 0;
    for (const [cat, items] of groups) { html += `<div class="ctrlk-pc">${this._esc(cat)}</div>`;
      for (const { command: cmd } of items) { const sel = gi === this._selectedIndex ? ' ctrlk-s' : '';
        const sk = cmd.shortcut ? `<div class="ctrlk-px-k">${cmd.shortcut.split('+').map(k => `<span class="ctrlk-kbd">${k.trim()}</span>`).join('')}</div>` : '';
        html += `<div class="ctrlk-px${sel}" data-index="${gi}"><div class="ctrlk-px-i">${cmd.icon || '›'}</div><div class="ctrlk-px-b"><div class="ctrlk-px-t">${this._esc(cmd.title)}</div></div>${sk}</div>`; gi++; } }
    this._resultsList.innerHTML = html;
    this._resultsList.querySelectorAll('.ctrlk-px').forEach(el => {
      el.addEventListener('click', () => { const i = +el.dataset.index; if (this._currentResults[i]) { this.close(); requestAnimationFrame(() => this._commands.execute(this._currentResults[i].command.id)); } });
      el.addEventListener('mouseenter', () => { this._selectedIndex = +el.dataset.index; this._updateSelection(); }); });
  }
  _updateSelection() { const items = this._resultsList.querySelectorAll('.ctrlk-px'); items.forEach((el, i) => el.classList.toggle('ctrlk-s', i === this._selectedIndex)); const s = items[this._selectedIndex]; if (s) s.scrollIntoView({ block: 'nearest' }); }
  _esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
}


  // ═══ density-controller.js ═══
/**
 * CtrlK Density Controller — User-controlled information density.
 * Three levels via CSS custom properties. Zero JavaScript layout recalculation.
 * @module @ctrlk/density
 */
const LEVELS = {
  compact: {'--vlx-density':'compact','--vlx-row-height':'28px','--vlx-cell-padding':'2px 6px','--vlx-font-size':'12px','--vlx-font-size-sm':'11px','--vlx-font-size-xs':'9px','--vlx-spacing-xs':'2px','--vlx-spacing-sm':'4px','--vlx-spacing-md':'8px','--vlx-spacing-lg':'12px','--vlx-border-radius':'2px','--vlx-icon-size':'14px','--vlx-chrome-display':'none','--vlx-help-display':'none'},
  comfortable: {'--vlx-density':'comfortable','--vlx-row-height':'40px','--vlx-cell-padding':'6px 12px','--vlx-font-size':'14px','--vlx-font-size-sm':'13px','--vlx-font-size-xs':'11px','--vlx-spacing-xs':'4px','--vlx-spacing-sm':'8px','--vlx-spacing-md':'16px','--vlx-spacing-lg':'24px','--vlx-border-radius':'4px','--vlx-icon-size':'18px','--vlx-chrome-display':'block','--vlx-help-display':'none'},
  spacious: {'--vlx-density':'spacious','--vlx-row-height':'52px','--vlx-cell-padding':'10px 16px','--vlx-font-size':'16px','--vlx-font-size-sm':'14px','--vlx-font-size-xs':'12px','--vlx-spacing-xs':'6px','--vlx-spacing-sm':'12px','--vlx-spacing-md':'24px','--vlx-spacing-lg':'32px','--vlx-border-radius':'6px','--vlx-icon-size':'22px','--vlx-chrome-display':'block','--vlx-help-display':'block'},
};
class DensityController {
  constructor(bus) { this._bus = bus; this._level = 'comfortable'; }
  init() { try { const s = localStorage.getItem('ctrlk-density'); if (s && LEVELS[s]) this._level = s; } catch(e){} this._apply(); }
  set(level) { if (!LEVELS[level]) return; const p = this._level; this._level = level; this._apply(); try { localStorage.setItem('ctrlk-density', level); } catch(e){} this._bus.emit('density:changed', { level, previous: p }); }
  current() { return this._level; }
  cycle() { const o = ['compact','comfortable','spacious']; this.set(o[(o.indexOf(this._level)+1)%3]); }
  getVars() { return { ...LEVELS[this._level] }; }
  getLevels() { return JSON.parse(JSON.stringify(LEVELS)); }
  _apply() { const v = LEVELS[this._level]; const r = document.documentElement; for (const [p, val] of Object.entries(v)) r.style.setProperty(p, val); r.setAttribute('data-vlx-density', this._level); }
}


  // ═══ auto-discover.js ═══
/**
 * CtrlK Auto-Discovery — Pattern A drop-in.
 * Scans DOM for interactive elements, registers them as commands.
 * Uses MutationObserver for dynamic content.
 * @module @ctrlk/core/auto-discover
 */
class AutoDiscovery {
  constructor(commands, keys, bus) { this._commands = commands; this._keys = keys; this._bus = bus; this._observer = null; this._ids = new Set(); this._scanTimeout = null; }
  start() { this._scan(); this._observer = new MutationObserver(() => { clearTimeout(this._scanTimeout); this._scanTimeout = setTimeout(() => this._scan(), 200); }); this._observer.observe(document.body, { childList: true, subtree: true }); }
  stop() { if (this._observer) { this._observer.disconnect(); this._observer = null; } }
  rescan() { this._scan(); }
  _scan() { this._scanExplicit(); this._scanButtons(); this._scanLinks(); this._scanScopes(); }
  _scanExplicit() {
    document.querySelectorAll('[data-ctrlk-command]').forEach(el => {
      const id = el.getAttribute('data-ctrlk-command'); if (this._ids.has(id)) return;
      const title = el.getAttribute('data-ctrlk-title') || el.textContent?.trim() || id;
      const category = el.getAttribute('data-ctrlk-category') || 'Actions';
      const shortcut = el.getAttribute('data-ctrlk-shortcut');
      const icon = el.getAttribute('data-ctrlk-icon') || '⚡';
      this._commands.register({ id, title, category, icon, execute: () => el.click() });
      if (shortcut) this._keys.bind(shortcut, id);
      this._ids.add(id);
    });
  }
  _scanButtons() {
    document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]').forEach(btn => {
      if (btn.closest('.ctrlk-p, .ctrlk-po')) return;
      if (btn.offsetParent === null) return;
      const text = this._getLabel(btn); if (!text || text.length < 2 || text.length > 60) return;
      const id = this._makeId('btn', text); if (this._ids.has(id)) return;
      this._commands.register({ id, title: text, category: 'Buttons', icon: '🔘', execute: () => btn.click(), when: () => btn.offsetParent !== null && !btn.disabled });
      this._ids.add(id);
    });
  }
  _scanLinks() {
    document.querySelectorAll('a[href]').forEach(link => {
      if (link.closest('.ctrlk-p, .ctrlk-po')) return;
      const text = this._getLabel(link); const href = link.getAttribute('href');
      if (!text || text.length < 2 || text.length > 60) return; if (!href || href === '#' || href.startsWith('javascript:')) return;
      const id = this._makeId('nav', text); if (this._ids.has(id)) return;
      this._commands.register({ id, title: `Go to: ${text}`, category: 'Navigation', icon: '→', execute: () => link.click() });
      this._ids.add(id);
    });
  }
  _scanScopes() {
    document.querySelectorAll('[data-ctrlk-scope]').forEach(el => {
      const id = el.getAttribute('data-ctrlk-scope');
      const parent = el.getAttribute('data-ctrlk-scope-parent') || 'global';
      this._keys.registerScope(id, { element: el, parent });
    });
  }
  _getLabel(el) { return el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent?.trim().replace(/\s+/g, ' '); }
  _makeId(prefix, text) { return `auto.${prefix}.${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`; }
}


  // ═══ grid-adapter.js ═══
/**
 * CtrlK Grid Adapter Interface
 * ──────────────────────────────────────────────
 * The bridge between ctrlk and any grid library.
 * 
 * ctrlk never talks to AG Grid, DevExtreme, or Kendo directly.
 * Instead, it talks to this interface. Each grid library provides
 * an adapter that implements these methods using its own API.
 * 
 * Adapter packages:
 *   @ctrlk/ag-grid      → AG Grid Community/Enterprise
 *   @ctrlk/devextreme   → DevExtreme DataGrid
 *   @ctrlk/kendo        → Kendo UI Grid
 *   @ctrlk/generic      → Vanilla HTML tables / custom grids
 * 
 * Adapters handle the fact that customers heavily customize
 * these libraries. The adapter wraps whatever customized API
 * surface exists, normalizing it to ctrlk's interface.
 * 
 * @module @ctrlk/core/grid-adapter
 * @author Prabhu Raja
 */

/**
 * @typedef {Object} ColumnDef
 * @property {string} colId - Unique column identifier
 * @property {string} headerName - Display name
 * @property {boolean} visible - Currently visible
 * @property {number} width - Column width in px
 * @property {number} order - Display order index
 * @property {boolean} pinned - 'left', 'right', or false
 * @property {string} [sort] - 'asc', 'desc', or null
 * @property {number} [sortIndex] - Multi-sort order
 */

/**
 * @typedef {Object} FilterState
 * @property {string} colId - Column this filter applies to
 * @property {string} type - Filter type: 'text', 'number', 'date', 'set'
 * @property {*} value - Filter value(s)
 * @property {string} [operator] - 'equals', 'contains', 'greaterThan', etc.
 */

/**
 * @typedef {Object} GridState
 * @property {ColumnDef[]} columns - Full column state
 * @property {FilterState[]} filters - Active filters
 * @property {Object[]} sort - Sort model
 * @property {number} scrollTop - Vertical scroll position
 * @property {number} scrollLeft - Horizontal scroll position
 * @property {string[]} selectedRowIds - Currently selected row IDs
 * @property {Object} [custom] - Adapter-specific state (for customized grids)
 */

/**
 * @typedef {Object} CellPosition
 * @property {string} rowId - Row identifier
 * @property {string} colId - Column identifier
 * @property {number} rowIndex - Visual row index
 * @property {number} colIndex - Visual column index
 */

/**
 * Abstract base class for grid adapters.
 * Extend this for each grid library.
 */
class GridAdapter {
  /**
   * @param {Object} gridInstance - The grid library's API instance
   *   AG Grid: gridApi
   *   DevExtreme: dataGrid instance
   *   Kendo: grid widget
   */
  constructor(gridInstance) {
    if (new.target === GridAdapter) {
      throw new Error('[CtrlK] GridAdapter is abstract — use a specific adapter like @ctrlk/ag-grid');
    }
    this._grid = gridInstance;
  }

  // ═══════════════════════════════════════════
  // STATE — Capture & Restore
  // ═══════════════════════════════════════════

  /**
   * Capture the complete grid state.
   * @returns {GridState}
   */
  captureState() { throw new Error('Not implemented'); }

  /**
   * Restore a previously captured grid state.
   * @param {GridState} state
   */
  restoreState(state) { throw new Error('Not implemented'); }

  // ═══════════════════════════════════════════
  // COLUMNS — Visibility, Order, Navigation
  // ═══════════════════════════════════════════

  /**
   * Get all column definitions.
   * @returns {ColumnDef[]}
   */
  getColumns() { throw new Error('Not implemented'); }

  /**
   * Get only visible columns in display order.
   * @returns {ColumnDef[]}
   */
  getVisibleColumns() { throw new Error('Not implemented'); }

  /**
   * Show/hide columns by ID.
   * @param {Object<string, boolean>} visibility - { colId: visible }
   */
  setColumnVisibility(visibility) { throw new Error('Not implemented'); }

  /**
   * Set column order.
   * @param {string[]} colIds - Column IDs in desired order
   */
  setColumnOrder(colIds) { throw new Error('Not implemented'); }

  /**
   * Scroll to make a column visible in the viewport.
   * @param {string} colId
   */
  ensureColumnVisible(colId) { throw new Error('Not implemented'); }

  /**
   * Search columns by name (for column navigator).
   * @param {string} query
   * @returns {ColumnDef[]} Matching columns
   */
  searchColumns(query) {
    // Default implementation — adapters can override for custom behavior
    const q = query.toLowerCase();
    return this.getColumns().filter(c =>
      c.headerName.toLowerCase().includes(q) ||
      c.colId.toLowerCase().includes(q)
    );
  }

  // ═══════════════════════════════════════════
  // ROWS — Selection, Navigation
  // ═══════════════════════════════════════════

  /**
   * Get all row data (or visible/filtered rows).
   * @param {Object} [options]
   * @param {boolean} [options.filtered=true] - Only filtered rows
   * @returns {Object[]}
   */
  getRows(options = {}) { throw new Error('Not implemented'); }

  /**
   * Get the total row count (filtered).
   * @returns {number}
   */
  getRowCount() { throw new Error('Not implemented'); }

  /**
   * Get currently selected row IDs.
   * @returns {string[]}
   */
  getSelectedRowIds() { throw new Error('Not implemented'); }

  /**
   * Set row selection by IDs.
   * @param {string[]} rowIds
   * @param {Object} [options]
   * @param {boolean} [options.additive=false] - Add to existing selection
   */
  setSelectedRowIds(rowIds, options = {}) { throw new Error('Not implemented'); }

  /**
   * Clear all row selection.
   */
  clearSelection() { throw new Error('Not implemented'); }

  /**
   * Scroll to make a row visible.
   * @param {string} rowId
   */
  ensureRowVisible(rowId) { throw new Error('Not implemented'); }

  /**
   * Get the row ID field name.
   * @returns {string}
   */
  getRowIdField() { throw new Error('Not implemented'); }

  // ═══════════════════════════════════════════
  // CELLS — Navigation, Editing (Excel-style)
  // ═══════════════════════════════════════════

  /**
   * Get the currently focused cell.
   * @returns {CellPosition|null}
   */
  getFocusedCell() { throw new Error('Not implemented'); }

  /**
   * Set focus to a specific cell.
   * @param {string} rowId
   * @param {string} colId
   */
  focusCell(rowId, colId) { throw new Error('Not implemented'); }

  /**
   * Start editing the focused cell (F2 behavior).
   */
  startCellEditing() { throw new Error('Not implemented'); }

  /**
   * Stop editing (Enter = commit, Escape = cancel).
   * @param {boolean} cancel - true = discard, false = commit
   */
  stopCellEditing(cancel = false) { throw new Error('Not implemented'); }

  /**
   * Get cell value.
   * @param {string} rowId
   * @param {string} colId
   * @returns {*}
   */
  getCellValue(rowId, colId) { throw new Error('Not implemented'); }

  /**
   * Set cell value.
   * @param {string} rowId
   * @param {string} colId
   * @param {*} value
   */
  setCellValue(rowId, colId, value) { throw new Error('Not implemented'); }

  // ═══════════════════════════════════════════
  // FILTERS
  // ═══════════════════════════════════════════

  /**
   * Get all active filters.
   * @returns {FilterState[]}
   */
  getFilters() { throw new Error('Not implemented'); }

  /**
   * Set filters (replaces existing).
   * @param {FilterState[]} filters
   */
  setFilters(filters) { throw new Error('Not implemented'); }

  /**
   * Clear all filters.
   */
  clearFilters() { throw new Error('Not implemented'); }

  // ═══════════════════════════════════════════
  // SORT
  // ═══════════════════════════════════════════

  /**
   * Get current sort model.
   * @returns {Array<{colId: string, sort: string}>}
   */
  getSortModel() { throw new Error('Not implemented'); }

  /**
   * Set sort model.
   * @param {Array<{colId: string, sort: string}>} sortModel
   */
  setSortModel(sortModel) { throw new Error('Not implemented'); }

  // ═══════════════════════════════════════════
  // SCROLL
  // ═══════════════════════════════════════════

  /**
   * Get scroll position.
   * @returns {{top: number, left: number}}
   */
  getScrollPosition() { throw new Error('Not implemented'); }

  /**
   * Set scroll position.
   * @param {{top?: number, left?: number}} position
   */
  setScrollPosition(position) { throw new Error('Not implemented'); }

  // ═══════════════════════════════════════════
  // EVENTS — Grid lifecycle
  // ═══════════════════════════════════════════

  /**
   * Register a listener for grid events.
   * @param {string} event - 'selectionChanged', 'filterChanged', 'sortChanged',
   *   'cellFocused', 'cellEditStarted', 'cellEditStopped', 'columnMoved'
   * @param {Function} handler
   * @returns {Function} Unsubscribe
   */
  onGridEvent(event, handler) { throw new Error('Not implemented'); }

  /**
   * Export visible data.
   * @param {string} format - 'csv', 'json'
   * @returns {string}
   */
  exportData(format = 'csv') { throw new Error('Not implemented'); }

  /**
   * Destroy the adapter — clean up listeners.
   */
  destroy() { /* override if needed */ }
}


  // ═══ view-state-manager.js ═══
/**
 * CtrlK ViewState Manager
 * ──────────────────────────────────────────────
 * Save, restore, and share complete application view states.
 * 
 * A "view" is not a URL or a page — it's the full picture:
 *   - Grid column configuration (visibility, order, width)
 *   - Active filters
 *   - Sort model
 *   - Scroll position (both vertical and horizontal)
 *   - Selected rows
 *   - Panel states (collapsed/expanded)
 *   - Density level
 *   - Custom app state (anything the app registers)
 * 
 * Views can be:
 *   - Named and saved ("Monday Surveillance", "CLO Compliance")
 *   - Shared as JSON (team presets)
 *   - Auto-saved (last state before navigation)
 *   - Bound to keyboard shortcuts (Ctrl+1 = view 1)
 * 
 * Excel parallel: Named Views = Excel's Custom Views (View → Custom Views)
 * 
 * Storage: localStorage for personal views, exportable JSON for sharing.
 * Grid state is captured via GridAdapter (works with AG Grid, DevExtreme, etc.)
 * 
 * @module @ctrlk/views
 * @author Prabhu Raja
 */

const STORAGE_KEY = 'ctrlk-views';
const AUTOSAVE_KEY = 'ctrlk-views-auto';

/**
 * @typedef {Object} ViewState
 * @property {string} name - View name
 * @property {string} [description] - Optional description
 * @property {Object} grid - Captured grid state (from GridAdapter)
 * @property {Object} [app] - Custom app state (registered via providers)
 * @property {Object} [meta] - Metadata
 * @property {string} meta.createdBy - Who created it
 * @property {number} meta.createdAt - Timestamp
 * @property {number} meta.lastUsed - Last access timestamp
 * @property {string} [meta.scope] - 'personal', 'team', 'global'
 */

class ViewStateManager {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   * @param {Object} [options]
   * @param {number} [options.maxViews=5] - Maximum saved views (LRU eviction when exceeded)
   */
  constructor(bus, options = {}) {
    this._bus = bus;

    /** @type {number} Maximum number of saved views before LRU eviction */
    this._maxViews = options.maxViews || 5;

    /** @type {import('../grid/grid-adapter.js').GridAdapter|null} */
    this._gridAdapter = null;

    /**
     * App-specific state providers.
     * Each provider captures/restores a piece of the view.
     * This is how apps register their own state (panel collapsed, 
     * active tab, custom filter UI state, etc.)
     * @type {Map<string, {capture: Function, restore: Function}>}
     */
    this._providers = new Map();

    /** @type {Map<string, ViewState>} */
    this._views = new Map();

    /** @type {ViewState|null} Auto-saved state (last view before navigation) */
    this._autoSave = null;

    /** @type {string|null} Currently active view name */
    this._activeView = null;

    this._loaded = false;
  }

  /**
   * Set the grid adapter (AG Grid, DevExtreme, Kendo, etc.)
   * @param {import('../grid/grid-adapter.js').GridAdapter} adapter
   */
  setGridAdapter(adapter) {
    this._gridAdapter = adapter;
  }

  /**
   * Register a state provider for app-specific state.
   * 
   * Example:
   *   ctrlk.views.registerProvider('sidebar', {
   *     capture: () => ({ collapsed: sidebar.isCollapsed, activeTab: sidebar.activeTab }),
   *     restore: (state) => { sidebar.setCollapsed(state.collapsed); sidebar.setActiveTab(state.activeTab); }
   *   });
   * 
   * @param {string} key - Unique key for this provider
   * @param {{capture: Function, restore: Function}} provider
   * @returns {Function} Unregister function
   */
  registerProvider(key, provider) {
    if (typeof provider.capture !== 'function' || typeof provider.restore !== 'function') {
      throw new Error(`[CtrlK] ViewState provider "${key}" must have capture() and restore() functions`);
    }
    this._providers.set(key, provider);
    return () => this._providers.delete(key);
  }

  /**
   * Initialize — load saved views from storage.
   */
  init() {
    if (this._loaded) return;
    this._loadFromStorage();
    this._loadAutoSave();
    this._loaded = true;
  }

  // ═══════════════════════════════════════════
  // CAPTURE — Take a snapshot of current state
  // ═══════════════════════════════════════════

  /**
   * Capture the current complete view state.
   * @returns {Object} Raw state object (not yet named/saved)
   */
  capture() {
    const state = {
      grid: null,
      app: {},
      density: null,
      timestamp: Date.now(),
    };

    // Capture grid state
    if (this._gridAdapter) {
      try {
        state.grid = this._gridAdapter.captureState();
      } catch (err) {
        console.warn('[CtrlK] Failed to capture grid state:', err.message);
      }
    }

    // Capture density
    try {
      const density = document.documentElement.getAttribute('data-vlx-density');
      if (density) state.density = density;
    } catch (e) { /* not available */ }

    // Capture app-specific state from all registered providers
    for (const [key, provider] of this._providers) {
      try {
        state.app[key] = provider.capture();
      } catch (err) {
        console.warn(`[CtrlK] Failed to capture provider "${key}":`, err.message);
      }
    }

    return state;
  }

  // ═══════════════════════════════════════════
  // SAVE — Name and persist a view
  // ═══════════════════════════════════════════

  /**
   * Save the current state (or a provided state) as a named view.
   * @param {string} name - View name
   * @param {Object} [options]
   * @param {Object} [options.state] - State to save (defaults to current)
   * @param {string} [options.description] - Optional description
   * @param {string} [options.scope='personal'] - 'personal' or 'team'
   * @param {boolean} [options.overwrite=true] - Overwrite if exists
   * @returns {ViewState}
   */
  save(name, options = {}) {
    const {
      state = null,
      description = '',
      scope = 'personal',
      overwrite = true,
    } = options;

    if (!name || typeof name !== 'string') {
      throw new Error('[CtrlK] View name is required');
    }

    if (this._views.has(name) && !overwrite) {
      throw new Error(`[CtrlK] View "${name}" already exists. Use overwrite: true to replace.`);
    }

    // LRU eviction — if at limit and not overwriting an existing view
    let evicted = null;
    if (!this._views.has(name) && this._views.size >= this._maxViews) {
      // Find the least recently used view
      let oldest = null;
      let oldestTime = Infinity;
      for (const [vName, v] of this._views) {
        const used = v.meta?.lastUsed || v.meta?.createdAt || 0;
        if (used < oldestTime) {
          oldestTime = used;
          oldest = vName;
        }
      }
      if (oldest) {
        evicted = oldest;
        this._views.delete(oldest);
        this._bus.emit('view:evicted', { name: oldest, reason: 'limit', maxViews: this._maxViews });
      }
    }

    const capturedState = state || this.capture();

    // Determine the slot number (1-based position in saved order)
    const existingNames = Array.from(this._views.keys());
    const slotIndex = this._views.has(name) ? existingNames.indexOf(name) : existingNames.length;
    const slotNumber = slotIndex + 1;

    const view = {
      name,
      description,
      ...capturedState,
      meta: {
        createdAt: Date.now(),
        lastUsed: Date.now(),
        scope,
        version: 1,
        slot: slotNumber,
      },
    };

    this._views.set(name, view);
    this._reassignSlots();
    this._persistToStorage();

    this._bus.emit('view:saved', {
      name,
      view,
      slot: view.meta.slot,
      shortcut: view.meta.slot <= 9 ? `Ctrl+${view.meta.slot}` : null,
      totalSaved: this._views.size,
      maxViews: this._maxViews,
      remaining: this._maxViews - this._views.size,
      evicted,
    });
    return view;
  }

  /**
   * Set the maximum number of saved views.
   * @param {number} max
   */
  setMaxViews(max) {
    if (typeof max !== 'number' || max < 1) throw new Error('[CtrlK] maxViews must be >= 1');
    this._maxViews = max;
    // Evict if currently over the new limit
    while (this._views.size > this._maxViews) {
      let oldest = null, oldestTime = Infinity;
      for (const [vName, v] of this._views) {
        const used = v.meta?.lastUsed || 0;
        if (used < oldestTime) { oldestTime = used; oldest = vName; }
      }
      if (oldest) {
        this._views.delete(oldest);
        this._bus.emit('view:evicted', { name: oldest, reason: 'limit-reduced', maxViews: this._maxViews });
      } else break;
    }
    this._reassignSlots();
    this._persistToStorage();
  }

  /**
   * Get the maximum number of saved views.
   * @returns {number}
   */
  getMaxViews() {
    return this._maxViews;
  }

  /**
   * Get all saved views with their slot numbers and shortcuts.
   * @returns {Array<{name: string, slot: number, shortcut: string|null, lastUsed: number}>}
   */
  getSlots() {
    return Array.from(this._views.values()).map(v => ({
      name: v.name,
      slot: v.meta?.slot || 0,
      shortcut: v.meta?.slot <= 9 ? `Ctrl+${v.meta.slot}` : null,
      lastUsed: v.meta?.lastUsed || 0,
    }));
  }

  // ═══════════════════════════════════════════
  // LOAD — Restore a named view
  // ═══════════════════════════════════════════

  /**
   * Load and restore a named view.
   * @param {string} name
   * @param {Object} [options]
   * @param {boolean} [options.autoSaveCurrent=true] - Auto-save current state before switching
   * @returns {boolean} True if loaded successfully
   */
  load(name, options = {}) {
    const { autoSaveCurrent = true } = options;

    const view = this._views.get(name);
    if (!view) {
      console.warn(`[CtrlK] View not found: "${name}"`);
      return false;
    }

    // Auto-save current state before switching
    if (autoSaveCurrent) {
      this.autoSave();
    }

    // Restore grid state
    if (view.grid && this._gridAdapter) {
      try {
        this._gridAdapter.restoreState(view.grid);
      } catch (err) {
        console.warn('[CtrlK] Failed to restore grid state:', err.message);
      }
    }

    // Restore density
    if (view.density) {
      try {
        // Use ctrlk density if available, otherwise set directly
        const event = new CustomEvent('ctrlk:density-set', { detail: view.density });
        document.dispatchEvent(event);
      } catch (e) { /* not available */ }
    }

    // Restore app-specific state
    if (view.app) {
      for (const [key, providerState] of Object.entries(view.app)) {
        const provider = this._providers.get(key);
        if (provider) {
          try {
            provider.restore(providerState);
          } catch (err) {
            console.warn(`[CtrlK] Failed to restore provider "${key}":`, err.message);
          }
        }
      }
    }

    // Update metadata
    view.meta.lastUsed = Date.now();
    this._activeView = name;
    this._persistToStorage();

    this._bus.emit('view:loaded', { name, view });
    return true;
  }

  // ═══════════════════════════════════════════
  // AUTO-SAVE — Preserve state across navigation
  // ═══════════════════════════════════════════

  /**
   * Auto-save the current state (called before navigation).
   * This is the "Back button should restore my filters" mechanism.
   */
  autoSave() {
    this._autoSave = this.capture();
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(this._autoSave));
    } catch (e) { /* storage not available */ }
    this._bus.emit('view:autosaved', {});
  }

  /**
   * Restore the auto-saved state (called after navigation).
   * @returns {boolean} True if restored
   */
  autoRestore() {
    if (!this._autoSave) {
      this._loadAutoSave();
    }
    if (!this._autoSave) return false;

    // Restore the auto-saved state
    const tempView = { ...this._autoSave, name: '__autosave__', app: this._autoSave.app || {} };

    if (tempView.grid && this._gridAdapter) {
      try {
        this._gridAdapter.restoreState(tempView.grid);
      } catch (err) {
        console.warn('[CtrlK] Failed to auto-restore grid state:', err.message);
      }
    }

    if (tempView.app) {
      for (const [key, providerState] of Object.entries(tempView.app)) {
        const provider = this._providers.get(key);
        if (provider) {
          try {
            provider.restore(providerState);
          } catch (err) { /* silent */ }
        }
      }
    }

    this._bus.emit('view:autorestored', {});
    return true;
  }

  // ═══════════════════════════════════════════
  // MANAGE — List, Delete, Export, Import
  // ═══════════════════════════════════════════

  /**
   * List all saved views.
   * @param {Object} [options]
   * @param {string} [options.scope] - Filter by scope
   * @param {string} [options.sortBy='lastUsed'] - 'lastUsed', 'name', 'createdAt'
   * @returns {ViewState[]}
   */
  list(options = {}) {
    const { scope, sortBy = 'lastUsed' } = options;
    let views = Array.from(this._views.values());

    if (scope) {
      views = views.filter(v => v.meta?.scope === scope);
    }

    if (sortBy === 'lastUsed') {
      views.sort((a, b) => (b.meta?.lastUsed || 0) - (a.meta?.lastUsed || 0));
    } else if (sortBy === 'name') {
      views.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'createdAt') {
      views.sort((a, b) => (b.meta?.createdAt || 0) - (a.meta?.createdAt || 0));
    }

    return views;
  }

  /**
   * Get a view by name without restoring it.
   * @param {string} name
   * @returns {ViewState|undefined}
   */
  get(name) {
    return this._views.get(name);
  }

  /**
   * Check if a view exists.
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this._views.has(name);
  }

  /**
   * Delete a saved view.
   * @param {string} name
   * @returns {boolean}
   */
  delete(name) {
    const deleted = this._views.delete(name);
    if (deleted) {
      this._persistToStorage();
      this._bus.emit('view:deleted', { name });
    }
    return deleted;
  }

  /**
   * Rename a view.
   * @param {string} oldName
   * @param {string} newName
   * @returns {boolean}
   */
  rename(oldName, newName) {
    const view = this._views.get(oldName);
    if (!view) return false;
    if (this._views.has(newName)) {
      throw new Error(`[CtrlK] View "${newName}" already exists`);
    }
    view.name = newName;
    this._views.delete(oldName);
    this._views.set(newName, view);
    if (this._activeView === oldName) this._activeView = newName;
    this._persistToStorage();
    this._bus.emit('view:renamed', { oldName, newName });
    return true;
  }

  /**
   * Export a view as a shareable JSON string.
   * @param {string} name
   * @returns {string}
   */
  export(name) {
    const view = this._views.get(name);
    if (!view) throw new Error(`[CtrlK] View not found: "${name}"`);
    return JSON.stringify(view, null, 2);
  }

  /**
   * Export all views as JSON.
   * @returns {string}
   */
  exportAll() {
    return JSON.stringify(Array.from(this._views.values()), null, 2);
  }

  /**
   * Import a view from JSON.
   * @param {string|Object} data - JSON string or parsed object
   * @param {Object} [options]
   * @param {boolean} [options.overwrite=false]
   * @returns {ViewState}
   */
  import(data, options = {}) {
    const { overwrite = false } = options;
    const view = typeof data === 'string' ? JSON.parse(data) : data;

    if (!view.name) throw new Error('[CtrlK] Imported view must have a name');
    if (this._views.has(view.name) && !overwrite) {
      throw new Error(`[CtrlK] View "${view.name}" already exists. Use overwrite: true.`);
    }

    view.meta = view.meta || {};
    view.meta.importedAt = Date.now();
    this._views.set(view.name, view);
    this._persistToStorage();
    this._bus.emit('view:imported', { name: view.name });
    return view;
  }

  /**
   * Get the currently active view name.
   * @returns {string|null}
   */
  getActive() {
    return this._activeView;
  }

  /**
   * Get the number of saved views.
   * @returns {number}
   */
  count() {
    return this._views.size;
  }

  /**
   * Clear all saved views.
   */
  clear() {
    this._views.clear();
    this._persistToStorage();
    this._bus.emit('view:cleared', {});
  }

  // ═══════════════════════════════════════════
  // ACTIVE FILTERS — Quick access strip
  // ═══════════════════════════════════════════

  /**
   * Get active filters from the grid adapter (for filter bar display).
   * @returns {FilterState[]}
   */
  getActiveFilters() {
    if (!this._gridAdapter) return [];
    try {
      return this._gridAdapter.getFilters();
    } catch (err) {
      return [];
    }
  }

  /**
   * Remove a single filter by column ID.
   * @param {string} colId
   */
  removeFilter(colId) {
    if (!this._gridAdapter) return;
    const filters = this._gridAdapter.getFilters().filter(f => f.colId !== colId);
    this._gridAdapter.setFilters(filters);
    this._bus.emit('view:filter-removed', { colId });
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private */
  _persistToStorage() {
    try {
      const data = {};
      for (const [name, view] of this._views) {
        data[name] = view;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* storage not available */ }
  }

  /** @private */
  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        for (const [name, view] of Object.entries(data)) {
          this._views.set(name, view);
        }
        // Enforce limit on load — evict oldest if over max
        while (this._views.size > this._maxViews) {
          let oldest = null, oldestTime = Infinity;
          for (const [vName, v] of this._views) {
            const used = v.meta?.lastUsed || 0;
            if (used < oldestTime) { oldestTime = used; oldest = vName; }
          }
          if (oldest) this._views.delete(oldest); else break;
        }
        this._reassignSlots();
      }
    } catch (e) { /* storage not available or corrupt */ }
  }

  /** @private */
  _loadAutoSave() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        this._autoSave = JSON.parse(raw);
      }
    } catch (e) { /* silent */ }
  }

  /** @private Reassign slot numbers (1-based) to all views */
  _reassignSlots() {
    let slot = 1;
    for (const [, view] of this._views) {
      if (!view.meta) view.meta = {};
      view.meta.slot = slot++;
    }
  }
}


  // ═══ selection-model.js ═══
/**
 * CtrlK Selection Model
 * ──────────────────────────────────────────────
 * Persistent, cross-view selection that survives navigation.
 * 
 * Core principle: selection is a SET, not a visual highlight.
 * The set persists independently of what's visible on screen.
 * 
 * Features:
 *   - Select across pages — page 1 selections survive navigating to page 3
 *   - Named selections — save "Q4 Watchlist" as a persistent set
 *   - Set operations — union, intersect, subtract between selections
 *   - Selection by expression — select all where spread > 500
 *   - Selection count always visible in UI
 * 
 * Excel parallel:
 *   - Ctrl+Click = toggle single item (additive)
 *   - Shift+Click = range select
 *   - Ctrl+A = select all (filtered)
 *   - Ctrl+Space = select entire column
 *   - Shift+Space = select entire row
 *   - Named selections ≈ Excel's Named Ranges
 * 
 * Works with GridAdapter — calls adapter to sync visual selection state.
 * 
 * @module @ctrlk/selection
 * @author Prabhu Raja
 */

const STORAGE_KEY = 'ctrlk-selections';

class SelectionModel {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this._bus = bus;

    /** @type {import('../grid/grid-adapter.js').GridAdapter|null} */
    this._gridAdapter = null;

    /**
     * The active working selection — items selected in the current session.
     * @type {Set<string>}
     */
    this._active = new Set();

    /**
     * Named saved selections — persistent sets.
     * @type {Map<string, {name: string, items: Set<string>, createdAt: number, color?: string}>}
     */
    this._named = new Map();

    /**
     * Selection anchor — for Shift+Click range selection.
     * @type {string|null}
     */
    this._anchor = null;

    /**
     * Row ordering function — maps row ID to a sort index for range selection.
     * Provided by the grid adapter.
     * @type {Function|null}
     */
    this._rowOrderFn = null;
  }

  /**
   * Set the grid adapter for visual sync.
   * @param {import('../grid/grid-adapter.js').GridAdapter} adapter
   */
  setGridAdapter(adapter) {
    this._gridAdapter = adapter;
  }

  /**
   * Initialize — load named selections from storage.
   */
  init() {
    this._loadFromStorage();
  }

  // ═══════════════════════════════════════════
  // ACTIVE SELECTION — Working set
  // ═══════════════════════════════════════════

  /**
   * Add items to the active selection.
   * @param {string|string[]} ids - Row ID(s) to add
   */
  add(ids) {
    const arr = Array.isArray(ids) ? ids : [ids];
    for (const id of arr) {
      this._active.add(id);
    }
    this._syncToGrid();
    this._bus.emit('selection:changed', this._snapshot());
  }

  /**
   * Remove items from the active selection.
   * @param {string|string[]} ids
   */
  remove(ids) {
    const arr = Array.isArray(ids) ? ids : [ids];
    for (const id of arr) {
      this._active.delete(id);
    }
    this._syncToGrid();
    this._bus.emit('selection:changed', this._snapshot());
  }

  /**
   * Toggle an item (Ctrl+Click behavior).
   * @param {string} id
   */
  toggle(id) {
    if (this._active.has(id)) {
      this._active.delete(id);
    } else {
      this._active.add(id);
    }
    this._anchor = id;
    this._syncToGrid();
    this._bus.emit('selection:changed', this._snapshot());
  }

  /**
   * Range select (Shift+Click behavior).
   * Selects all items between the anchor and the target.
   * Requires a row order function or grid adapter.
   * @param {string} targetId
   */
  rangeTo(targetId) {
    if (!this._anchor) {
      this.add(targetId);
      this._anchor = targetId;
      return;
    }

    if (this._gridAdapter) {
      try {
        const rows = this._gridAdapter.getRows({ filtered: true });
        const idField = this._gridAdapter.getRowIdField();
        const ids = rows.map(r => String(r[idField]));
        const anchorIdx = ids.indexOf(this._anchor);
        const targetIdx = ids.indexOf(targetId);

        if (anchorIdx !== -1 && targetIdx !== -1) {
          const start = Math.min(anchorIdx, targetIdx);
          const end = Math.max(anchorIdx, targetIdx);
          for (let i = start; i <= end; i++) {
            this._active.add(ids[i]);
          }
        }
      } catch (err) {
        // Fallback: just add the target
        this._active.add(targetId);
      }
    } else {
      this._active.add(targetId);
    }

    this._syncToGrid();
    this._bus.emit('selection:changed', this._snapshot());
  }

  /**
   * Select all visible/filtered rows (Ctrl+A).
   */
  selectAll() {
    if (this._gridAdapter) {
      try {
        const rows = this._gridAdapter.getRows({ filtered: true });
        const idField = this._gridAdapter.getRowIdField();
        for (const row of rows) {
          this._active.add(String(row[idField]));
        }
      } catch (err) {
        console.warn('[CtrlK] selectAll failed:', err.message);
      }
    }
    this._syncToGrid();
    this._bus.emit('selection:changed', this._snapshot());
  }

  /**
   * Clear the active selection.
   */
  clear() {
    this._active.clear();
    this._anchor = null;
    this._syncToGrid();
    this._bus.emit('selection:changed', this._snapshot());
  }

  /**
   * Check if an item is in the active selection.
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this._active.has(id);
  }

  /**
   * Get all items in the active selection.
   * @returns {string[]}
   */
  all() {
    return Array.from(this._active);
  }

  /**
   * Get the count of selected items.
   * @returns {number}
   */
  count() {
    return this._active.size;
  }

  /**
   * Invert the selection — select all unselected, deselect all selected.
   */
  invert() {
    if (!this._gridAdapter) return;
    try {
      const rows = this._gridAdapter.getRows({ filtered: true });
      const idField = this._gridAdapter.getRowIdField();
      const newSelection = new Set();
      for (const row of rows) {
        const id = String(row[idField]);
        if (!this._active.has(id)) {
          newSelection.add(id);
        }
      }
      this._active = newSelection;
      this._syncToGrid();
      this._bus.emit('selection:changed', this._snapshot());
    } catch (err) {
      console.warn('[CtrlK] invert failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════
  // SELECTION BY EXPRESSION — Query-based select
  // ═══════════════════════════════════════════

  /**
   * Select rows matching a predicate function.
   * 
   * Example:
   *   ctrlk.selection.where(row => row.spread > 500)
   *   ctrlk.selection.where(row => row.rating === 'CCC')
   *   ctrlk.selection.where(row => row.sector === 'Healthcare' && row.warf > 3000)
   * 
   * @param {Function} predicate - Receives row data, returns boolean
   * @param {Object} [options]
   * @param {boolean} [options.additive=false] - Add to existing selection
   * @returns {number} Number of rows matched
   */
  where(predicate, options = {}) {
    const { additive = false } = options;
    if (!this._gridAdapter) return 0;

    if (!additive) {
      this._active.clear();
    }

    try {
      const rows = this._gridAdapter.getRows({ filtered: true });
      const idField = this._gridAdapter.getRowIdField();
      let matched = 0;

      for (const row of rows) {
        if (predicate(row)) {
          this._active.add(String(row[idField]));
          matched++;
        }
      }

      this._syncToGrid();
      this._bus.emit('selection:changed', this._snapshot());
      return matched;
    } catch (err) {
      console.warn('[CtrlK] where() failed:', err.message);
      return 0;
    }
  }

  // ═══════════════════════════════════════════
  // NAMED SELECTIONS — Persistent saved sets
  // ═══════════════════════════════════════════

  /**
   * Save the current active selection as a named set.
   * @param {string} name
   * @param {Object} [options]
   * @param {string} [options.color] - Visual marker color ('red', 'amber', 'green', 'blue')
   * @returns {Object} The saved selection
   */
  save(name, options = {}) {
    const { color = null } = options;
    const saved = {
      name,
      items: new Set(this._active),
      createdAt: Date.now(),
      color,
    };
    this._named.set(name, saved);
    this._persistToStorage();
    this._bus.emit('selection:saved', { name, count: saved.items.size });
    return { name, count: saved.items.size, color };
  }

  /**
   * Load a named selection into the active selection.
   * @param {string} name
   * @param {Object} [options]
   * @param {boolean} [options.additive=false] - Merge with existing
   * @returns {boolean}
   */
  loadNamed(name, options = {}) {
    const { additive = false } = options;
    const saved = this._named.get(name);
    if (!saved) return false;

    if (!additive) {
      this._active.clear();
    }
    for (const id of saved.items) {
      this._active.add(id);
    }

    this._syncToGrid();
    this._bus.emit('selection:loaded', { name, count: saved.items.size });
    this._bus.emit('selection:changed', this._snapshot());
    return true;
  }

  /**
   * List all named selections.
   * @returns {Array<{name: string, count: number, createdAt: number, color: string|null}>}
   */
  listNamed() {
    return Array.from(this._named.values()).map(s => ({
      name: s.name,
      count: s.items.size,
      createdAt: s.createdAt,
      color: s.color,
    }));
  }

  /**
   * Delete a named selection.
   * @param {string} name
   * @returns {boolean}
   */
  deleteNamed(name) {
    const deleted = this._named.delete(name);
    if (deleted) {
      this._persistToStorage();
      this._bus.emit('selection:deleted', { name });
    }
    return deleted;
  }

  /**
   * Check if a row ID is in a named selection.
   * @param {string} name - Selection name
   * @param {string} id - Row ID
   * @returns {boolean}
   */
  isInNamed(name, id) {
    const saved = this._named.get(name);
    return saved ? saved.items.has(id) : false;
  }

  // ═══════════════════════════════════════════
  // SET OPERATIONS — Combine selections
  // ═══════════════════════════════════════════

  /**
   * Union: combine active selection with a named selection.
   * @param {string} namedSelection
   */
  union(namedSelection) {
    const saved = this._named.get(namedSelection);
    if (!saved) return;
    for (const id of saved.items) {
      this._active.add(id);
    }
    this._syncToGrid();
    this._bus.emit('selection:changed', this._snapshot());
  }

  /**
   * Intersect: keep only items that are in both active and named.
   * @param {string} namedSelection
   */
  intersect(namedSelection) {
    const saved = this._named.get(namedSelection);
    if (!saved) return;
    const intersection = new Set();
    for (const id of this._active) {
      if (saved.items.has(id)) {
        intersection.add(id);
      }
    }
    this._active = intersection;
    this._syncToGrid();
    this._bus.emit('selection:changed', this._snapshot());
  }

  /**
   * Subtract: remove items that are in the named selection from active.
   * @param {string} namedSelection
   */
  subtract(namedSelection) {
    const saved = this._named.get(namedSelection);
    if (!saved) return;
    for (const id of saved.items) {
      this._active.delete(id);
    }
    this._syncToGrid();
    this._bus.emit('selection:changed', this._snapshot());
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private Sync active selection to grid's visual selection */
  _syncToGrid() {
    if (this._gridAdapter) {
      try {
        this._gridAdapter.setSelectedRowIds(Array.from(this._active));
      } catch (err) {
        // Grid may not support programmatic selection
      }
    }
  }

  /** @private Create a snapshot for events */
  _snapshot() {
    return {
      count: this._active.size,
      items: Array.from(this._active),
      hasNamed: this._named.size > 0,
    };
  }

  /** @private */
  _persistToStorage() {
    try {
      const data = {};
      for (const [name, sel] of this._named) {
        data[name] = {
          name: sel.name,
          items: Array.from(sel.items),
          createdAt: sel.createdAt,
          color: sel.color,
        };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* silent */ }
  }

  /** @private */
  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        for (const [name, sel] of Object.entries(data)) {
          this._named.set(name, {
            name: sel.name,
            items: new Set(sel.items),
            createdAt: sel.createdAt,
            color: sel.color,
          });
        }
      }
    } catch (e) { /* silent */ }
  }
}


  // ═══ field-registry.js ═══
/**
 * CtrlK Field Registry
 * ──────────────────────────────────────────────
 * Every labeled field on a detail/form page registers itself.
 * 
 * This is the data layer that enables:
 *   - Jump-to-Field (Ctrl+G / F5 — Excel's Go To)
 *   - Empty Field Navigator (Alt+N / Alt+Shift+N)
 *   - Dirty Field Tracking (which fields changed?)
 *   - Field Pinning (cross-record sticky fields)
 *   - Tab-through editing within sections
 * 
 * Fields can be registered:
 *   1. Declaratively: data-ctrlk-field="issuerName" on DOM elements
 *   2. Programmatically: ctrlk.fields.register({ ... })
 *   3. Via framework adapters: @CtrlkField() decorator, useCtrlkField() hook
 * 
 * Excel parallel:
 *   - F5 / Ctrl+G = Go To (our jump-to-field)
 *   - Ctrl+Home = first field
 *   - Ctrl+End = last field
 *   - Tab = next editable field in section
 *   - Enter = commit edit, move to next field
 * 
 * @module @ctrlk/fields
 * @author Prabhu Raja
 */

/**
 * @typedef {Object} FieldDefinition
 * @property {string} id - Unique field identifier (e.g., 'ratings.moodys.corp_family')
 * @property {string} label - Human-readable label (e.g., "Moody's Corp Family Rating")
 * @property {string} section - Section this field belongs to (e.g., 'Ratings')
 * @property {string|Element} element - CSS selector or DOM element
 * @property {boolean} editable - Can this field be edited?
 * @property {boolean} required - Is this field required?
 * @property {*} [value] - Current value (if trackable)
 * @property {*} [originalValue] - Value before edits (for dirty tracking)
 * @property {Function} [getValue] - Custom value getter
 * @property {Function} [setValue] - Custom value setter
 * @property {Function} [startEdit] - Custom edit mode trigger
 * @property {Function} [stopEdit] - Custom edit mode exit
 * @property {string} [group] - Sub-group within section (e.g., 'Issuer Info')
 * @property {number} [order] - Sort order within section
 * @property {string[]} [tags] - Searchable tags
 */

const PINS_STORAGE_KEY = 'ctrlk-field-pins';

class FieldRegistry {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this._bus = bus;

    /** @type {Map<string, FieldDefinition>} */
    this._fields = new Map();

    /** @type {string[]} Ordered list of field IDs (registration order, overridable) */
    this._order = [];

    /** @type {Set<string>} Pinned field IDs (persist across records) */
    this._pinned = new Set();

    /** @type {Map<string, *>} Original values for dirty tracking */
    this._originals = new Map();

    /** @type {string|null} Currently focused field */
    this._focused = null;

    /** @type {boolean} Edit mode active */
    this._editing = false;
  }

  /**
   * Initialize — load pinned fields, auto-discover DOM fields.
   */
  init() {
    this._loadPins();
  }

  // ═══════════════════════════════════════════
  // REGISTER — Fields declare themselves
  // ═══════════════════════════════════════════

  /**
   * Register a field.
   * @param {FieldDefinition} def
   * @returns {Function} Unregister function
   */
  register(def) {
    if (!def.id) throw new Error('[CtrlK] Field must have an id');

    const field = {
      id: def.id,
      label: def.label || def.id,
      section: def.section || 'General',
      group: def.group || null,
      element: def.element || null,
      editable: def.editable !== false,
      required: def.required || false,
      value: def.value !== undefined ? def.value : undefined,
      originalValue: def.value !== undefined ? def.value : undefined,
      getValue: def.getValue || null,
      setValue: def.setValue || null,
      startEdit: def.startEdit || null,
      stopEdit: def.stopEdit || null,
      order: def.order ?? this._order.length,
      tags: def.tags || [],
      _dirty: false,
      _empty: this._isEmpty(def.value),
    };

    this._fields.set(def.id, field);
    this._originals.set(def.id, field.originalValue);

    // Maintain order
    if (!this._order.includes(def.id)) {
      this._order.push(def.id);
      this._order.sort((a, b) => {
        const fa = this._fields.get(a);
        const fb = this._fields.get(b);
        return (fa?.order ?? 0) - (fb?.order ?? 0);
      });
    }

    this._bus.emit('field:registered', { id: def.id, label: field.label, section: field.section });

    return () => this.unregister(def.id);
  }

  /**
   * Register multiple fields.
   * @param {FieldDefinition[]} defs
   * @returns {Function} Unregister all
   */
  registerMany(defs) {
    const fns = defs.map(d => this.register(d));
    return () => fns.forEach(fn => fn());
  }

  /**
   * Unregister a field.
   * @param {string} id
   */
  unregister(id) {
    this._fields.delete(id);
    this._originals.delete(id);
    this._order = this._order.filter(i => i !== id);
    this._bus.emit('field:unregistered', { id });
  }

  /**
   * Auto-discover fields from DOM elements with data-ctrlk-field.
   * 
   * Expected attributes:
   *   data-ctrlk-field="fieldId"
   *   data-ctrlk-label="Display Name"
   *   data-ctrlk-section="Section Name"
   *   data-ctrlk-group="Group Name"
   *   data-ctrlk-editable="true|false"
   *   data-ctrlk-required="true|false"
   */
  discover() {
    const elements = document.querySelectorAll('[data-ctrlk-field]');
    for (const el of elements) {
      const id = el.getAttribute('data-ctrlk-field');
      if (this._fields.has(id)) continue;

      this.register({
        id,
        label: el.getAttribute('data-ctrlk-label') || el.textContent?.trim() || id,
        section: el.getAttribute('data-ctrlk-section') || this._inferSection(el),
        group: el.getAttribute('data-ctrlk-group') || null,
        element: el,
        editable: el.getAttribute('data-ctrlk-editable') !== 'false',
        required: el.getAttribute('data-ctrlk-required') === 'true',
        value: this._readDomValue(el),
      });
    }
  }

  // ═══════════════════════════════════════════
  // QUERY — Find fields
  // ═══════════════════════════════════════════

  /**
   * Get a field by ID.
   * @param {string} id
   * @returns {FieldDefinition|undefined}
   */
  get(id) {
    return this._fields.get(id);
  }

  /**
   * Get all registered fields in order.
   * @returns {FieldDefinition[]}
   */
  getAll() {
    return this._order.map(id => this._fields.get(id)).filter(Boolean);
  }

  /**
   * Get fields grouped by section.
   * @returns {Map<string, FieldDefinition[]>}
   */
  getGrouped() {
    const groups = new Map();
    for (const id of this._order) {
      const field = this._fields.get(id);
      if (!field) continue;
      if (!groups.has(field.section)) groups.set(field.section, []);
      groups.get(field.section).push(field);
    }
    return groups;
  }

  /**
   * Search fields by query (for Jump-to-Field / F5).
   * Matches against label, id, section, group, and tags.
   * @param {string} query
   * @param {Object} [options]
   * @param {boolean} [options.editableOnly=false]
   * @param {boolean} [options.emptyOnly=false]
   * @param {number} [options.limit=20]
   * @returns {Array<{field: FieldDefinition, score: number}>}
   */
  search(query, options = {}) {
    const { editableOnly = false, emptyOnly = false, limit = 20 } = options;
    const q = query.toLowerCase().trim();

    let fields = this.getAll();
    if (editableOnly) fields = fields.filter(f => f.editable);
    if (emptyOnly) fields = fields.filter(f => f._empty);

    if (!q) {
      return fields.slice(0, limit).map(f => ({ field: f, score: 0 }));
    }

    const results = [];
    for (const field of fields) {
      let score = 0;
      const label = field.label.toLowerCase();
      const id = field.id.toLowerCase();
      const section = field.section.toLowerCase();
      const tags = field.tags.map(t => t.toLowerCase());

      if (label === q) score = 100;
      else if (label.startsWith(q)) score = 50;
      else if (label.includes(q)) score = 30;
      else if (id.includes(q)) score = 20;
      else if (section.includes(q)) score = 15;
      else if (tags.some(t => t.includes(q))) score = 10;
      else {
        // Fuzzy match on label
        let qi = 0;
        for (let i = 0; i < label.length && qi < q.length; i++) {
          if (label[i] === q[qi]) qi++;
        }
        if (qi === q.length) score = 5;
      }

      if (score > 0) results.push({ field, score });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Get count of registered fields.
   * @returns {number}
   */
  count() {
    return this._fields.size;
  }

  // ═══════════════════════════════════════════
  // NAVIGATE — Move between fields
  // ═══════════════════════════════════════════

  /**
   * Focus a field — scroll to it, highlight it.
   * @param {string} id
   * @param {Object} [options]
   * @param {boolean} [options.edit=false] - Enter edit mode immediately
   * @returns {boolean}
   */
  focus(id, options = {}) {
    const { edit = false } = options;
    const field = this._fields.get(id);
    if (!field) return false;

    this._focused = id;

    // Scroll element into view
    const el = this._resolveElement(field);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Add focus highlight
      el.classList.add('ctrlk-field-focused');
      setTimeout(() => el.classList.remove('ctrlk-field-focused'), 2000);

      // Enter edit mode if requested
      if (edit && field.editable) {
        this.startEdit(id);
      }
    }

    this._bus.emit('field:focused', { id, label: field.label, section: field.section });
    return true;
  }

  /**
   * Focus the next field (Tab behavior).
   * @param {Object} [options]
   * @param {boolean} [options.editableOnly=true] - Skip non-editable fields
   * @param {boolean} [options.withinSection=true] - Stay within current section
   * @returns {string|null} ID of the newly focused field
   */
  focusNext(options = {}) {
    const { editableOnly = true, withinSection = true } = options;
    return this._moveFocus(1, editableOnly, withinSection);
  }

  /**
   * Focus the previous field (Shift+Tab behavior).
   * @param {Object} [options]
   * @param {boolean} [options.editableOnly=true]
   * @param {boolean} [options.withinSection=true]
   * @returns {string|null}
   */
  focusPrev(options = {}) {
    const { editableOnly = true, withinSection = true } = options;
    return this._moveFocus(-1, editableOnly, withinSection);
  }

  /**
   * Focus the next empty field (Alt+N).
   * @returns {string|null}
   */
  focusNextEmpty() {
    this._refreshEmptyStates();
    const currentIdx = this._focused ? this._order.indexOf(this._focused) : -1;

    for (let i = currentIdx + 1; i < this._order.length; i++) {
      const field = this._fields.get(this._order[i]);
      if (field && field._empty && field.editable) {
        this.focus(this._order[i], { edit: true });
        return this._order[i];
      }
    }
    // Wrap around
    for (let i = 0; i <= currentIdx; i++) {
      const field = this._fields.get(this._order[i]);
      if (field && field._empty && field.editable) {
        this.focus(this._order[i], { edit: true });
        return this._order[i];
      }
    }
    return null;
  }

  /**
   * Focus the previous empty field (Alt+Shift+N).
   * @returns {string|null}
   */
  focusPrevEmpty() {
    this._refreshEmptyStates();
    const currentIdx = this._focused ? this._order.indexOf(this._focused) : this._order.length;

    for (let i = currentIdx - 1; i >= 0; i--) {
      const field = this._fields.get(this._order[i]);
      if (field && field._empty && field.editable) {
        this.focus(this._order[i], { edit: true });
        return this._order[i];
      }
    }
    return null;
  }

  /**
   * Focus the first field (Ctrl+Home).
   * @returns {string|null}
   */
  focusFirst() {
    if (this._order.length === 0) return null;
    this.focus(this._order[0]);
    return this._order[0];
  }

  /**
   * Focus the last field (Ctrl+End).
   * @returns {string|null}
   */
  focusLast() {
    if (this._order.length === 0) return null;
    const lastId = this._order[this._order.length - 1];
    this.focus(lastId);
    return lastId;
  }

  /**
   * Get the currently focused field ID.
   * @returns {string|null}
   */
  getFocused() {
    return this._focused;
  }

  // ═══════════════════════════════════════════
  // EDIT — Inline editing lifecycle
  // ═══════════════════════════════════════════

  /**
   * Start editing a field (F2 behavior).
   * @param {string} id
   * @returns {boolean}
   */
  startEdit(id) {
    const field = this._fields.get(id);
    if (!field || !field.editable) return false;

    this._editing = true;
    this._focused = id;

    if (field.startEdit) {
      field.startEdit();
    } else {
      const el = this._resolveElement(field);
      if (el) {
        // Find the nearest input/textarea/select
        const input = el.querySelector('input, textarea, select') || el;
        if (input.focus) input.focus();
        if (input.select) input.select();
      }
    }

    this._bus.emit('field:edit-started', { id, label: field.label });
    return true;
  }

  /**
   * Stop editing (Enter = commit, Escape = cancel).
   * @param {boolean} [cancel=false]
   * @returns {boolean}
   */
  stopEdit(cancel = false) {
    if (!this._editing || !this._focused) return false;

    const field = this._fields.get(this._focused);
    if (!field) return false;

    if (cancel) {
      // Revert to original value
      if (field.setValue && this._originals.has(this._focused)) {
        field.setValue(this._originals.get(this._focused));
        field._dirty = false;
      }
    } else {
      // Commit — read current value and check if dirty
      const currentValue = this._readFieldValue(field);
      const originalValue = this._originals.get(this._focused);
      field._dirty = currentValue !== originalValue;
      field.value = currentValue;
      field._empty = this._isEmpty(currentValue);
    }

    if (field.stopEdit) {
      field.stopEdit(cancel);
    }

    this._editing = false;
    this._bus.emit('field:edit-stopped', {
      id: this._focused,
      cancel,
      dirty: field._dirty,
    });

    return true;
  }

  /**
   * Commit current edit and move to next field (Enter behavior).
   * @returns {string|null} Next field ID
   */
  commitAndNext() {
    this.stopEdit(false);
    return this.focusNext();
  }

  // ═══════════════════════════════════════════
  // DIRTY TRACKING — What changed?
  // ═══════════════════════════════════════════

  /**
   * Get all dirty (modified) fields.
   * @returns {Array<{id: string, label: string, section: string, oldValue: *, newValue: *}>}
   */
  getDirty() {
    const dirty = [];
    for (const [id, field] of this._fields) {
      if (field._dirty) {
        dirty.push({
          id,
          label: field.label,
          section: field.section,
          oldValue: this._originals.get(id),
          newValue: this._readFieldValue(field),
        });
      }
    }
    return dirty;
  }

  /**
   * Get count of dirty fields.
   * @returns {number}
   */
  getDirtyCount() {
    let count = 0;
    for (const field of this._fields.values()) {
      if (field._dirty) count++;
    }
    return count;
  }

  /**
   * Check if any fields are dirty.
   * @returns {boolean}
   */
  isDirty() {
    for (const field of this._fields.values()) {
      if (field._dirty) return true;
    }
    return false;
  }

  /**
   * Mark a specific field as dirty (for external change tracking).
   * @param {string} id
   * @param {*} newValue
   */
  markDirty(id, newValue) {
    const field = this._fields.get(id);
    if (!field) return;
    field._dirty = true;
    field.value = newValue;
    field._empty = this._isEmpty(newValue);
    this._bus.emit('field:dirty', { id, label: field.label, newValue });
  }

  /**
   * Revert a single field to its original value.
   * @param {string} id
   * @returns {boolean}
   */
  revert(id) {
    const field = this._fields.get(id);
    if (!field) return false;
    const original = this._originals.get(id);
    if (field.setValue) field.setValue(original);
    field.value = original;
    field._dirty = false;
    field._empty = this._isEmpty(original);
    this._bus.emit('field:reverted', { id, value: original });
    return true;
  }

  /**
   * Revert all dirty fields.
   */
  revertAll() {
    for (const [id, field] of this._fields) {
      if (field._dirty) {
        this.revert(id);
      }
    }
  }

  /**
   * Accept all dirty fields as the new baseline
   * (call after successful save).
   */
  acceptAll() {
    for (const [id, field] of this._fields) {
      if (field._dirty) {
        const currentValue = this._readFieldValue(field);
        this._originals.set(id, currentValue);
        field.originalValue = currentValue;
        field._dirty = false;
      }
    }
    this._bus.emit('field:all-accepted', {});
  }

  // ═══════════════════════════════════════════
  // EMPTY FIELDS — Completeness tracking
  // ═══════════════════════════════════════════

  /**
   * Get all empty fields.
   * @returns {FieldDefinition[]}
   */
  getEmpty() {
    this._refreshEmptyStates();
    return this.getAll().filter(f => f._empty);
  }

  /**
   * Get empty field count.
   * @returns {number}
   */
  getEmptyCount() {
    this._refreshEmptyStates();
    return this.getAll().filter(f => f._empty).length;
  }

  /**
   * Get completeness stats.
   * @returns {{total: number, filled: number, empty: number, required: number, requiredEmpty: number, percent: number}}
   */
  getCompleteness() {
    this._refreshEmptyStates();
    const all = this.getAll();
    const empty = all.filter(f => f._empty);
    const required = all.filter(f => f.required);
    const requiredEmpty = required.filter(f => f._empty);
    return {
      total: all.length,
      filled: all.length - empty.length,
      empty: empty.length,
      required: required.length,
      requiredEmpty: requiredEmpty.length,
      percent: all.length > 0 ? Math.round(((all.length - empty.length) / all.length) * 100) : 100,
    };
  }

  // ═══════════════════════════════════════════
  // PINNING — Sticky fields across records
  // ═══════════════════════════════════════════

  /**
   * Pin a field (persist across record navigation).
   * @param {string} id
   */
  pin(id) {
    this._pinned.add(id);
    this._persistPins();
    this._bus.emit('field:pinned', { id });
  }

  /**
   * Unpin a field.
   * @param {string} id
   */
  unpin(id) {
    this._pinned.delete(id);
    this._persistPins();
    this._bus.emit('field:unpinned', { id });
  }

  /**
   * Toggle pin state.
   * @param {string} id
   */
  togglePin(id) {
    this._pinned.has(id) ? this.unpin(id) : this.pin(id);
  }

  /**
   * Check if a field is pinned.
   * @param {string} id
   * @returns {boolean}
   */
  isPinned(id) {
    return this._pinned.has(id);
  }

  /**
   * Get all pinned fields.
   * @returns {FieldDefinition[]}
   */
  getPinned() {
    return Array.from(this._pinned)
      .map(id => this._fields.get(id))
      .filter(Boolean);
  }

  /**
   * Get pinned field values (for cross-record display).
   * @returns {Array<{id: string, label: string, section: string, value: *}>}
   */
  getPinnedValues() {
    return Array.from(this._pinned).map(id => {
      const field = this._fields.get(id);
      if (!field) return null;
      return {
        id,
        label: field.label,
        section: field.section,
        value: this._readFieldValue(field),
      };
    }).filter(Boolean);
  }

  // ═══════════════════════════════════════════
  // CLEAR
  // ═══════════════════════════════════════════

  /**
   * Clear all registered fields (on page change).
   * Pinned fields persist.
   */
  clear() {
    this._fields.clear();
    this._originals.clear();
    this._order = [];
    this._focused = null;
    this._editing = false;
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private */
  _moveFocus(direction, editableOnly, withinSection) {
    const currentIdx = this._focused ? this._order.indexOf(this._focused) : -1;
    const currentField = this._focused ? this._fields.get(this._focused) : null;
    const currentSection = currentField?.section;

    let candidates = this._order.map(id => this._fields.get(id)).filter(Boolean);
    if (editableOnly) candidates = candidates.filter(f => f.editable);
    if (withinSection && currentSection) candidates = candidates.filter(f => f.section === currentSection);

    const candidateIds = candidates.map(f => f.id);
    const currentCandidateIdx = this._focused ? candidateIds.indexOf(this._focused) : -1;

    let nextIdx;
    if (direction > 0) {
      nextIdx = currentCandidateIdx + 1;
      if (nextIdx >= candidateIds.length) nextIdx = 0;
    } else {
      nextIdx = currentCandidateIdx - 1;
      if (nextIdx < 0) nextIdx = candidateIds.length - 1;
    }

    if (candidateIds[nextIdx]) {
      this.focus(candidateIds[nextIdx]);
      return candidateIds[nextIdx];
    }
    return null;
  }

  /** @private */
  _resolveElement(field) {
    if (!field.element) return null;
    if (typeof field.element === 'string') {
      return document.querySelector(field.element);
    }
    return field.element;
  }

  /** @private */
  _readFieldValue(field) {
    if (field.getValue) return field.getValue();
    const el = this._resolveElement(field);
    if (el) return this._readDomValue(el);
    return field.value;
  }

  /** @private */
  _readDomValue(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      return el.value;
    }
    return el.textContent?.trim() || null;
  }

  /** @private */
  _isEmpty(value) {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string' && (value.trim() === '' || value.toLowerCase() === 'not set')) return true;
    return false;
  }

  /** @private */
  _refreshEmptyStates() {
    for (const [id, field] of this._fields) {
      const val = this._readFieldValue(field);
      field._empty = this._isEmpty(val);
    }
  }

  /** @private */
  _inferSection(el) {
    let current = el.parentElement;
    while (current && current !== document.body) {
      const sectionAttr = current.getAttribute('data-ctrlk-section');
      if (sectionAttr) return sectionAttr;

      // Look for common section header patterns
      const header = current.querySelector('h2, h3, .section-title, .fg-title');
      if (header) return header.textContent.trim();

      current = current.parentElement;
    }
    return 'General';
  }

  /** @private */
  _persistPins() {
    try {
      localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(Array.from(this._pinned)));
    } catch (e) { /* silent */ }
  }

  /** @private */
  _loadPins() {
    try {
      const raw = localStorage.getItem(PINS_STORAGE_KEY);
      if (raw) {
        const pins = JSON.parse(raw);
        for (const id of pins) this._pinned.add(id);
      }
    } catch (e) { /* silent */ }
  }
}


  // ═══ column-navigator.js ═══
/**
 * CtrlK Column Navigator
 * ──────────────────────────────────────────────
 * Solves Problem #1: Horizontal Navigation Does Not Exist.
 * 
 * In a 150-column grid, the only way to reach column 89 is
 * the horizontal scroll bar. ColumnNavigator adds:
 * 
 *   - Column Search (Ctrl+G): type a column name, jump to it
 *   - Column Bookmarks: mark frequently used columns, jump between them
 *   - Column Groups: navigate between logical groups
 *   - Column Memory: remember last horizontal position per view
 *   - Ctrl+Left/Right: jump between bookmarked columns
 * 
 * Excel parallel:
 *   - Ctrl+G / F5 = Go To (our column search)
 *   - Ctrl+Right = jump to next data boundary (our next bookmark)
 *   - Ctrl+Left = jump to previous data boundary
 *   - Freeze Panes = our column pinning (via grid adapter)
 * 
 * Works through GridAdapter — never touches the grid directly.
 * 
 * @module @ctrlk/column-nav
 * @author Prabhu Raja
 */

const BOOKMARKS_KEY = 'ctrlk-col-bookmarks';
const POSITION_KEY = 'ctrlk-col-positions';

class ColumnNavigator {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   * @param {import('../grid/grid-adapter.js').GridAdapter} [gridAdapter]
   */
  constructor(bus, gridAdapter) {
    this._bus = bus;
    this._grid = gridAdapter || null;

    /** @type {Set<string>} Bookmarked column IDs */
    this._bookmarks = new Set();

    /** @type {string|null} Currently focused column ID */
    this._focusedCol = null;

    /** @type {Map<string, number>} Last horizontal scroll position per view name */
    this._positions = new Map();

    /** @type {Map<string, string[]>} Named column groups */
    this._groups = new Map();
  }

  /**
   * Set the grid adapter.
   * @param {import('../grid/grid-adapter.js').GridAdapter} adapter
   */
  setGridAdapter(adapter) {
    this._grid = adapter;
  }

  /**
   * Initialize — load bookmarks from storage.
   */
  init() {
    this._loadBookmarks();
    this._loadPositions();
  }

  // ═══════════════════════════════════════════
  // SEARCH — Find and jump to a column
  // ═══════════════════════════════════════════

  /**
   * Search columns by name (for Ctrl+G column search).
   * Returns scored results matching the query against header names and column IDs.
   * 
   * @param {string} query
   * @param {Object} [options]
   * @param {boolean} [options.visibleOnly=false] - Only search visible columns
   * @param {number} [options.limit=20]
   * @returns {Array<{column: Object, score: number, bookmarked: boolean}>}
   */
  search(query, options = {}) {
    const { visibleOnly = false, limit = 20 } = options;
    if (!this._grid) return [];

    const columns = visibleOnly ? this._grid.getVisibleColumns() : this._grid.getColumns();
    const q = query.toLowerCase().trim();

    if (!q) {
      return columns.slice(0, limit).map(col => ({
        column: col,
        score: 0,
        bookmarked: this._bookmarks.has(col.colId),
      }));
    }

    const results = [];
    for (const col of columns) {
      let score = 0;
      const name = (col.headerName || '').toLowerCase();
      const id = (col.colId || '').toLowerCase();

      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 50;
      else if (name.includes(q)) score = 30;
      else if (id.includes(q)) score = 20;
      else {
        // Fuzzy: all query chars in order
        let qi = 0;
        for (let i = 0; i < name.length && qi < q.length; i++) {
          if (name[i] === q[qi]) qi++;
        }
        if (qi === q.length) score = 5;
      }

      if (score > 0) {
        // Boost bookmarked columns
        if (this._bookmarks.has(col.colId)) score += 10;
        results.push({ column: col, score, bookmarked: this._bookmarks.has(col.colId) });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Jump to a specific column — scroll it into view and highlight.
   * @param {string} colId
   * @returns {boolean}
   */
  jumpTo(colId) {
    if (!this._grid) return false;

    try {
      this._grid.ensureColumnVisible(colId);
      this._focusedCol = colId;
      this._bus.emit('column:jumped', { colId });
      return true;
    } catch (err) {
      console.warn(`[CtrlK] jumpTo column failed: ${colId}`, err.message);
      return false;
    }
  }

  /**
   * Get the currently focused column.
   * @returns {string|null}
   */
  getFocused() {
    return this._focusedCol;
  }

  // ═══════════════════════════════════════════
  // BOOKMARKS — Mark frequently accessed columns
  // ═══════════════════════════════════════════

  /**
   * Bookmark a column.
   * @param {string} colId
   */
  bookmark(colId) {
    this._bookmarks.add(colId);
    this._persistBookmarks();
    this._bus.emit('column:bookmarked', { colId });
  }

  /**
   * Remove a bookmark.
   * @param {string} colId
   */
  unbookmark(colId) {
    this._bookmarks.delete(colId);
    this._persistBookmarks();
    this._bus.emit('column:unbookmarked', { colId });
  }

  /**
   * Toggle bookmark state.
   * @param {string} colId
   */
  toggleBookmark(colId) {
    this._bookmarks.has(colId) ? this.unbookmark(colId) : this.bookmark(colId);
  }

  /**
   * Check if a column is bookmarked.
   * @param {string} colId
   * @returns {boolean}
   */
  isBookmarked(colId) {
    return this._bookmarks.has(colId);
  }

  /**
   * Get all bookmarked column IDs (in display order).
   * @returns {string[]}
   */
  getBookmarks() {
    if (!this._grid) return Array.from(this._bookmarks);
    // Return bookmarks in their visual column order
    const visible = this._grid.getVisibleColumns();
    const ordered = visible.filter(c => this._bookmarks.has(c.colId)).map(c => c.colId);
    // Add any bookmarks that aren't currently visible
    for (const id of this._bookmarks) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    return ordered;
  }

  /**
   * Set multiple bookmarks at once (replacing existing).
   * @param {string[]} colIds
   */
  setBookmarks(colIds) {
    this._bookmarks.clear();
    for (const id of colIds) this._bookmarks.add(id);
    this._persistBookmarks();
    this._bus.emit('column:bookmarks-updated', { colIds });
  }

  /**
   * Get bookmark count.
   * @returns {number}
   */
  getBookmarkCount() {
    return this._bookmarks.size;
  }

  // ═══════════════════════════════════════════
  // NAVIGATE — Move between bookmarked columns
  // ═══════════════════════════════════════════

  /**
   * Jump to the next bookmarked column (Ctrl+Right).
   * @returns {string|null} The column ID jumped to
   */
  nextBookmark() {
    const ordered = this.getBookmarks();
    if (ordered.length === 0) return null;

    const currentIdx = this._focusedCol ? ordered.indexOf(this._focusedCol) : -1;
    const nextIdx = (currentIdx + 1) % ordered.length;
    const colId = ordered[nextIdx];

    this.jumpTo(colId);
    return colId;
  }

  /**
   * Jump to the previous bookmarked column (Ctrl+Left).
   * @returns {string|null}
   */
  prevBookmark() {
    const ordered = this.getBookmarks();
    if (ordered.length === 0) return null;

    const currentIdx = this._focusedCol ? ordered.indexOf(this._focusedCol) : ordered.length;
    const prevIdx = currentIdx <= 0 ? ordered.length - 1 : currentIdx - 1;
    const colId = ordered[prevIdx];

    this.jumpTo(colId);
    return colId;
  }

  /**
   * Jump to the first column (Home).
   * @returns {string|null}
   */
  jumpToFirst() {
    if (!this._grid) return null;
    const visible = this._grid.getVisibleColumns();
    if (visible.length === 0) return null;
    this.jumpTo(visible[0].colId);
    return visible[0].colId;
  }

  /**
   * Jump to the last column (End).
   * @returns {string|null}
   */
  jumpToLast() {
    if (!this._grid) return null;
    const visible = this._grid.getVisibleColumns();
    if (visible.length === 0) return null;
    const last = visible[visible.length - 1];
    this.jumpTo(last.colId);
    return last.colId;
  }

  /**
   * Move to the next visible column (Right arrow in column mode).
   * @returns {string|null}
   */
  nextColumn() {
    if (!this._grid) return null;
    const visible = this._grid.getVisibleColumns();
    const currentIdx = this._focusedCol ? visible.findIndex(c => c.colId === this._focusedCol) : -1;
    const nextIdx = Math.min(currentIdx + 1, visible.length - 1);
    const col = visible[nextIdx];
    if (col) {
      this.jumpTo(col.colId);
      return col.colId;
    }
    return null;
  }

  /**
   * Move to the previous visible column (Left arrow in column mode).
   * @returns {string|null}
   */
  prevColumn() {
    if (!this._grid) return null;
    const visible = this._grid.getVisibleColumns();
    const currentIdx = this._focusedCol ? visible.findIndex(c => c.colId === this._focusedCol) : visible.length;
    const prevIdx = Math.max(currentIdx - 1, 0);
    const col = visible[prevIdx];
    if (col) {
      this.jumpTo(col.colId);
      return col.colId;
    }
    return null;
  }

  // ═══════════════════════════════════════════
  // COLUMN GROUPS — Named sets of columns
  // ═══════════════════════════════════════════

  /**
   * Define a named column group.
   * Groups are logical sets — they don't affect visibility,
   * they provide navigation landmarks.
   * 
   * @param {string} name - Group name (e.g., "Credit Ratings", "Compliance")
   * @param {string[]} colIds - Column IDs in this group
   */
  defineGroup(name, colIds) {
    this._groups.set(name, [...colIds]);
    this._bus.emit('column:group-defined', { name, colIds });
  }

  /**
   * Jump to the first column of a named group.
   * @param {string} name
   * @returns {string|null}
   */
  jumpToGroup(name) {
    const colIds = this._groups.get(name);
    if (!colIds || colIds.length === 0) return null;
    this.jumpTo(colIds[0]);
    return colIds[0];
  }

  /**
   * Get all defined groups.
   * @returns {Array<{name: string, colIds: string[]}>}
   */
  getGroups() {
    return Array.from(this._groups.entries()).map(([name, colIds]) => ({ name, colIds }));
  }

  /**
   * Delete a group.
   * @param {string} name
   */
  deleteGroup(name) {
    this._groups.delete(name);
  }

  // ═══════════════════════════════════════════
  // POSITION MEMORY — Remember scroll per view
  // ═══════════════════════════════════════════

  /**
   * Save the current horizontal scroll position for a named view.
   * @param {string} viewName
   */
  savePosition(viewName) {
    if (!this._grid) return;
    try {
      const pos = this._grid.getScrollPosition();
      this._positions.set(viewName, pos.left);
      this._persistPositions();
    } catch (e) { /* silent */ }
  }

  /**
   * Restore the horizontal scroll position for a named view.
   * @param {string} viewName
   * @returns {boolean}
   */
  restorePosition(viewName) {
    const left = this._positions.get(viewName);
    if (left === undefined || !this._grid) return false;
    try {
      this._grid.setScrollPosition({ left });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ═══════════════════════════════════════════
  // COLUMN PROFILES — Quick visibility toggles
  // ═══════════════════════════════════════════

  /**
   * Show only the specified columns (hide everything else).
   * @param {string[]} colIds - Columns to show
   */
  showOnly(colIds) {
    if (!this._grid) return;
    const all = this._grid.getColumns();
    const showSet = new Set(colIds);
    const visibility = {};
    for (const col of all) {
      visibility[col.colId] = showSet.has(col.colId);
    }
    this._grid.setColumnVisibility(visibility);
    this._bus.emit('column:visibility-changed', { shown: colIds.length, total: all.length });
  }

  /**
   * Show all columns (reset visibility).
   */
  showAll() {
    if (!this._grid) return;
    const all = this._grid.getColumns();
    const visibility = {};
    for (const col of all) {
      visibility[col.colId] = true;
    }
    this._grid.setColumnVisibility(visibility);
    this._bus.emit('column:visibility-changed', { shown: all.length, total: all.length });
  }

  /**
   * Toggle visibility of a single column.
   * @param {string} colId
   */
  toggleColumn(colId) {
    if (!this._grid) return;
    const col = this._grid.getColumns().find(c => c.colId === colId);
    if (col) {
      this._grid.setColumnVisibility({ [colId]: !col.visible });
    }
  }

  /**
   * Show only bookmarked columns (quick filter).
   */
  showBookmarkedOnly() {
    this.showOnly(Array.from(this._bookmarks));
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private */
  _persistBookmarks() {
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(Array.from(this._bookmarks)));
    } catch (e) { /* silent */ }
  }

  /** @private */
  _loadBookmarks() {
    try {
      const raw = localStorage.getItem(BOOKMARKS_KEY);
      if (raw) {
        for (const id of JSON.parse(raw)) this._bookmarks.add(id);
      }
    } catch (e) { /* silent */ }
  }

  /** @private */
  _persistPositions() {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(Object.fromEntries(this._positions)));
    } catch (e) { /* silent */ }
  }

  /** @private */
  _loadPositions() {
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        for (const [k, v] of Object.entries(data)) {
          this._positions.set(k, v);
        }
      }
    } catch (e) { /* silent */ }
  }
}


  // ═══ focus-navigator.js ═══
/**
 * CtrlK Focus Navigator
 * ──────────────────────────────────────────────
 * Spatial keyboard navigation between UI zones.
 * 
 * A "zone" is a logical region of the UI: the sidebar,
 * the main grid, a filter panel, a detail card.
 * 
 * Tab moves focus between zones (not between individual elements).
 * Arrow keys navigate within the active zone.
 * Typing starts filtering without clicking into an input first
 * (focus-follows-intent).
 * 
 * Zones are declared on DOM elements:
 *   <nav data-ctrlk-zone="sidebar" data-ctrlk-zone-order="1">
 *   <main data-ctrlk-zone="grid" data-ctrlk-zone-order="2">
 *   <aside data-ctrlk-zone="detail" data-ctrlk-zone-order="3">
 * 
 * Or programmatically:
 *   ctrlk.focus.registerZone('grid', { element: '#main-grid', order: 2 });
 * 
 * Excel parallel:
 *   - Ctrl+Page Down/Up = switch between sheets (our switch between zones)
 *   - F6 = cycle between panes (our zone cycling)
 *   - Arrow keys within active sheet (our within-zone navigation)
 * 
 * @module @ctrlk/focus
 * @author Prabhu Raja
 */

/**
 * @typedef {Object} ZoneDefinition
 * @property {string} id - Unique zone identifier
 * @property {string|Element} element - CSS selector or DOM element
 * @property {number} order - Tab order (lower = first)
 * @property {string} [label] - Human-readable label for accessibility
 * @property {Function} [onEnter] - Called when zone receives focus
 * @property {Function} [onLeave] - Called when zone loses focus
 * @property {string} [entryTarget] - CSS selector for the element that should
 *   receive focus when the zone is entered (e.g., first row of a grid)
 * @property {boolean} [trapFocus=false] - When true, Tab/Shift+Tab cycle within
 *   the zone instead of leaving (useful for modals)
 */

class FocusNavigator {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this._bus = bus;

    /** @type {Map<string, ZoneDefinition>} */
    this._zones = new Map();

    /** @type {string|null} Currently active zone */
    this._activeZone = null;

    /** @type {boolean} Focus navigation enabled */
    this._enabled = true;

    /** @type {boolean} Attached to DOM */
    this._attached = false;

    /** @type {Map<string, Element|null>} Cached resolved elements */
    this._elements = new Map();

    /** Bound handlers for cleanup */
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleFocusIn = this._handleFocusIn.bind(this);
  }

  // ═══════════════════════════════════════════
  // ZONE REGISTRATION
  // ═══════════════════════════════════════════

  /**
   * Register a focus zone.
   * @param {string} id - Unique zone ID
   * @param {Object} options
   * @param {string|Element} options.element - CSS selector or DOM element
   * @param {number} [options.order=0] - Tab order
   * @param {string} [options.label] - Accessibility label
   * @param {Function} [options.onEnter] - Callback on zone entry
   * @param {Function} [options.onLeave] - Callback on zone exit
   * @param {string} [options.entryTarget] - CSS selector for initial focus target
   * @param {boolean} [options.trapFocus=false] - Trap focus within zone
   * @returns {Function} Unregister function
   */
  registerZone(id, options) {
    const zone = {
      id,
      element: options.element,
      order: options.order ?? this._zones.size,
      label: options.label || id,
      onEnter: options.onEnter || null,
      onLeave: options.onLeave || null,
      entryTarget: options.entryTarget || null,
      trapFocus: options.trapFocus || false,
    };

    this._zones.set(id, zone);
    this._elements.delete(id); // Clear cached element

    this._bus.emit('focus:zone-registered', { id, label: zone.label, order: zone.order });

    return () => {
      this._zones.delete(id);
      this._elements.delete(id);
      if (this._activeZone === id) this._activeZone = null;
    };
  }

  /**
   * Auto-discover zones from DOM elements with data-ctrlk-zone.
   */
  discover() {
    const elements = document.querySelectorAll('[data-ctrlk-zone]');
    for (const el of elements) {
      const id = el.getAttribute('data-ctrlk-zone');
      if (this._zones.has(id)) continue;

      this.registerZone(id, {
        element: el,
        order: parseInt(el.getAttribute('data-ctrlk-zone-order') || '0', 10),
        label: el.getAttribute('data-ctrlk-zone-label') || el.getAttribute('aria-label') || id,
        entryTarget: el.getAttribute('data-ctrlk-zone-entry') || null,
        trapFocus: el.getAttribute('data-ctrlk-zone-trap') === 'true',
      });
    }
  }

  // ═══════════════════════════════════════════
  // ATTACH / DETACH — DOM event listeners
  // ═══════════════════════════════════════════

  /**
   * Start listening for focus navigation keys.
   */
  attach() {
    if (this._attached) return;
    document.addEventListener('keydown', this._handleKeyDown, true);
    document.addEventListener('focusin', this._handleFocusIn, true);
    this._attached = true;
  }

  /**
   * Stop listening.
   */
  detach() {
    if (!this._attached) return;
    document.removeEventListener('keydown', this._handleKeyDown, true);
    document.removeEventListener('focusin', this._handleFocusIn, true);
    this._attached = false;
  }

  // ═══════════════════════════════════════════
  // NAVIGATION — Move between zones
  // ═══════════════════════════════════════════

  /**
   * Move focus to a specific zone.
   * @param {string} zoneId
   * @returns {boolean}
   */
  moveTo(zoneId) {
    const zone = this._zones.get(zoneId);
    if (!zone) return false;

    const prevZone = this._activeZone;

    // Call onLeave for previous zone
    if (prevZone) {
      const prevDef = this._zones.get(prevZone);
      if (prevDef?.onLeave) {
        try { prevDef.onLeave(); } catch (e) { /* silent */ }
      }
    }

    this._activeZone = zoneId;

    // Resolve the DOM element
    const el = this._resolveElement(zone);
    if (el) {
      // Find the entry target within the zone
      let target = null;
      if (zone.entryTarget) {
        target = el.querySelector(zone.entryTarget);
      }
      if (!target) {
        // Find the first focusable element
        target = this._findFirstFocusable(el);
      }
      if (target) {
        target.focus();
      } else {
        // If no focusable element, focus the zone itself
        if (!el.getAttribute('tabindex')) {
          el.setAttribute('tabindex', '-1');
        }
        el.focus();
      }

      // Add visual indicator
      this._clearZoneHighlights();
      el.classList.add('ctrlk-zone-active');
    }

    // Call onEnter for new zone
    if (zone.onEnter) {
      try { zone.onEnter(); } catch (e) { /* silent */ }
    }

    this._bus.emit('focus:zone-changed', {
      from: prevZone,
      to: zoneId,
      label: zone.label,
    });

    return true;
  }

  /**
   * Move to the next zone (F6 or custom key).
   * @returns {string|null} Zone ID moved to
   */
  nextZone() {
    const ordered = this._getOrderedZones();
    if (ordered.length === 0) return null;

    const currentIdx = this._activeZone ? ordered.findIndex(z => z.id === this._activeZone) : -1;
    const nextIdx = (currentIdx + 1) % ordered.length;
    const zone = ordered[nextIdx];

    this.moveTo(zone.id);
    return zone.id;
  }

  /**
   * Move to the previous zone (Shift+F6).
   * @returns {string|null}
   */
  prevZone() {
    const ordered = this._getOrderedZones();
    if (ordered.length === 0) return null;

    const currentIdx = this._activeZone ? ordered.findIndex(z => z.id === this._activeZone) : ordered.length;
    const prevIdx = currentIdx <= 0 ? ordered.length - 1 : currentIdx - 1;
    const zone = ordered[prevIdx];

    this.moveTo(zone.id);
    return zone.id;
  }

  /**
   * Get the currently active zone.
   * @returns {string|null}
   */
  getActiveZone() {
    return this._activeZone;
  }

  /**
   * Get all registered zones in order.
   * @returns {Array<{id: string, label: string, order: number, isActive: boolean}>}
   */
  getZones() {
    return this._getOrderedZones().map(z => ({
      id: z.id,
      label: z.label,
      order: z.order,
      isActive: z.id === this._activeZone,
    }));
  }

  // ═══════════════════════════════════════════
  // FOCUS TRAP — Modal/panel focus containment
  // ═══════════════════════════════════════════

  /**
   * Trap focus within a zone (for modals, panels).
   * Tab/Shift+Tab will cycle within the zone instead of leaving.
   * @param {string} zoneId
   */
  trap(zoneId) {
    const zone = this._zones.get(zoneId);
    if (zone) {
      zone.trapFocus = true;
      this.moveTo(zoneId);
      this._bus.emit('focus:trapped', { zoneId });
    }
  }

  /**
   * Release a focus trap.
   * @param {string} zoneId
   */
  release(zoneId) {
    const zone = this._zones.get(zoneId);
    if (zone) {
      zone.trapFocus = false;
      this._bus.emit('focus:released', { zoneId });
    }
  }

  /**
   * Enable/disable the focus navigator.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = !!enabled;
  }

  /**
   * Clear all zones.
   */
  clear() {
    this._zones.clear();
    this._elements.clear();
    this._activeZone = null;
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private Handle keydown for zone navigation */
  _handleKeyDown(event) {
    if (!this._enabled) return;

    // F6 = next zone
    if (event.key === 'F6' && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      if (event.shiftKey) {
        this.prevZone();
      } else {
        this.nextZone();
      }
      return;
    }

    // Handle focus trap — Tab within trapped zone
    if (this._activeZone) {
      const zone = this._zones.get(this._activeZone);
      if (zone?.trapFocus && event.key === 'Tab') {
        const el = this._resolveElement(zone);
        if (el) {
          const focusables = this._getAllFocusable(el);
          if (focusables.length > 0) {
            event.preventDefault();
            const currentIdx = focusables.indexOf(document.activeElement);
            let nextIdx;
            if (event.shiftKey) {
              nextIdx = currentIdx <= 0 ? focusables.length - 1 : currentIdx - 1;
            } else {
              nextIdx = (currentIdx + 1) % focusables.length;
            }
            focusables[nextIdx].focus();
          }
        }
      }
    }
  }

  /** @private Track focus to detect which zone is active */
  _handleFocusIn(event) {
    if (!this._enabled) return;
    const target = event.target;

    // Walk up from focused element to find containing zone
    let el = target;
    while (el && el !== document.body) {
      for (const [id, zone] of this._zones) {
        const zoneEl = this._resolveElement(zone);
        if (zoneEl && (zoneEl === el || zoneEl.contains(el))) {
          if (this._activeZone !== id) {
            const prev = this._activeZone;
            this._activeZone = id;

            // Visual indicator
            this._clearZoneHighlights();
            if (zoneEl) zoneEl.classList.add('ctrlk-zone-active');

            this._bus.emit('focus:zone-changed', {
              from: prev,
              to: id,
              label: zone.label,
              source: 'focus',
            });
          }
          return;
        }
      }
      el = el.parentElement;
    }
  }

  /** @private Get zones sorted by order */
  _getOrderedZones() {
    return Array.from(this._zones.values()).sort((a, b) => a.order - b.order);
  }

  /** @private Resolve a zone's DOM element */
  _resolveElement(zone) {
    // Check cache first
    if (this._elements.has(zone.id)) {
      const cached = this._elements.get(zone.id);
      if (cached && document.body.contains(cached)) return cached;
    }

    let el;
    if (typeof zone.element === 'string') {
      el = document.querySelector(zone.element);
    } else {
      el = zone.element;
    }

    this._elements.set(zone.id, el);
    return el;
  }

  /** @private Find the first focusable element inside a container */
  _findFirstFocusable(container) {
    const selectors = 'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])';
    return container.querySelector(selectors);
  }

  /** @private Get all focusable elements inside a container */
  _getAllFocusable(container) {
    const selectors = 'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(selectors));
  }

  /** @private Remove active highlight from all zones */
  _clearZoneHighlights() {
    for (const [id, zone] of this._zones) {
      const el = this._resolveElement(zone);
      if (el) el.classList.remove('ctrlk-zone-active');
    }
  }
}


  // ═══ session-tracker.js ═══
/**
 * CtrlK Session Tracker
 * ──────────────────────────────────────────────
 * Solves Problem #8: The Grid and Detail Page Don't Talk.
 * 
 * Tracks which records have been visited, reviewed, or edited
 * during the current work session. Provides:
 * 
 *   - Visited markers: which rows the user has clicked into
 *   - Reviewed markers: which rows the user explicitly marked as done
 *   - Dirty markers: which rows were edited in the detail page
 *   - Progress tracking: "12 of 30 reviewed"
 *   - Session persistence: survives page refresh within the session
 *   - Workflow sets: define a "review batch" and track progress through it
 * 
 * Excel parallel:
 *   - Track Changes (Review → Track Changes)
 *   - Cell highlighting for visited cells
 *   - Workbook sharing with change tracking
 * 
 * Usage:
 *   // When user opens a record from the grid
 *   ctrlk.session.markVisited('record-123');
 *   
 *   // When user completes review of a record
 *   ctrlk.session.markReviewed('record-123');
 *   
 *   // When user edits fields in the detail page
 *   ctrlk.session.markDirty('record-123', { fields: ['rating', 'status'] });
 *   
 *   // Check progress
 *   ctrlk.session.getProgress() → { visited: 7, reviewed: 5, dirty: 3, total: 30 }
 * 
 * @module @ctrlk/session
 * @author Prabhu Raja
 */

const SESSION_KEY = 'ctrlk-session';

/**
 * @typedef {Object} RecordState
 * @property {string} id - Record/row ID
 * @property {boolean} visited - Has been opened/viewed
 * @property {boolean} reviewed - Explicitly marked as reviewed
 * @property {boolean} dirty - Has been edited
 * @property {string[]} dirtyFields - Which fields were edited
 * @property {number} visitedAt - When first visited
 * @property {number} [reviewedAt] - When marked reviewed
 * @property {number} [editedAt] - When last edited
 * @property {number} visitCount - How many times opened
 * @property {string} [notes] - Optional reviewer notes
 */

class SessionTracker {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this._bus = bus;

    /** @type {Map<string, RecordState>} Tracked records */
    this._records = new Map();

    /** @type {string|null} Current session ID */
    this._sessionId = null;

    /** @type {number} Session start time */
    this._startedAt = 0;

    /** @type {string|null} The defined "batch" — e.g., the current filter set's row IDs */
    this._batchIds = null;

    /** @type {string|null} Name for the current workflow */
    this._workflowName = null;
  }

  /**
   * Initialize or resume a session.
   * @param {Object} [options]
   * @param {string} [options.sessionId] - Resume a specific session
   * @param {boolean} [options.fresh=false] - Start fresh, discard previous
   */
  init(options = {}) {
    const { sessionId, fresh = false } = options;

    if (fresh) {
      this._records.clear();
      this._sessionId = this._generateId();
      this._startedAt = Date.now();
    } else if (sessionId) {
      this._sessionId = sessionId;
      this._loadSession();
    } else {
      // Try to resume last session
      this._loadSession();
      if (!this._sessionId) {
        this._sessionId = this._generateId();
        this._startedAt = Date.now();
      }
    }

    this._bus.emit('session:started', { sessionId: this._sessionId, recordCount: this._records.size });
  }

  // ═══════════════════════════════════════════
  // MARK — Record state transitions
  // ═══════════════════════════════════════════

  /**
   * Mark a record as visited (user opened it from the grid).
   * @param {string} id - Record/row ID
   */
  markVisited(id) {
    const record = this._getOrCreate(id);
    record.visited = true;
    record.visitCount++;
    if (!record.visitedAt) record.visitedAt = Date.now();
    this._persist();
    this._bus.emit('session:visited', { id, visitCount: record.visitCount });
  }

  /**
   * Mark a record as reviewed (user explicitly completed review).
   * @param {string} id
   * @param {Object} [options]
   * @param {string} [options.notes] - Optional reviewer notes
   */
  markReviewed(id, options = {}) {
    const record = this._getOrCreate(id);
    record.reviewed = true;
    record.reviewedAt = Date.now();
    if (options.notes) record.notes = options.notes;

    // Also mark as visited if not already
    if (!record.visited) {
      record.visited = true;
      record.visitCount++;
      record.visitedAt = Date.now();
    }

    this._persist();
    this._bus.emit('session:reviewed', { id, progress: this.getProgress() });
  }

  /**
   * Unmark a record as reviewed (undo review).
   * @param {string} id
   */
  unmarkReviewed(id) {
    const record = this._records.get(id);
    if (record) {
      record.reviewed = false;
      record.reviewedAt = null;
      this._persist();
      this._bus.emit('session:unreviewed', { id, progress: this.getProgress() });
    }
  }

  /**
   * Mark a record as dirty (user edited fields on the detail page).
   * @param {string} id
   * @param {Object} [options]
   * @param {string[]} [options.fields] - Which fields were edited
   */
  markDirty(id, options = {}) {
    const record = this._getOrCreate(id);
    record.dirty = true;
    record.editedAt = Date.now();

    if (options.fields) {
      const fieldSet = new Set(record.dirtyFields);
      for (const f of options.fields) fieldSet.add(f);
      record.dirtyFields = Array.from(fieldSet);
    }

    this._persist();
    this._bus.emit('session:dirty', { id, fields: record.dirtyFields });
  }

  /**
   * Clear dirty state for a record (after save).
   * @param {string} id
   */
  clearDirty(id) {
    const record = this._records.get(id);
    if (record) {
      record.dirty = false;
      record.dirtyFields = [];
      this._persist();
      this._bus.emit('session:dirty-cleared', { id });
    }
  }

  // ═══════════════════════════════════════════
  // QUERY — Check record states
  // ═══════════════════════════════════════════

  /**
   * Check if a record has been visited.
   * @param {string} id
   * @returns {boolean}
   */
  isVisited(id) {
    return this._records.get(id)?.visited || false;
  }

  /**
   * Check if a record has been reviewed.
   * @param {string} id
   * @returns {boolean}
   */
  isReviewed(id) {
    return this._records.get(id)?.reviewed || false;
  }

  /**
   * Check if a record is dirty (edited but possibly not saved).
   * @param {string} id
   * @returns {boolean}
   */
  isDirty(id) {
    return this._records.get(id)?.dirty || false;
  }

  /**
   * Get the full state of a record.
   * @param {string} id
   * @returns {RecordState|null}
   */
  getState(id) {
    return this._records.get(id) || null;
  }

  /**
   * Get all records with a specific state.
   * @param {'visited'|'reviewed'|'dirty'|'unreviewed'|'unvisited'} state
   * @returns {RecordState[]}
   */
  getByState(state) {
    const records = Array.from(this._records.values());
    switch (state) {
      case 'visited': return records.filter(r => r.visited);
      case 'reviewed': return records.filter(r => r.reviewed);
      case 'dirty': return records.filter(r => r.dirty);
      case 'unreviewed': return records.filter(r => r.visited && !r.reviewed);
      default: return records;
    }
  }

  /**
   * Get IDs of all visited records (for grid highlighting).
   * @returns {string[]}
   */
  getVisitedIds() {
    return Array.from(this._records.values()).filter(r => r.visited).map(r => r.id);
  }

  /**
   * Get IDs of all reviewed records.
   * @returns {string[]}
   */
  getReviewedIds() {
    return Array.from(this._records.values()).filter(r => r.reviewed).map(r => r.id);
  }

  /**
   * Get IDs of all dirty records.
   * @returns {string[]}
   */
  getDirtyIds() {
    return Array.from(this._records.values()).filter(r => r.dirty).map(r => r.id);
  }

  // ═══════════════════════════════════════════
  // PROGRESS — Batch review tracking
  // ═══════════════════════════════════════════

  /**
   * Define a batch — the set of records to review.
   * Typically set from the current grid filter result.
   * 
   * @param {string[]} ids - All record IDs in the batch
   * @param {string} [name] - Workflow name (e.g., "Q4 Compliance Review")
   */
  setBatch(ids, name) {
    this._batchIds = [...ids];
    this._workflowName = name || null;
    this._bus.emit('session:batch-set', { total: ids.length, name });
  }

  /**
   * Get progress through the current batch.
   * @returns {{visited: number, reviewed: number, dirty: number, total: number, percent: number, name: string|null}}
   */
  getProgress() {
    const batchIds = this._batchIds || Array.from(this._records.keys());
    const total = batchIds.length;
    let visited = 0, reviewed = 0, dirty = 0;

    for (const id of batchIds) {
      const record = this._records.get(id);
      if (record) {
        if (record.visited) visited++;
        if (record.reviewed) reviewed++;
        if (record.dirty) dirty++;
      }
    }

    return {
      visited,
      reviewed,
      dirty,
      total,
      percent: total > 0 ? Math.round((reviewed / total) * 100) : 0,
      name: this._workflowName,
    };
  }

  /**
   * Get the next unreviewed record ID in the batch.
   * @returns {string|null}
   */
  getNextUnreviewed() {
    const batchIds = this._batchIds || [];
    for (const id of batchIds) {
      const record = this._records.get(id);
      if (!record || !record.reviewed) return id;
    }
    return null;
  }

  /**
   * Get the next unvisited record ID in the batch.
   * @returns {string|null}
   */
  getNextUnvisited() {
    const batchIds = this._batchIds || [];
    for (const id of batchIds) {
      const record = this._records.get(id);
      if (!record || !record.visited) return id;
    }
    return null;
  }

  // ═══════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════

  /**
   * Get session info.
   * @returns {{sessionId: string, startedAt: number, recordCount: number, workflowName: string|null}}
   */
  getSessionInfo() {
    return {
      sessionId: this._sessionId,
      startedAt: this._startedAt,
      recordCount: this._records.size,
      workflowName: this._workflowName,
    };
  }

  /**
   * End the current session and optionally start a new one.
   * @param {Object} [options]
   * @param {boolean} [options.persist=true] - Save session data for potential resume
   */
  end(options = {}) {
    const { persist = true } = options;
    const summary = this.getProgress();

    if (!persist) {
      try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* silent */ }
    }

    this._bus.emit('session:ended', {
      sessionId: this._sessionId,
      summary,
      duration: Date.now() - this._startedAt,
    });

    this._records.clear();
    this._batchIds = null;
    this._workflowName = null;
    this._sessionId = null;
  }

  /**
   * Reset all tracking data for the current session.
   */
  reset() {
    this._records.clear();
    this._persist();
    this._bus.emit('session:reset', {});
  }

  /**
   * Export session data as JSON (for reporting).
   * @returns {string}
   */
  export() {
    return JSON.stringify({
      sessionId: this._sessionId,
      startedAt: this._startedAt,
      workflowName: this._workflowName,
      batchIds: this._batchIds,
      records: Object.fromEntries(this._records),
      progress: this.getProgress(),
      exportedAt: Date.now(),
    }, null, 2);
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private Get or create a record state */
  _getOrCreate(id) {
    if (!this._records.has(id)) {
      this._records.set(id, {
        id,
        visited: false,
        reviewed: false,
        dirty: false,
        dirtyFields: [],
        visitedAt: null,
        reviewedAt: null,
        editedAt: null,
        visitCount: 0,
        notes: null,
      });
    }
    return this._records.get(id);
  }

  /** @private */
  _generateId() {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** @private */
  _persist() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        sessionId: this._sessionId,
        startedAt: this._startedAt,
        workflowName: this._workflowName,
        batchIds: this._batchIds,
        records: Object.fromEntries(this._records),
      }));
    } catch (e) { /* silent */ }
  }

  /** @private */
  _loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this._sessionId = data.sessionId;
        this._startedAt = data.startedAt || Date.now();
        this._workflowName = data.workflowName || null;
        this._batchIds = data.batchIds || null;
        if (data.records) {
          for (const [id, record] of Object.entries(data.records)) {
            this._records.set(id, record);
          }
        }
      }
    } catch (e) { /* silent */ }
  }
}


  // ═══ active-filter-bar.js ═══
/**
 * CtrlK Active Filter Bar
 * ──────────────────────────────────────────────
 * Visual strip showing all active filters as dismissible chips.
 * 
 * Solves the visibility half of Problem #7:
 * ViewStateManager handles persistence.
 * ActiveFilterBar handles display.
 * 
 * The bar shows:
 *   - Each active filter as a chip (column name + value)
 *   - Click X to remove a single filter
 *   - "Clear all" button
 *   - "Save as view" button (opens view naming)
 *   - Filter count badge
 * 
 * Self-contained UI — injects its own DOM and styles.
 * Designed to sit at the top of any grid, regardless of CSS framework.
 * 
 * @module @ctrlk/filter-bar
 * @author Prabhu Raja
 */

const FILTER_BAR_STYLES = `
.ctrlk-filter-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--ctrlk-fb-bg, #f0f4f8);
  border: 1px solid var(--ctrlk-fb-border, #d0d7de);
  border-radius: var(--vlx-border-radius, 4px);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: var(--vlx-font-size-sm, 12px);
  flex-wrap: wrap;
  min-height: 32px;
  transition: all 0.2s;
}
.ctrlk-filter-bar:empty,
.ctrlk-filter-bar.ctrlk-fb-hidden { display: none; }

.ctrlk-filter-bar.ctrlk-fb-dark {
  --ctrlk-fb-bg: #161b22;
  --ctrlk-fb-border: #30363d;
  --ctrlk-chip-bg: #21262d;
  --ctrlk-chip-border: #30363d;
  --ctrlk-chip-text: #c9d1d9;
  --ctrlk-chip-label: #8b949e;
  --ctrlk-chip-x: #8b949e;
  --ctrlk-chip-x-hover: #f85149;
  --ctrlk-action-text: #58a6ff;
}

.ctrlk-fb-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ctrlk-chip-label, #656d76);
  margin-right: 4px;
  flex-shrink: 0;
}

.ctrlk-fb-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--ctrlk-chip-bg, #ddf4ff);
  border: 1px solid var(--ctrlk-chip-border, #a8d8f0);
  border-radius: 3px;
  font-size: 11px;
  color: var(--ctrlk-chip-text, #1a3a4a);
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.15s;
}

.ctrlk-fb-chip-col {
  font-weight: 600;
  margin-right: 2px;
}

.ctrlk-fb-chip-val {
  font-weight: 400;
  opacity: 0.85;
}

.ctrlk-fb-chip-x {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: var(--ctrlk-chip-x, #656d76);
  padding: 0 2px;
  margin-left: 2px;
  flex-shrink: 0;
  transition: color 0.15s;
}
.ctrlk-fb-chip-x:hover { color: var(--ctrlk-chip-x-hover, #cf222e); }

.ctrlk-fb-divider {
  width: 1px;
  height: 16px;
  background: var(--ctrlk-fb-border, #d0d7de);
  margin: 0 4px;
  flex-shrink: 0;
}

.ctrlk-fb-action {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--ctrlk-action-text, #0969da);
  font-family: inherit;
  padding: 2px 6px;
  border-radius: 3px;
  transition: background 0.15s;
  flex-shrink: 0;
}
.ctrlk-fb-action:hover { background: var(--ctrlk-chip-bg, #ddf4ff); }

.ctrlk-fb-count {
  font-size: 10px;
  color: var(--ctrlk-chip-label, #656d76);
  margin-left: auto;
  flex-shrink: 0;
}
`;

class ActiveFilterBar {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   * @param {import('../views/view-state-manager.js').ViewStateManager} [views]
   * @param {import('../grid/grid-adapter.js').GridAdapter} [gridAdapter]
   */
  constructor(bus, views, gridAdapter) {
    this._bus = bus;
    this._views = views || null;
    this._grid = gridAdapter || null;

    /** @type {HTMLElement|null} */
    this._container = null;

    /** @type {HTMLElement|null} */
    this._barElement = null;

    /** @type {string} 'light' or 'dark' */
    this._theme = 'light';

    this._injected = false;
  }

  /**
   * Set the grid adapter.
   * @param {import('../grid/grid-adapter.js').GridAdapter} adapter
   */
  setGridAdapter(adapter) {
    this._grid = adapter;
  }

  /**
   * Set the view state manager.
   * @param {import('../views/view-state-manager.js').ViewStateManager} views
   */
  setViewStateManager(views) {
    this._views = views;
  }

  /**
   * Inject the filter bar into the DOM.
   * @param {string|Element} container - Where to insert the bar (CSS selector or element)
   * @param {Object} [options]
   * @param {string} [options.position='prepend'] - 'prepend', 'append', 'before', 'after'
   * @param {string} [options.theme='light'] - 'light' or 'dark'
   */
  inject(container, options = {}) {
    const { position = 'prepend', theme = 'light' } = options;

    if (this._injected) return;

    this._theme = theme;

    // Inject styles
    if (!document.getElementById('ctrlk-filter-bar-styles')) {
      const style = document.createElement('style');
      style.id = 'ctrlk-filter-bar-styles';
      style.textContent = FILTER_BAR_STYLES;
      document.head.appendChild(style);
    }

    // Create bar element
    this._barElement = document.createElement('div');
    this._barElement.className = `ctrlk-filter-bar ${theme === 'dark' ? 'ctrlk-fb-dark' : ''}`;
    this._barElement.setAttribute('role', 'toolbar');
    this._barElement.setAttribute('aria-label', 'Active filters');

    // Insert into container
    const containerEl = typeof container === 'string' ? document.querySelector(container) : container;
    if (!containerEl) {
      console.warn('[CtrlK] Filter bar container not found:', container);
      return;
    }

    this._container = containerEl;
    switch (position) {
      case 'append': containerEl.appendChild(this._barElement); break;
      case 'before': containerEl.parentNode?.insertBefore(this._barElement, containerEl); break;
      case 'after': containerEl.parentNode?.insertBefore(this._barElement, containerEl.nextSibling); break;
      default: containerEl.prepend(this._barElement);
    }

    // Listen for filter changes
    if (this._grid) {
      this._grid.onGridEvent?.('filterChanged', () => this.refresh());
    }

    this._injected = true;
    this.refresh();
  }

  /**
   * Refresh the filter bar to reflect current filter state.
   */
  refresh() {
    if (!this._barElement || !this._grid) return;

    const filters = this._grid.getFilters();

    if (filters.length === 0) {
      this._barElement.classList.add('ctrlk-fb-hidden');
      this._barElement.innerHTML = '';
      return;
    }

    this._barElement.classList.remove('ctrlk-fb-hidden');

    let html = `<span class="ctrlk-fb-label">Filters</span>`;

    for (const filter of filters) {
      const colName = this._getColumnName(filter.colId);
      const displayValue = this._formatFilterValue(filter);

      html += `
        <span class="ctrlk-fb-chip" data-col="${filter.colId}" title="${colName}: ${displayValue}">
          <span class="ctrlk-fb-chip-col">${colName}</span>
          <span class="ctrlk-fb-chip-val">${displayValue}</span>
          <button class="ctrlk-fb-chip-x" data-remove="${filter.colId}" aria-label="Remove ${colName} filter">×</button>
        </span>
      `;
    }

    html += `<span class="ctrlk-fb-divider"></span>`;
    html += `<button class="ctrlk-fb-action" data-action="clear-all">Clear all</button>`;

    if (this._views) {
      html += `<button class="ctrlk-fb-action" data-action="save-view">Save as view</button>`;
    }

    html += `<span class="ctrlk-fb-count">${filters.length} active</span>`;

    this._barElement.innerHTML = html;

    // Attach handlers
    this._barElement.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const colId = btn.getAttribute('data-remove');
        this._removeFilter(colId);
      });
    });

    this._barElement.querySelector('[data-action="clear-all"]')?.addEventListener('click', () => {
      this._clearAll();
    });

    this._barElement.querySelector('[data-action="save-view"]')?.addEventListener('click', () => {
      this._bus.emit('filterbar:save-view-requested', {});
    });
  }

  /**
   * Set the visual theme.
   * @param {'light'|'dark'} theme
   */
  setTheme(theme) {
    this._theme = theme;
    if (this._barElement) {
      this._barElement.classList.toggle('ctrlk-fb-dark', theme === 'dark');
    }
  }

  /**
   * Get the current filter count.
   * @returns {number}
   */
  getFilterCount() {
    if (!this._grid) return 0;
    return this._grid.getFilters().length;
  }

  /**
   * Destroy the filter bar.
   */
  destroy() {
    if (this._barElement) {
      this._barElement.remove();
      this._barElement = null;
    }
    this._injected = false;
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private */
  _removeFilter(colId) {
    if (this._views) {
      this._views.removeFilter(colId);
    } else if (this._grid) {
      const filters = this._grid.getFilters().filter(f => f.colId !== colId);
      this._grid.setFilters(filters);
    }
    this.refresh();
    this._bus.emit('filterbar:filter-removed', { colId });
  }

  /** @private */
  _clearAll() {
    if (this._grid) {
      this._grid.clearFilters();
    }
    this.refresh();
    this._bus.emit('filterbar:cleared', {});
  }

  /** @private Get column display name from ID */
  _getColumnName(colId) {
    if (this._grid) {
      const cols = this._grid.getColumns();
      const col = cols.find(c => c.colId === colId);
      if (col) return col.headerName || colId;
    }
    return colId;
  }

  /** @private Format a filter value for display */
  _formatFilterValue(filter) {
    const val = filter.value;
    if (val === null || val === undefined) return '(any)';
    if (Array.isArray(val)) return val.slice(0, 3).join(', ') + (val.length > 3 ? ` +${val.length - 3}` : '');
    if (typeof val === 'object') {
      if (val.from !== undefined && val.to !== undefined) return `${val.from} – ${val.to}`;
      return JSON.stringify(val).slice(0, 30);
    }
    const str = String(val);
    const op = filter.operator || '';
    const opSymbol = { equals: '=', contains: '≈', greaterThan: '>', lessThan: '<', startsWith: 'starts' }[op] || '';
    return opSymbol ? `${opSymbol} ${str}` : str;
  }
}


  // ═══ macro-engine.js ═══
/**
 * CtrlK Macro Engine
 * ──────────────────────────────────────────────
 * Record, parameterize, and replay sequences of command executions.
 * 
 * Macros are first-class: they register as commands, appear in the
 * palette, and can be bound to keyboard shortcuts.
 * 
 * Excel parallel:
 *   - Alt+T+M+R = Record Macro
 *   - Alt+T+M+S = Stop Recording
 *   - Alt+F8 = View Macros
 *   - Assign to shortcut = bind to key
 * 
 * Workflow:
 *   1. ctrlk.macro.record('Monday Report')
 *   2. User performs actions (filter, sort, export) — each command:executed event is captured
 *   3. ctrlk.macro.stop()
 *   4. ctrlk.macro.play('Monday Report') — replays all steps
 *   5. The macro appears in Ctrl+K palette as "▶ Monday Report"
 * 
 * Macros capture command IDs and their arguments.
 * They do NOT capture mouse movements or DOM interactions.
 * This is intentional — macros are command-level, not UI-level.
 * 
 * @module @ctrlk/macro
 * @author Prabhu Raja
 */

const STORAGE_KEY = 'ctrlk-macros';

/**
 * @typedef {Object} MacroStep
 * @property {string} commandId - Command that was executed
 * @property {any[]} args - Arguments passed to the command
 * @property {number} delay - Milliseconds since previous step (for pacing)
 * @property {number} timestamp - When this step was recorded
 */

/**
 * @typedef {Object} MacroDefinition
 * @property {string} name - Macro name
 * @property {string} [description] - What this macro does
 * @property {MacroStep[]} steps - Recorded command sequence
 * @property {number} createdAt - When recorded
 * @property {number} [lastRun] - Last playback timestamp
 * @property {number} runCount - How many times played
 * @property {string} [shortcut] - Bound keyboard shortcut
 */

class MacroEngine {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   * @param {import('../core/command-registry.js').CommandRegistry} commands
   */
  constructor(bus, commands) {
    this._bus = bus;
    this._commands = commands;

    /** @type {Map<string, MacroDefinition>} */
    this._macros = new Map();

    /** @type {boolean} Currently recording */
    this._recording = false;

    /** @type {string|null} Name of macro being recorded */
    this._recordingName = null;

    /** @type {MacroStep[]} Steps captured during recording */
    this._recordingSteps = [];

    /** @type {number} Timestamp of last recorded step */
    this._lastStepTime = 0;

    /** @type {Function|null} Event listener cleanup */
    this._recordListener = null;

    /** @type {boolean} Currently playing */
    this._playing = false;

    /** @type {string|null} Name of macro being played */
    this._playingName = null;

    /** @type {Set<string>} Command IDs to skip during recording (macro commands themselves) */
    this._skipCommands = new Set([
      'ctrlk.macro.record', 'ctrlk.macro.stop', 'ctrlk.macro.play',
      'ctrlk.macro.list', 'ctrlk.palette', 'ctrlk.shortcuts',
    ]);
  }

  /**
   * Initialize — load macros from storage, register macro commands.
   */
  init() {
    this._loadFromStorage();
    this._registerMacroCommands();
    this._registerSavedMacrosAsCommands();
  }

  // ═══════════════════════════════════════════
  // RECORD
  // ═══════════════════════════════════════════

  /**
   * Start recording a macro.
   * @param {string} name - Name for the macro
   */
  record(name) {
    if (this._recording) {
      console.warn('[CtrlK] Already recording. Stop the current recording first.');
      return;
    }
    if (!name) {
      throw new Error('[CtrlK] Macro name is required');
    }

    this._recording = true;
    this._recordingName = name;
    this._recordingSteps = [];
    this._lastStepTime = Date.now();

    // Listen for command executions
    this._recordListener = this._bus.on('command:executed', (data) => {
      if (!this._recording) return;
      if (this._playing) return; // Don't record playback
      if (this._skipCommands.has(data.id)) return;

      const now = Date.now();
      this._recordingSteps.push({
        commandId: data.id,
        args: data.args || [],
        delay: now - this._lastStepTime,
        timestamp: now,
      });
      this._lastStepTime = now;

      this._bus.emit('macro:step-recorded', {
        macro: this._recordingName,
        step: this._recordingSteps.length,
        commandId: data.id,
      });
    });

    this._bus.emit('macro:recording-started', { name });
  }

  /**
   * Stop recording and save the macro.
   * @returns {MacroDefinition|null}
   */
  stop() {
    if (!this._recording) {
      console.warn('[CtrlK] Not currently recording.');
      return null;
    }

    // Clean up listener
    if (this._recordListener) {
      this._recordListener();
      this._recordListener = null;
    }

    const macro = {
      name: this._recordingName,
      description: '',
      steps: [...this._recordingSteps],
      createdAt: Date.now(),
      lastRun: null,
      runCount: 0,
      shortcut: null,
    };

    this._macros.set(macro.name, macro);
    this._persistToStorage();

    // Register as a command
    this._registerMacroAsCommand(macro);

    this._recording = false;
    const name = this._recordingName;
    this._recordingName = null;
    this._recordingSteps = [];

    this._bus.emit('macro:recording-stopped', { name, stepCount: macro.steps.length });
    return macro;
  }

  /**
   * Cancel the current recording without saving.
   */
  cancel() {
    if (!this._recording) return;

    if (this._recordListener) {
      this._recordListener();
      this._recordListener = null;
    }

    this._recording = false;
    this._recordingName = null;
    this._recordingSteps = [];
    this._bus.emit('macro:recording-cancelled', {});
  }

  /**
   * Check if currently recording.
   * @returns {boolean}
   */
  isRecording() {
    return this._recording;
  }

  /**
   * Get the current recording state.
   * @returns {{name: string, stepCount: number}|null}
   */
  getRecordingState() {
    if (!this._recording) return null;
    return { name: this._recordingName, stepCount: this._recordingSteps.length };
  }

  // ═══════════════════════════════════════════
  // PLAY
  // ═══════════════════════════════════════════

  /**
   * Play a macro.
   * @param {string} name
   * @param {Object} [options]
   * @param {boolean} [options.instant=false] - Skip delays between steps
   * @param {Object} [options.params] - Parameter overrides (for parameterized macros)
   * @returns {Promise<boolean>} True if completed successfully
   */
  async play(name, options = {}) {
    const { instant = false, params = {} } = options;

    const macro = this._macros.get(name);
    if (!macro) {
      console.warn(`[CtrlK] Macro not found: "${name}"`);
      return false;
    }

    if (macro.steps.length === 0) {
      console.warn(`[CtrlK] Macro "${name}" has no steps`);
      return false;
    }

    this._playing = true;
    this._playingName = name;

    this._bus.emit('macro:playback-started', { name, totalSteps: macro.steps.length });

    try {
      for (let i = 0; i < macro.steps.length; i++) {
        const step = macro.steps[i];

        // Wait for delay (unless instant mode)
        if (!instant && step.delay > 0 && i > 0) {
          await this._delay(Math.min(step.delay, 2000)); // Cap at 2 seconds
        }

        // Execute the command
        const args = this._resolveParams(step.args, params);
        this._commands.execute(step.commandId, ...args);

        this._bus.emit('macro:step-played', {
          macro: name,
          step: i + 1,
          total: macro.steps.length,
          commandId: step.commandId,
        });
      }
    } catch (err) {
      console.error(`[CtrlK] Macro "${name}" failed at step:`, err);
      this._bus.emit('macro:playback-error', { name, error: err.message });
      this._playing = false;
      this._playingName = null;
      return false;
    }

    // Update stats
    macro.lastRun = Date.now();
    macro.runCount++;
    this._persistToStorage();

    this._playing = false;
    this._playingName = null;
    this._bus.emit('macro:playback-completed', { name, steps: macro.steps.length });
    return true;
  }

  /**
   * Check if currently playing.
   * @returns {boolean}
   */
  isPlaying() {
    return this._playing;
  }

  // ═══════════════════════════════════════════
  // MANAGE
  // ═══════════════════════════════════════════

  /**
   * Get a macro definition.
   * @param {string} name
   * @returns {MacroDefinition|undefined}
   */
  get(name) {
    return this._macros.get(name);
  }

  /**
   * List all macros.
   * @param {Object} [options]
   * @param {string} [options.sortBy='lastRun'] - 'lastRun', 'name', 'runCount', 'createdAt'
   * @returns {MacroDefinition[]}
   */
  list(options = {}) {
    const { sortBy = 'lastRun' } = options;
    const macros = Array.from(this._macros.values());

    if (sortBy === 'name') macros.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'runCount') macros.sort((a, b) => b.runCount - a.runCount);
    else if (sortBy === 'createdAt') macros.sort((a, b) => b.createdAt - a.createdAt);
    else macros.sort((a, b) => (b.lastRun || 0) - (a.lastRun || 0));

    return macros;
  }

  /**
   * Delete a macro.
   * @param {string} name
   * @returns {boolean}
   */
  delete(name) {
    const deleted = this._macros.delete(name);
    if (deleted) {
      // Unregister the command
      try { this._commands.unregister(`macro.${this._slugify(name)}`); } catch (e) { /* silent */ }
      this._persistToStorage();
      this._bus.emit('macro:deleted', { name });
    }
    return deleted;
  }

  /**
   * Rename a macro.
   * @param {string} oldName
   * @param {string} newName
   */
  rename(oldName, newName) {
    const macro = this._macros.get(oldName);
    if (!macro) return false;
    macro.name = newName;
    this._macros.delete(oldName);
    this._macros.set(newName, macro);
    this._persistToStorage();
    this._bus.emit('macro:renamed', { oldName, newName });
    return true;
  }

  /**
   * Edit a macro's steps (remove, reorder).
   * @param {string} name
   * @param {Function} editor - Receives steps array, returns modified steps
   * @returns {boolean}
   */
  edit(name, editor) {
    const macro = this._macros.get(name);
    if (!macro) return false;
    macro.steps = editor([...macro.steps]);
    this._persistToStorage();
    this._bus.emit('macro:edited', { name, stepCount: macro.steps.length });
    return true;
  }

  /**
   * Set the description of a macro.
   * @param {string} name
   * @param {string} description
   */
  setDescription(name, description) {
    const macro = this._macros.get(name);
    if (macro) {
      macro.description = description;
      this._persistToStorage();
    }
  }

  /**
   * Bind a macro to a keyboard shortcut.
   * @param {string} name
   * @param {string} shortcut
   */
  bindShortcut(name, shortcut) {
    const macro = this._macros.get(name);
    if (!macro) return;
    macro.shortcut = shortcut;
    const cmdId = `macro.${this._slugify(name)}`;
    // The keys module handles the binding
    this._bus.emit('macro:shortcut-bound', { name, shortcut, commandId: cmdId });
    this._persistToStorage();
  }

  /**
   * Export a macro as JSON (shareable).
   * @param {string} name
   * @returns {string}
   */
  export(name) {
    const macro = this._macros.get(name);
    if (!macro) throw new Error(`[CtrlK] Macro not found: "${name}"`);
    return JSON.stringify(macro, null, 2);
  }

  /**
   * Import a macro from JSON.
   * @param {string|Object} data
   * @param {Object} [options]
   * @param {boolean} [options.overwrite=false]
   * @returns {MacroDefinition}
   */
  import(data, options = {}) {
    const { overwrite = false } = options;
    const macro = typeof data === 'string' ? JSON.parse(data) : data;
    if (!macro.name || !macro.steps) throw new Error('[CtrlK] Invalid macro data');
    if (this._macros.has(macro.name) && !overwrite) {
      throw new Error(`[CtrlK] Macro "${macro.name}" already exists`);
    }
    macro.runCount = macro.runCount || 0;
    this._macros.set(macro.name, macro);
    this._registerMacroAsCommand(macro);
    this._persistToStorage();
    this._bus.emit('macro:imported', { name: macro.name });
    return macro;
  }

  /**
   * Get count of saved macros.
   * @returns {number}
   */
  count() {
    return this._macros.size;
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private Register built-in macro commands */
  _registerMacroCommands() {
    this._commands.register({
      id: 'ctrlk.macro.record',
      title: 'Record Macro',
      category: 'Macros',
      icon: '⏺',
      description: 'Start recording a macro',
      execute: () => {
        // In a real UI, this would open a prompt for the macro name
        this._bus.emit('macro:record-prompt', {});
      },
    });

    this._commands.register({
      id: 'ctrlk.macro.stop',
      title: 'Stop Recording',
      category: 'Macros',
      icon: '⏹',
      description: 'Stop recording the current macro',
      when: () => this._recording,
      execute: () => this.stop(),
    });

    this._commands.register({
      id: 'ctrlk.macro.list',
      title: 'View Macros',
      category: 'Macros',
      icon: '📋',
      description: 'List all saved macros',
      execute: () => this._bus.emit('macro:list-requested', { macros: this.list() }),
    });
  }

  /** @private Register a saved macro as an executable command */
  _registerMacroAsCommand(macro) {
    const cmdId = `macro.${this._slugify(macro.name)}`;
    this._commands.register({
      id: cmdId,
      title: `▶ ${macro.name}`,
      category: 'Macros',
      icon: '▶',
      description: macro.description || `${macro.steps.length} steps · Run ${macro.runCount} times`,
      shortcut: macro.shortcut || undefined,
      execute: () => this.play(macro.name, { instant: true }),
    });
  }

  /** @private Register all saved macros as commands */
  _registerSavedMacrosAsCommands() {
    for (const macro of this._macros.values()) {
      this._registerMacroAsCommand(macro);
    }
  }

  /** @private Resolve parameterized arguments */
  _resolveParams(args, params) {
    return args.map(arg => {
      if (typeof arg === 'string' && arg.startsWith('$')) {
        const paramName = arg.slice(1);
        return params[paramName] !== undefined ? params[paramName] : arg;
      }
      return arg;
    });
  }

  /** @private Promise-based delay */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** @private Create a URL-safe slug from a name */
  _slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  }

  /** @private */
  _persistToStorage() {
    try {
      const data = {};
      for (const [name, macro] of this._macros) {
        data[name] = macro;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* silent */ }
  }

  /** @private */
  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        for (const [name, macro] of Object.entries(data)) {
          this._macros.set(name, macro);
        }
      }
    } catch (e) { /* silent */ }
  }
}


  // ═══ history-manager.js ═══
/**
 * CtrlK History Manager
 * ──────────────────────────────────────────────
 * Application-level undo/redo with history branching.
 * 
 * Not form-field undo. Full state transition history.
 * Every command that registers an `undo` function is
 * automatically tracked. Ctrl+Z undoes. Ctrl+Y / Ctrl+Shift+Z redoes.
 * 
 * Branching: Go back 5 actions, make a different change,
 * the old future becomes a named branch you can return to.
 * 
 * Excel parallel:
 *   - Ctrl+Z = Undo (our undo)
 *   - Ctrl+Y = Redo (our redo)
 *   - Undo dropdown showing history = our timeline()
 * 
 * Integration:
 *   Commands opt into history by providing an `undo` function:
 *   
 *   ctrlk.commands.register({
 *     id: 'field.update',
 *     execute: (fieldId, newValue) => {
 *       const old = getFieldValue(fieldId);
 *       setFieldValue(fieldId, newValue);
 *       return old; // return value is passed to undo
 *     },
 *     undo: (returnValue, fieldId, newValue) => {
 *       setFieldValue(fieldId, returnValue); // restore old value
 *     },
 *   });
 * 
 * @module @ctrlk/history
 * @author Prabhu Raja
 */

/**
 * @typedef {Object} HistoryEntry
 * @property {string} id - Unique entry ID
 * @property {string} commandId - Command that was executed
 * @property {any[]} args - Arguments passed to execute
 * @property {any} result - Return value from execute (passed to undo)
 * @property {number} timestamp - When executed
 * @property {string} [label] - Human-readable description
 * @property {string} [branch] - Branch name (null = main)
 */

class HistoryManager {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   * @param {import('../core/command-registry.js').CommandRegistry} commands
   */
  constructor(bus, commands) {
    this._bus = bus;
    this._commands = commands;

    /** @type {HistoryEntry[]} Main history stack */
    this._stack = [];

    /** @type {number} Current position in the stack (-1 = no history) */
    this._position = -1;

    /** @type {Map<string, {entries: HistoryEntry[], branchedAt: number}>} Named branches */
    this._branches = new Map();

    /** @type {number} Maximum history entries before oldest are dropped */
    this._maxEntries = 200;

    /** @type {boolean} Whether we're currently undoing/redoing (prevent re-recording) */
    this._inUndoRedo = false;

    /** @type {Function|null} */
    this._commandListener = null;

    /** @type {number} Counter for unique entry IDs */
    this._counter = 0;

    /** @type {boolean} Paused — don't record while paused */
    this._paused = false;
  }

  /**
   * Initialize — start listening for undoable command executions.
   */
  init() {
    this._commandListener = this._bus.on('command:executed', (data) => {
      if (this._inUndoRedo || this._paused) return;

      // Only track commands that have undo functions
      const cmd = this._commands.get(data.id);
      if (!cmd || !cmd.undo) return;

      this._pushEntry({
        commandId: data.id,
        args: data.args || [],
        result: data.result,
        label: cmd.title,
      });
    });
  }

  // ═══════════════════════════════════════════
  // UNDO / REDO
  // ═══════════════════════════════════════════

  /**
   * Undo the last action.
   * @returns {boolean} True if something was undone
   */
  undo() {
    if (!this.canUndo()) return false;

    const entry = this._stack[this._position];
    const cmd = this._commands.get(entry.commandId);

    if (!cmd || !cmd.undo) {
      console.warn(`[CtrlK] Cannot undo "${entry.commandId}" — no undo function`);
      return false;
    }

    this._inUndoRedo = true;
    try {
      // Call undo with: (result from execute, ...original args)
      cmd.undo(entry.result, ...entry.args);
    } catch (err) {
      console.error(`[CtrlK] Undo failed for "${entry.commandId}":`, err);
      this._inUndoRedo = false;
      return false;
    }
    this._inUndoRedo = false;

    this._position--;

    this._bus.emit('history:undo', {
      commandId: entry.commandId,
      label: entry.label,
      position: this._position,
      total: this._stack.length,
    });

    return true;
  }

  /**
   * Redo the next action.
   * @returns {boolean} True if something was redone
   */
  redo() {
    if (!this.canRedo()) return false;

    this._position++;
    const entry = this._stack[this._position];
    const cmd = this._commands.get(entry.commandId);

    if (!cmd) {
      console.warn(`[CtrlK] Cannot redo "${entry.commandId}" — command not found`);
      this._position--;
      return false;
    }

    this._inUndoRedo = true;
    try {
      const result = cmd.execute(...entry.args);
      entry.result = result; // Update result in case it changed
    } catch (err) {
      console.error(`[CtrlK] Redo failed for "${entry.commandId}":`, err);
      this._position--;
      this._inUndoRedo = false;
      return false;
    }
    this._inUndoRedo = false;

    this._bus.emit('history:redo', {
      commandId: entry.commandId,
      label: entry.label,
      position: this._position,
      total: this._stack.length,
    });

    return true;
  }

  /**
   * Check if undo is available.
   * @returns {boolean}
   */
  canUndo() {
    return this._position >= 0;
  }

  /**
   * Check if redo is available.
   * @returns {boolean}
   */
  canRedo() {
    return this._position < this._stack.length - 1;
  }

  // ═══════════════════════════════════════════
  // TIMELINE — History visualization
  // ═══════════════════════════════════════════

  /**
   * Get the full history timeline.
   * @param {Object} [options]
   * @param {number} [options.limit] - Max entries to return
   * @returns {Array<HistoryEntry & {isCurrent: boolean, canUndo: boolean}>}
   */
  timeline(options = {}) {
    const { limit } = options;
    let entries = this._stack.map((entry, idx) => ({
      ...entry,
      isCurrent: idx === this._position,
      canUndo: idx <= this._position,
    }));

    if (limit) {
      // Show entries around current position
      const start = Math.max(0, this._position - Math.floor(limit / 2));
      entries = entries.slice(start, start + limit);
    }

    return entries;
  }

  /**
   * Jump to a specific point in history.
   * @param {string} entryId - The history entry ID to jump to
   * @returns {boolean}
   */
  jumpTo(entryId) {
    const targetIdx = this._stack.findIndex(e => e.id === entryId);
    if (targetIdx === -1) return false;

    // Need to undo or redo to reach the target
    if (targetIdx < this._position) {
      // Undo forward from current to target
      while (this._position > targetIdx) {
        if (!this.undo()) break;
      }
    } else if (targetIdx > this._position) {
      // Redo forward from current to target
      while (this._position < targetIdx) {
        if (!this.redo()) break;
      }
    }

    return this._position === targetIdx;
  }

  // ═══════════════════════════════════════════
  // BRANCHING — Divergent history paths
  // ═══════════════════════════════════════════

  /**
   * Create a named branch at the current position.
   * Saves the "future" (entries after current position) as a branch
   * so it can be restored later if the user goes down a different path.
   * 
   * @param {string} [name] - Branch name (auto-generated if omitted)
   * @returns {string} Branch name
   */
  branch(name) {
    const branchName = name || `branch-${Date.now()}`;

    // Save everything after current position as the branch
    const futureEntries = this._stack.slice(this._position + 1);
    this._branches.set(branchName, {
      entries: futureEntries,
      branchedAt: this._position,
    });

    // Trim the stack to current position
    this._stack = this._stack.slice(0, this._position + 1);

    this._bus.emit('history:branched', {
      name: branchName,
      savedEntries: futureEntries.length,
      position: this._position,
    });

    return branchName;
  }

  /**
   * Restore a branch — undo back to the branch point and replay the branch.
   * @param {string} name - Branch name
   * @returns {boolean}
   */
  restoreBranch(name) {
    const branch = this._branches.get(name);
    if (!branch) return false;

    // Undo back to the branch point
    while (this._position > branch.branchedAt) {
      if (!this.undo()) break;
    }

    // Save current future as a new branch (so we don't lose it)
    const currentFuture = this._stack.slice(this._position + 1);
    if (currentFuture.length > 0) {
      this._branches.set(`pre-restore-${Date.now()}`, {
        entries: currentFuture,
        branchedAt: this._position,
      });
    }

    // Replace future with branch entries
    this._stack = this._stack.slice(0, this._position + 1).concat(branch.entries);

    // Redo all branch entries
    while (this.canRedo()) {
      if (!this.redo()) break;
    }

    this._bus.emit('history:branch-restored', { name, entries: branch.entries.length });
    return true;
  }

  /**
   * List all branches.
   * @returns {Array<{name: string, entryCount: number, branchedAt: number}>}
   */
  listBranches() {
    return Array.from(this._branches.entries()).map(([name, branch]) => ({
      name,
      entryCount: branch.entries.length,
      branchedAt: branch.branchedAt,
    }));
  }

  /**
   * Delete a branch.
   * @param {string} name
   * @returns {boolean}
   */
  deleteBranch(name) {
    return this._branches.delete(name);
  }

  // ═══════════════════════════════════════════
  // COMPARE — Diff between states
  // ═══════════════════════════════════════════

  /**
   * Get the changes between two points in history.
   * @param {number} fromPosition - Start position
   * @param {number} toPosition - End position
   * @returns {HistoryEntry[]} Entries between the two positions
   */
  diff(fromPosition, toPosition) {
    const start = Math.min(fromPosition, toPosition);
    const end = Math.max(fromPosition, toPosition);
    return this._stack.slice(start + 1, end + 1);
  }

  // ═══════════════════════════════════════════
  // CONTROL
  // ═══════════════════════════════════════════

  /**
   * Pause history recording (e.g., during batch operations).
   */
  pause() {
    this._paused = true;
  }

  /**
   * Resume history recording.
   */
  resume() {
    this._paused = false;
  }

  /**
   * Clear all history.
   */
  clear() {
    this._stack = [];
    this._position = -1;
    this._branches.clear();
    this._bus.emit('history:cleared', {});
  }

  /**
   * Get current state.
   * @returns {{position: number, total: number, canUndo: boolean, canRedo: boolean, branches: number}}
   */
  getState() {
    return {
      position: this._position,
      total: this._stack.length,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      branches: this._branches.size,
    };
  }

  /**
   * Destroy — clean up listeners.
   */
  destroy() {
    if (this._commandListener) {
      this._commandListener();
      this._commandListener = null;
    }
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private Push a new entry to the stack */
  _pushEntry({ commandId, args, result, label }) {
    // If we're not at the end of the stack, we're creating a new branch
    // Automatically save the future as an unnamed branch
    if (this._position < this._stack.length - 1) {
      const future = this._stack.slice(this._position + 1);
      if (future.length > 0) {
        this._branches.set(`auto-${Date.now()}`, {
          entries: future,
          branchedAt: this._position,
        });
      }
      // Trim stack to current position
      this._stack = this._stack.slice(0, this._position + 1);
    }

    const entry = {
      id: `h-${++this._counter}`,
      commandId,
      args: args || [],
      result,
      timestamp: Date.now(),
      label: label || commandId,
      branch: null,
    };

    this._stack.push(entry);
    this._position = this._stack.length - 1;

    // Enforce max entries
    if (this._stack.length > this._maxEntries) {
      const excess = this._stack.length - this._maxEntries;
      this._stack.splice(0, excess);
      this._position -= excess;
    }

    this._bus.emit('history:pushed', {
      entry,
      position: this._position,
      total: this._stack.length,
    });
  }
}


  // ═══ view-share.js ═══
/**
 * CtrlK View Share
 * ──────────────────────────────────────────────
 * Shareable application views — the feature enterprise apps never built.
 * 
 * Three tiers:
 * 
 *   Tier 1 — URL Links (open-source, no server):
 *     Compress full view state → encode in URL hash → paste in Slack.
 *     Recipient clicks → state restores exactly. Zero infrastructure.
 * 
 *   Tier 2 — Stored Shares (open-source, app provides storage):
 *     Save views to a shared backend. Team members see them in Ctrl+K
 *     palette under "Team Views." Any user can share with any user.
 * 
 *   Tier 3 — Live Shares (Enterprise):
 *     Real-time view sync via WebSocket. "Follow my view" — both users
 *     see the same filters, columns, scroll position. Opt-in, not forced.
 * 
 * IDE parallel: VS Code Settings Sync, IntelliJ shared project configs.
 * An IOUX transfers operational knowledge the same way an IDE transfers
 * development environment knowledge.
 * 
 * @module @ctrlk/share
 * @author Prabhu Raja
 */

/**
 * @typedef {Object} SharedView
 * @property {string} id - Unique share ID
 * @property {string} name - View name
 * @property {string} sharedBy - User who shared it
 * @property {number} sharedAt - Timestamp
 * @property {Object} state - The serialized view state
 * @property {string} [description] - Optional note about what this view shows
 * @property {string} [scope] - 'link' | 'team' | 'org' | 'public'
 * @property {number} [expiresAt] - Optional expiration timestamp
 * @property {number} useCount - How many times loaded by others
 */

/**
 * @typedef {Object} ShareProvider
 * @property {Function} save - async (sharedView) => string (returns viewId)
 * @property {Function} load - async (viewId) => SharedView | null
 * @property {Function} list - async (options?) => SharedView[]
 * @property {Function} delete - async (viewId) => boolean
 * @property {Function} [update] - async (viewId, updates) => boolean
 */

const SHARE_HASH_PREFIX = 'ctrlk=';
const RECENT_SHARES_KEY = 'ctrlk-recent-shares';

class ViewShare {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   * @param {import('../views/view-state-manager.js').ViewStateManager} views
   */
  constructor(bus, views) {
    this._bus = bus;
    this._views = views;

    /** @type {ShareProvider|null} */
    this._provider = null;

    /** @type {string|null} Current user identifier (for sharedBy field) */
    this._userId = null;

    /** @type {Array<{id: string, name: string, sharedAt: number}>} Recently shared/received */
    this._recentShares = [];

    /** @type {Function|null} Live broadcast cleanup */
    this._broadcastCleanup = null;

    /** @type {Function|null} Live follow cleanup */
    this._followCleanup = null;
  }

  /**
   * Set the current user identity.
   * @param {string} userId - Display name or ID of the current user
   */
  setUser(userId) {
    this._userId = userId;
  }

  /**
   * Set the storage provider for Tier 2 sharing.
   * 
   * Example — REST API provider:
   *   ctrlk.share.setProvider({
   *     save: async (view) => {
   *       const res = await fetch('/api/shared-views', {
   *         method: 'POST', body: JSON.stringify(view),
   *         headers: { 'Content-Type': 'application/json' }
   *       });
   *       const { id } = await res.json();
   *       return id;
   *     },
   *     load: async (id) => {
   *       const res = await fetch(`/api/shared-views/${id}`);
   *       return res.ok ? res.json() : null;
   *     },
   *     list: async () => {
   *       const res = await fetch('/api/shared-views');
   *       return res.json();
   *     },
   *     delete: async (id) => {
   *       const res = await fetch(`/api/shared-views/${id}`, { method: 'DELETE' });
   *       return res.ok;
   *     },
   *   });
   * 
   * Example — localStorage provider (for testing/demos):
   *   ctrlk.share.setProvider(ctrlk.share.createLocalProvider());
   * 
   * @param {ShareProvider} provider
   */
  setProvider(provider) {
    if (typeof provider.save !== 'function' || typeof provider.load !== 'function' || typeof provider.list !== 'function') {
      throw new Error('[CtrlK] ShareProvider must implement save, load, and list');
    }
    this._provider = provider;
  }

  /**
   * Initialize — check URL for shared view on page load.
   */
  init() {
    this._loadRecentShares();
    // Auto-apply shared view from URL hash if present
    if (typeof window !== 'undefined' && window.location?.hash) {
      this._checkUrlForSharedView();
    }
  }

  // ═══════════════════════════════════════════
  // TIER 1 — URL-Encoded Shareable Links
  // ═══════════════════════════════════════════

  /**
   * Create a shareable URL link with the current view state encoded in the hash.
   * No server required — state travels in the URL.
   * 
   * @param {Object} [options]
   * @param {string} [options.name] - Optional name for the shared view
   * @param {string} [options.description] - Optional description
   * @param {Object} [options.state] - State to share (defaults to current)
   * @returns {string} The full shareable URL
   */
  createLink(options = {}) {
    const { name = '', description = '', state = null } = options;

    const viewState = state || this._views.capture();

    const sharePayload = {
      v: 1, // version for forward compatibility
      n: name,
      d: description,
      s: viewState,
      by: this._userId || 'unknown',
      at: Date.now(),
    };

    const compressed = this._compress(JSON.stringify(sharePayload));
    const baseUrl = typeof window !== 'undefined'
      ? window.location.href.split('#')[0]
      : '';

    const link = `${baseUrl}#${SHARE_HASH_PREFIX}${compressed}`;

    this._bus.emit('share:link-created', {
      name,
      length: link.length,
      stateSize: JSON.stringify(viewState).length,
      compressedSize: compressed.length,
    });

    return link;
  }

  /**
   * Check the current URL for a shared view and apply it.
   * Called automatically on init, but can be called manually.
   * 
   * @returns {boolean} True if a shared view was found and applied
   */
  applyFromUrl() {
    return this._checkUrlForSharedView();
  }

  /**
   * Copy a shareable link to clipboard.
   * @param {Object} [options] - Same as createLink options
   * @returns {Promise<string>} The link that was copied
   */
  async copyLink(options = {}) {
    const link = this.createLink(options);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      }
    } catch (e) {
      // Clipboard API not available — return link anyway
    }
    this._bus.emit('share:link-copied', { link, length: link.length });
    return link;
  }

  /**
   * Get metadata from a shared link without applying it.
   * @param {string} url - The shared URL
   * @returns {Object|null} { name, description, sharedBy, sharedAt, stateKeys }
   */
  peekLink(url) {
    try {
      const hash = url.split('#')[1] || '';
      if (!hash.startsWith(SHARE_HASH_PREFIX)) return null;

      const encoded = hash.slice(SHARE_HASH_PREFIX.length);
      const payload = JSON.parse(this._decompress(encoded));

      return {
        name: payload.n || '',
        description: payload.d || '',
        sharedBy: payload.by || 'unknown',
        sharedAt: payload.at || 0,
        version: payload.v || 1,
        hasGridState: !!payload.s?.grid,
        hasAppState: !!payload.s?.app && Object.keys(payload.s.app).length > 0,
      };
    } catch (e) {
      return null;
    }
  }

  // ═══════════════════════════════════════════
  // TIER 2 — Stored Shared Views
  // ═══════════════════════════════════════════

  /**
   * Publish the current view to the shared store.
   * Requires a ShareProvider to be set.
   * 
   * @param {string} name - Name for the shared view
   * @param {Object} [options]
   * @param {string} [options.description] - Description
   * @param {string} [options.scope='team'] - 'team', 'org', 'public'
   * @param {number} [options.expiresIn] - Milliseconds until expiration
   * @param {Object} [options.state] - State to share (defaults to current)
   * @returns {Promise<string>} The share ID
   */
  async publish(name, options = {}) {
    if (!this._provider) {
      throw new Error('[CtrlK] ShareProvider required for publish. Use setProvider() or createLink() for URL sharing.');
    }

    const {
      description = '',
      scope = 'team',
      expiresIn = null,
      state = null,
    } = options;

    const viewState = state || this._views.capture();

    const sharedView = {
      id: this._generateId(),
      name,
      sharedBy: this._userId || 'unknown',
      sharedAt: Date.now(),
      state: viewState,
      description,
      scope,
      expiresAt: expiresIn ? Date.now() + expiresIn : null,
      useCount: 0,
    };

    const viewId = await this._provider.save(sharedView);
    sharedView.id = viewId || sharedView.id;

    this._addToRecent({ id: sharedView.id, name, sharedAt: sharedView.sharedAt, type: 'published' });

    this._bus.emit('share:published', { id: sharedView.id, name, scope, sharedBy: sharedView.sharedBy });
    return sharedView.id;
  }

  /**
   * Load a shared view by ID from the store and apply it.
   * @param {string} viewId
   * @returns {Promise<boolean>}
   */
  async load(viewId) {
    if (!this._provider) {
      throw new Error('[CtrlK] ShareProvider required for load.');
    }

    const sharedView = await this._provider.load(viewId);
    if (!sharedView) {
      console.warn(`[CtrlK] Shared view not found: ${viewId}`);
      return false;
    }

    // Check expiration
    if (sharedView.expiresAt && Date.now() > sharedView.expiresAt) {
      console.warn(`[CtrlK] Shared view expired: ${viewId}`);
      this._bus.emit('share:expired', { id: viewId, name: sharedView.name });
      return false;
    }

    // Auto-save current state before applying shared view
    this._views.autoSave();

    // Apply the shared state
    if (sharedView.state) {
      // Restore grid state
      if (sharedView.state.grid) {
        const adapter = this._views._gridAdapter;
        if (adapter) {
          try {
            adapter.restoreState(sharedView.state.grid);
          } catch (e) {
            console.warn('[CtrlK] Failed to restore shared grid state:', e.message);
          }
        }
      }

      // Restore app state via providers
      if (sharedView.state.app) {
        for (const [key, providerState] of Object.entries(sharedView.state.app)) {
          const provider = this._views._providers.get(key);
          if (provider) {
            try {
              provider.restore(providerState);
            } catch (e) {
              console.warn(`[CtrlK] Failed to restore shared provider "${key}":`, e.message);
            }
          }
        }
      }
    }

    // Track usage
    sharedView.useCount = (sharedView.useCount || 0) + 1;
    if (this._provider.update) {
      try { await this._provider.update(viewId, { useCount: sharedView.useCount }); } catch (e) { /* silent */ }
    }

    this._addToRecent({ id: viewId, name: sharedView.name, sharedAt: sharedView.sharedAt, type: 'loaded' });

    this._bus.emit('share:loaded', {
      id: viewId,
      name: sharedView.name,
      sharedBy: sharedView.sharedBy,
      sharedAt: sharedView.sharedAt,
      useCount: sharedView.useCount,
    });

    return true;
  }

  /**
   * List all shared views from the store.
   * @param {Object} [options]
   * @param {string} [options.scope] - Filter by scope
   * @param {string} [options.sharedBy] - Filter by user
   * @param {string} [options.sortBy='sharedAt'] - 'sharedAt', 'name', 'useCount'
   * @returns {Promise<SharedView[]>}
   */
  async list(options = {}) {
    if (!this._provider) return [];

    let views = await this._provider.list(options);

    // Filter expired
    const now = Date.now();
    views = views.filter(v => !v.expiresAt || v.expiresAt > now);

    // Sort
    const { sortBy = 'sharedAt' } = options;
    if (sortBy === 'name') views.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'useCount') views.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
    else views.sort((a, b) => (b.sharedAt || 0) - (a.sharedAt || 0));

    return views;
  }

  /**
   * Delete a shared view from the store.
   * @param {string} viewId
   * @returns {Promise<boolean>}
   */
  async remove(viewId) {
    if (!this._provider) return false;
    const deleted = await this._provider.delete(viewId);
    if (deleted) {
      this._bus.emit('share:deleted', { id: viewId });
    }
    return deleted;
  }

  /**
   * Update a shared view's metadata.
   * @param {string} viewId
   * @param {Object} updates - { name?, description?, scope?, state? }
   * @returns {Promise<boolean>}
   */
  async update(viewId, updates) {
    if (!this._provider?.update) return false;
    const result = await this._provider.update(viewId, updates);
    if (result) {
      this._bus.emit('share:updated', { id: viewId, updates });
    }
    return result;
  }

  // ═══════════════════════════════════════════
  // TIER 3 — Live View Sharing (Enterprise)
  // ═══════════════════════════════════════════

  /**
   * Start broadcasting the current view state.
   * Other users can follow this broadcast.
   * 
   * Requires a live transport (WebSocket/SSE) set via setLiveTransport().
   * This is the ctrlk Enterprise feature.
   * 
   * @param {Object} [options]
   * @param {string} [options.channel] - Broadcast channel name
   * @returns {boolean}
   */
  startBroadcast(options = {}) {
    // Enterprise feature — emit event for the transport layer to handle
    this._bus.emit('share:broadcast-start', {
      userId: this._userId,
      channel: options.channel || 'default',
    });

    // Listen for state changes and re-broadcast
    this._broadcastCleanup = this._bus.on('view:*', () => {
      const state = this._views.capture();
      this._bus.emit('share:broadcast-update', { state, userId: this._userId });
    });

    return true;
  }

  /**
   * Stop broadcasting.
   */
  stopBroadcast() {
    if (this._broadcastCleanup) {
      this._broadcastCleanup();
      this._broadcastCleanup = null;
    }
    this._bus.emit('share:broadcast-stop', { userId: this._userId });
  }

  /**
   * Follow another user's broadcast.
   * @param {string} userId - The user to follow
   * @returns {boolean}
   */
  follow(userId) {
    this._bus.emit('share:follow-start', { followUserId: userId, userId: this._userId });

    // Listen for incoming state updates
    this._followCleanup = this._bus.on('share:incoming-state', (data) => {
      if (data.fromUserId === userId && data.state) {
        if (data.state.grid && this._views._gridAdapter) {
          try { this._views._gridAdapter.restoreState(data.state.grid); } catch (e) { /* silent */ }
        }
      }
    });

    return true;
  }

  /**
   * Stop following.
   */
  stopFollow() {
    if (this._followCleanup) {
      this._followCleanup();
      this._followCleanup = null;
    }
    this._bus.emit('share:follow-stop', { userId: this._userId });
  }

  /**
   * Check if currently broadcasting.
   * @returns {boolean}
   */
  isBroadcasting() {
    return !!this._broadcastCleanup;
  }

  /**
   * Check if currently following someone.
   * @returns {boolean}
   */
  isFollowing() {
    return !!this._followCleanup;
  }

  // ═══════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════

  /**
   * Get recently shared/received views.
   * @param {number} [limit=10]
   * @returns {Array<{id: string, name: string, sharedAt: number, type: string}>}
   */
  getRecent(limit = 10) {
    return this._recentShares.slice(0, limit);
  }

  /**
   * Check if a ShareProvider is configured.
   * @returns {boolean}
   */
  hasProvider() {
    return !!this._provider;
  }

  /**
   * Create a localStorage-based provider for testing/demos.
   * @param {string} [namespace='ctrlk-shared'] - Storage key prefix
   * @returns {ShareProvider}
   */
  createLocalProvider(namespace = 'ctrlk-shared') {
    return {
      save: async (view) => {
        const key = `${namespace}:${view.id}`;
        localStorage.setItem(key, JSON.stringify(view));
        // Also maintain an index
        const indexKey = `${namespace}:__index__`;
        const index = JSON.parse(localStorage.getItem(indexKey) || '[]');
        if (!index.includes(view.id)) index.push(view.id);
        localStorage.setItem(indexKey, JSON.stringify(index));
        return view.id;
      },
      load: async (viewId) => {
        const raw = localStorage.getItem(`${namespace}:${viewId}`);
        return raw ? JSON.parse(raw) : null;
      },
      list: async () => {
        const indexKey = `${namespace}:__index__`;
        const index = JSON.parse(localStorage.getItem(indexKey) || '[]');
        const views = [];
        for (const id of index) {
          const raw = localStorage.getItem(`${namespace}:${id}`);
          if (raw) views.push(JSON.parse(raw));
        }
        return views;
      },
      delete: async (viewId) => {
        localStorage.removeItem(`${namespace}:${viewId}`);
        const indexKey = `${namespace}:__index__`;
        const index = JSON.parse(localStorage.getItem(indexKey) || '[]');
        const filtered = index.filter(id => id !== viewId);
        localStorage.setItem(indexKey, JSON.stringify(filtered));
        return true;
      },
      update: async (viewId, updates) => {
        const raw = localStorage.getItem(`${namespace}:${viewId}`);
        if (!raw) return false;
        const view = JSON.parse(raw);
        Object.assign(view, updates);
        localStorage.setItem(`${namespace}:${viewId}`, JSON.stringify(view));
        return true;
      },
    };
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private Check URL hash for shared view state */
  _checkUrlForSharedView() {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash?.slice(1) || '';
    if (!hash.startsWith(SHARE_HASH_PREFIX)) return false;

    try {
      const encoded = hash.slice(SHARE_HASH_PREFIX.length);
      const payload = JSON.parse(this._decompress(encoded));

      if (payload.s) {
        // Restore the state through ViewStateManager
        if (payload.s.grid && this._views._gridAdapter) {
          this._views._gridAdapter.restoreState(payload.s.grid);
        }
        if (payload.s.app) {
          for (const [key, providerState] of Object.entries(payload.s.app)) {
            const provider = this._views._providers.get(key);
            if (provider) {
              try { provider.restore(providerState); } catch (e) { /* silent */ }
            }
          }
        }
      }

      // Clean the hash to avoid re-applying on reload
      if (window.history?.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      this._bus.emit('share:applied-from-url', {
        name: payload.n || '',
        sharedBy: payload.by || 'unknown',
        sharedAt: payload.at || 0,
      });

      return true;
    } catch (e) {
      console.warn('[CtrlK] Failed to apply shared view from URL:', e.message);
      return false;
    }
  }

  /**
   * Compress a string for URL encoding.
   * Uses a simple LZW-inspired compression + base64url.
   * @private
   */
  _compress(str) {
    try {
      // Use TextEncoder for UTF-8 bytes
      const bytes = new TextEncoder().encode(str);
      // Simple run-length + base64url encoding
      // For production, this would use pako/fflate for gzip
      const base64 = this._bytesToBase64Url(bytes);
      return base64;
    } catch (e) {
      // Fallback: raw base64
      return this._utf8ToBase64Url(str);
    }
  }

  /**
   * Decompress a URL-encoded string.
   * @private
   */
  _decompress(encoded) {
    try {
      const bytes = this._base64UrlToBytes(encoded);
      return new TextDecoder().decode(bytes);
    } catch (e) {
      // Fallback
      return this._base64UrlToUtf8(encoded);
    }
  }

  /** @private Convert bytes to base64url (URL-safe base64, no padding) */
  _bytesToBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** @private Convert base64url to bytes */
  _base64UrlToBytes(str) {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /** @private Fallback: UTF-8 string to base64url */
  _utf8ToBase64Url(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** @private Fallback: base64url to UTF-8 string */
  _base64UrlToUtf8(str) {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    return decodeURIComponent(escape(atob(padded)));
  }

  /** @private */
  _generateId() {
    return `sv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** @private */
  _addToRecent(entry) {
    this._recentShares = [entry, ...this._recentShares.filter(r => r.id !== entry.id)].slice(0, 20);
    this._persistRecentShares();
  }

  /** @private */
  _persistRecentShares() {
    try {
      localStorage.setItem(RECENT_SHARES_KEY, JSON.stringify(this._recentShares));
    } catch (e) { /* silent */ }
  }

  /** @private */
  _loadRecentShares() {
    try {
      const raw = localStorage.getItem(RECENT_SHARES_KEY);
      if (raw) this._recentShares = JSON.parse(raw);
    } catch (e) { /* silent */ }
  }
}


  // ═══ ctrlk.js (main) ═══
/**
 * ╔══════════════════════════════════════════════╗
 * ║           C T R L K   v1.0.0                 ║
 * ║  Power-User Runtime for Enterprise Web Apps  ║
 * ╠══════════════════════════════════════════════╣
 * ║  ctrlk.dev · MIT License                    ║
 * ╚══════════════════════════════════════════════╝
 *
 * 19 modules. 142 tests. Zero dependencies.
 * The first IOUX (Integrated Operational UX) for enterprise web apps.
 */

















class CtrlK {
  constructor() {
    this.bus = new EventBus();
    this.commands = new CommandRegistry(this.bus);
    this.keys = new ShortcutEngine(this.bus, this.commands);
    this.palette = new CommandPalette(this.bus, this.commands);
    this.density = new DensityController(this.bus);
    this.views = new ViewStateManager(this.bus);
    this.selection = new SelectionModel(this.bus);
    this.fields = new FieldRegistry(this.bus);
    this.columnNav = new ColumnNavigator(this.bus);
    this.focus = new FocusNavigator(this.bus);
    this.session = new SessionTracker(this.bus);
    this.macro = new MacroEngine(this.bus, this.commands);
    this.history = new HistoryManager(this.bus, this.commands);
    this.share = new ViewShare(this.bus, this.views);
    this._autoDiscovery = new AutoDiscovery(this.commands, this.keys, this.bus);
    this._initialized = false;
    this._version = '1.0.0';
  }

  /**
   * Initialize the runtime.
   * @param {Object} [options]
   * @param {boolean} [options.autoDiscover=true]
   * @param {boolean} [options.palette=true]
   * @param {boolean} [options.density=true]
   * @param {boolean} [options.macros=true]
   * @param {boolean} [options.history=true]
   * @param {boolean} [options.session=true]
   * @param {boolean} [options.debug=false]
   * @param {string} [options.paletteShortcut='Ctrl+K']
   * @param {string} [options.densityCycleShortcut='Ctrl+D']
   */
  init(options = {}) {
    if (this._initialized) { console.warn('[CtrlK] Already initialized'); return this; }
    const {
      autoDiscover = true, palette = true, density = true,
      macros = true, history = true, session = true, debug = false,
      paletteShortcut = 'Ctrl+K', densityCycleShortcut = 'Ctrl+D',
    } = options;

    if (debug) this.bus.setDebug(true);

    // Attach keyboard engine
    this.keys.attach();

    // Register built-in commands
    this._registerBuiltins(options);

    // Palette
    if (palette) { this.palette.inject(); this.keys.bind(paletteShortcut, 'ctrlk.palette'); }

    // Density
    if (density) { this.density.init(); this.keys.bind(densityCycleShortcut, 'ctrlk.density.cycle'); }

    // Views
    this.views.init();

    // Selection
    this.selection.init();

    // Fields
    this.fields.init();

    // Column Nav
    this.columnNav.init();

    // Focus
    this.focus.attach();
    this.focus.discover();

    // Session
    if (session) this.session.init();

    // Macros
    if (macros) this.macro.init();

    // History
    if (history) this.history.init();

    // Share
    this.share.init();

    // Auto-discovery
    if (autoDiscover) this._autoDiscovery.start();

    this._initialized = true;
    this.bus.emit('ctrlk:initialized', { version: this._version, options });
    console.log(`%c⚡ CtrlK v${this._version} %cinitialized %c· Ctrl+K for command palette`, 'color:#e8a44a;font-weight:bold;', 'color:#5a9e6f;', 'color:#5a5f74;');
    return this;
  }

  /**
   * Connect a grid adapter (AG Grid, DevExtreme, Kendo, etc.)
   * Wires it into views, selection, and columnNav automatically.
   * @param {Object} adapter - GridAdapter implementation
   */
  connectGrid(adapter) {
    this.views.setGridAdapter(adapter);
    this.selection.setGridAdapter(adapter);
    this.columnNav.setGridAdapter(adapter);
    this.bus.emit('ctrlk:grid-connected', {});
  }

  destroy() {
    this.keys.detach();
    this.focus.detach();
    this._autoDiscovery.stop();
    this.history.destroy();
    this.bus.off();
    this.commands.clear();
    this._initialized = false;
  }

  on(event, handler) { return this.bus.on(event, handler); }
  get version() { return this._version; }

  _registerBuiltins(opts) {
    this.commands.register({ id: 'ctrlk.palette', title: 'Command Palette', category: 'CtrlK', icon: '🔍', shortcut: opts.paletteShortcut || 'Ctrl+K', execute: () => this.palette.toggle() });
    this.commands.register({ id: 'ctrlk.density.cycle', title: 'Cycle Density', category: 'CtrlK', icon: '📐', shortcut: opts.densityCycleShortcut || 'Ctrl+D', execute: () => this.density.cycle() });
    this.commands.register({ id: 'ctrlk.density.compact', title: 'Density: Compact', category: 'CtrlK', icon: '▪', execute: () => this.density.set('compact') });
    this.commands.register({ id: 'ctrlk.density.comfortable', title: 'Density: Comfortable', category: 'CtrlK', icon: '▫', execute: () => this.density.set('comfortable') });
    this.commands.register({ id: 'ctrlk.density.spacious', title: 'Density: Spacious', category: 'CtrlK', icon: '⬜', execute: () => this.density.set('spacious') });
    this.commands.register({ id: 'ctrlk.shortcuts', title: 'Show Keyboard Shortcuts', category: 'CtrlK', icon: '⌨', shortcut: 'Ctrl+/', execute: () => this._showShortcutOverlay() });
    this.commands.register({ id: 'ctrlk.rescan', title: 'Rescan Page', category: 'CtrlK', icon: '🔄', execute: () => { this._autoDiscovery.rescan(); this.focus.discover(); this.fields.discover(); } });
    this.commands.register({ id: 'ctrlk.debug', title: 'Toggle Debug Mode', category: 'CtrlK', icon: '🐛', execute: () => { const c = this.bus._debug; this.bus.setDebug(!c); console.log(`[CtrlK] Debug: ${!c ? 'ON' : 'OFF'}`); } });
    this.keys.bind('Ctrl+/', 'ctrlk.shortcuts');
  }

  _showShortcutOverlay() {
    const existing = document.getElementById('ctrlk-shortcut-overlay');
    if (existing) { existing.remove(); return; }
    const shortcuts = this.keys.getAll();
    const grouped = new Map();
    for (const s of shortcuts) { if (!grouped.has(s.category)) grouped.set(s.category, []); grouped.get(s.category).push(s); }
    let html = '';
    for (const [cat, items] of grouped) {
      html += `<div style="margin-bottom:16px;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#6b6e82;margin-bottom:6px;">${cat}</div>`;
      for (const item of items) {
        const keys = item.combo.split('+').map(k => `<span style="display:inline-block;padding:2px 6px;font-size:11px;background:#12131a;border:1px solid #2a2b38;border-radius:3px;margin-right:2px;color:#8a8da2;">${k}</span>`).join('');
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;"><span style="color:#c8ccd8;font-size:13px;">${item.title}</span><span>${keys}</span></div>`;
      }
      html += '</div>';
    }
    const overlay = document.createElement('div'); overlay.id = 'ctrlk-shortcut-overlay';
    overlay.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:340px;background:#1a1b23;border-left:1px solid #2a2b38;z-index:99997;overflow-y:auto;padding:20px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;box-shadow:-10px 0 40px rgba(0,0,0,.4);animation:ctrlk-slide .2s ease;';
    const style = document.createElement('style'); style.textContent = '@keyframes ctrlk-slide{from{transform:translateX(100%)}to{transform:translateX(0)}}';
    overlay.appendChild(style);
    overlay.innerHTML += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><span style="font-size:16px;color:#e8eaf0;">Keyboard Shortcuts</span><button onclick="this.closest('#ctrlk-shortcut-overlay').remove()" style="background:none;border:1px solid #2a2b38;color:#6b6e82;padding:4px 8px;cursor:pointer;border-radius:3px;font-size:11px;">ESC</button></div>${html}`;
    document.body.appendChild(overlay);
    const close = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', close); } };
    document.addEventListener('keydown', close);
  }
}

const ctrlk = new CtrlK();


  ctrlk, CtrlK,
  EventBus, CommandRegistry, ShortcutEngine, CommandPalette, DensityController, AutoDiscovery,
  ViewStateManager, SelectionModel, FieldRegistry,
  ColumnNavigator, FocusNavigator, SessionTracker,
  MacroEngine, HistoryManager, ViewShare,
};



  // ═══ Global Export + Auto-Init ═══
  global.ctrlk = ctrlk;
  global.CtrlK = CtrlK;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { ctrlk.init(); });
  } else {
    ctrlk.init();
  }

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
