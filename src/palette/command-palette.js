/**
 * CtrlK Command Palette — Ctrl+K searchable command UI.
 * Self-contained: injects its own DOM and styles.
 * @module @ctrlk/palette
 */
const PALETTE_CSS = `.ctrlk-po{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99998;opacity:0;transition:opacity .15s;backdrop-filter:blur(2px)}.ctrlk-po.ctrlk-v{opacity:1}.ctrlk-p{position:fixed;top:20%;left:50%;transform:translateX(-50%) scale(.96);width:min(560px,90vw);max-height:420px;background:#1a1b23;border:1px solid #2a2b38;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5);z-index:99999;display:flex;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;opacity:0;transition:opacity .15s,transform .15s}.ctrlk-p.ctrlk-v{opacity:1;transform:translateX(-50%) scale(1)}.ctrlk-pi-w{display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid #2a2b38;gap:10px}.ctrlk-pi{flex:1;background:0;border:0;outline:0;color:#e8eaf0;font-size:15px;font-family:inherit;caret-color:#e8a44a}.ctrlk-pi::placeholder{color:#4a4d62}.ctrlk-pr{flex:1;overflow-y:auto;padding:6px 0;scrollbar-width:thin;scrollbar-color:#2a2b38 transparent}.ctrlk-pc{padding:8px 16px 4px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#4a4d62}.ctrlk-px{display:flex;align-items:center;padding:8px 16px;cursor:pointer;gap:10px;transition:background .1s}.ctrlk-px:hover,.ctrlk-px.ctrlk-s{background:#25263a}.ctrlk-px-i{width:20px;text-align:center;font-size:14px;flex-shrink:0}.ctrlk-px-b{flex:1;min-width:0}.ctrlk-px-t{font-size:13px;color:#c8ccd8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ctrlk-px-d{font-size:11px;color:#4a4d62}.ctrlk-px-k{flex-shrink:0;display:flex;gap:3px}.ctrlk-kbd{display:inline-block;padding:2px 6px;font-size:10px;font-family:'SF Mono',Consolas,monospace;color:#8a8da2;background:#12131a;border:1px solid #2a2b38;border-radius:3px}.ctrlk-pe{padding:20px 16px;text-align:center;color:#4a4d62;font-size:13px}.ctrlk-pf{display:flex;align-items:center;gap:12px;padding:8px 16px;border-top:1px solid #2a2b38;font-size:10px;color:#4a4d62}.ctrlk-pf kbd{padding:1px 5px;font-size:10px;color:#6b6e82;background:#12131a;border:1px solid #2a2b38;border-radius:2px}.ctrlk-ci{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a1b23;border:1px solid #e8a44a40;border-radius:6px;padding:8px 16px;font-family:monospace;font-size:13px;color:#e8a44a;z-index:99997;opacity:0;transition:opacity .15s;pointer-events:none}.ctrlk-ci.ctrlk-v{opacity:1}`;

export class CommandPalette {
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
