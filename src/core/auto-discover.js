/**
 * CtrlK Auto-Discovery — Pattern A drop-in.
 * Scans DOM for interactive elements, registers them as commands.
 * Uses MutationObserver for dynamic content.
 * @module @ctrlk/core/auto-discover
 */
export class AutoDiscovery {
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
