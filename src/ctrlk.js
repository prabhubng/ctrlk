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

import { EventBus } from './core/event-bus.js';
import { CommandRegistry } from './core/command-registry.js';
import { ShortcutEngine } from './keys/shortcut-engine.js';
import { CommandPalette } from './palette/command-palette.js';
import { DensityController } from './density/density-controller.js';
import { AutoDiscovery } from './core/auto-discover.js';
import { ViewStateManager } from './views/view-state-manager.js';
import { SelectionModel } from './selection/selection-model.js';
import { FieldRegistry } from './fields/field-registry.js';
import { ColumnNavigator } from './column-nav/column-navigator.js';
import { FocusNavigator } from './focus/focus-navigator.js';
import { SessionTracker } from './session/session-tracker.js';
import { MacroEngine } from './macro/macro-engine.js';
import { HistoryManager } from './history/history-manager.js';
import { ViewShare } from './share/view-share.js';

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

export {
  ctrlk, CtrlK,
  EventBus, CommandRegistry, ShortcutEngine, CommandPalette, DensityController, AutoDiscovery,
  ViewStateManager, SelectionModel, FieldRegistry,
  ColumnNavigator, FocusNavigator, SessionTracker,
  MacroEngine, HistoryManager, ViewShare,
};
export default ctrlk;
