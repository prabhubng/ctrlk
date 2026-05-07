/**
 * CtrlK v2.0.0 — Headless IOUX Engine
 * Zero DOM. Zero styles. Pure event-driven.
 * ctrlk.dev · MIT License · Prabhu Raja
 *
 * When Ctrl+K fires, this emits 'palette:requested'.
 * YOUR app shows YOUR palette component.
 *
 * @module @ctrlk/core
 * @author Prabhu Raja
 */

import { EventBus } from './core/event-bus.js';
import { CommandRegistry } from './core/command-registry.js';
import { ShortcutEngine } from './keys/shortcut-engine.js';
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
    this._version = '2.0.0';
  }

  init(options = {}) {
    if (this._initialized) { console.warn('[CtrlK] Already initialized'); return this; }
    const {
      autoDiscover = true, palette = true, density = true,
      macros = true, history = true, session = true, debug = false,
      paletteShortcut = 'Ctrl+K',
      densityCycleShortcut = 'Ctrl+D',
      fieldJumpShortcut = 'Ctrl+G',
    } = options;

    if (debug) this.bus.setDebug(true);
    this.keys.attach();
    this._registerBuiltins({ paletteShortcut, densityCycleShortcut, fieldJumpShortcut });

    if (palette) this.keys.bind(paletteShortcut, 'ctrlk.palette');
    if (density) { this.density.init(); this.keys.bind(densityCycleShortcut, 'ctrlk.density.cycle'); }
    this.keys.bind(fieldJumpShortcut, 'ctrlk.field-jump');
    this.keys.bind('Ctrl+/', 'ctrlk.shortcuts');

    this.views.init();
    this.selection.init();
    this.fields.init();
    this.columnNav.init();
    this.focus.attach();
    this.focus.discover();
    if (session) this.session.init();
    if (macros) this.macro.init();
    if (history) this.history.init();
    this.share.init();
    if (autoDiscover) this._autoDiscovery.start();

    this._initialized = true;
    this.bus.emit('ctrlk:initialized', { version: this._version, options });
    return this;
  }

  /** Connect a grid adapter. Wires into views, selection, columns. */
  connectGrid(adapter) {
    this.views.setGridAdapter(adapter);
    if (this.selection.setGridAdapter) this.selection.setGridAdapter(adapter);
    if (this.columnNav.setGridAdapter) this.columnNav.setGridAdapter(adapter);
    this.bus.emit('ctrlk:grid-connected', { adapter });
  }

  // Event hooks — convenience API. Each returns unsubscribe function.
  onPaletteRequest(callback) { return this.bus.on('palette:requested', callback); }
  onFieldJumpRequest(callback) { return this.bus.on('field-jump:requested', callback); }
  onShortcutsRequest(callback) { return this.bus.on('shortcuts:requested', callback); }
  onDensityChange(callback) { return this.bus.on('density:changed', callback); }
  onViewSaved(callback) { return this.bus.on('view:saved', callback); }
  onViewLoaded(callback) { return this.bus.on('view:loaded', callback); }
  onCommandExecuted(callback) { return this.bus.on('command:executed', callback); }
  on(event, handler) { return this.bus.on(event, handler); }

  destroy() {
    this.keys.detach();
    this.focus.detach();
    this._autoDiscovery.stop();
    this.history.destroy();
    this.bus.off();
    this.commands.clear();
    this._initialized = false;
  }

  get version() { return this._version; }

  _registerBuiltins({ paletteShortcut, densityCycleShortcut, fieldJumpShortcut }) {
    // Palette — emits event, no DOM
    this.commands.register({
      id: 'ctrlk.palette', title: 'Command Palette', category: 'CtrlK',
      shortcut: paletteShortcut,
      execute: () => {
        this.bus.emit('palette:requested', {
          commands: this.commands.list(),
          search: (q) => this.commands.search(q),
          execute: (id) => this.commands.execute(id),
        });
      },
    });

    // Field jump — emits event, no DOM
    this.commands.register({
      id: 'ctrlk.field-jump', title: 'Jump to Field', category: 'CtrlK',
      shortcut: fieldJumpShortcut,
      execute: () => {
        this.bus.emit('field-jump:requested', {
          fields: this.fields.list ? this.fields.list() : [],
          search: (q, opts) => this.fields.search ? this.fields.search(q, opts) : [],
          focus: (id) => this.fields.focus ? this.fields.focus(id) : null,
        });
      },
    });

    // Shortcuts — emits event, no DOM
    this.commands.register({
      id: 'ctrlk.shortcuts', title: 'Keyboard Shortcuts', category: 'CtrlK',
      shortcut: 'Ctrl+/',
      execute: () => {
        this.bus.emit('shortcuts:requested', {
          shortcuts: this.keys.getAll ? this.keys.getAll() : [],
        });
      },
    });

    // Density — works directly via CSS vars, no UI
    this.commands.register({ id: 'ctrlk.density.cycle', title: 'Cycle Density', category: 'CtrlK', shortcut: densityCycleShortcut, execute: () => this.density.cycle() });
    this.commands.register({ id: 'ctrlk.density.compact', title: 'Density: Compact', category: 'CtrlK', execute: () => this.density.set('compact') });
    this.commands.register({ id: 'ctrlk.density.comfortable', title: 'Density: Comfortable', category: 'CtrlK', execute: () => this.density.set('comfortable') });
    this.commands.register({ id: 'ctrlk.density.spacious', title: 'Density: Spacious', category: 'CtrlK', execute: () => this.density.set('spacious') });
    this.commands.register({ id: 'ctrlk.rescan', title: 'Rescan Page', category: 'CtrlK', execute: () => { this._autoDiscovery.rescan(); this.focus.discover(); if (this.fields.discover) this.fields.discover(); } });
    this.commands.register({ id: 'ctrlk.debug', title: 'Toggle Debug', category: 'CtrlK', execute: () => { const d = this.bus._debug; this.bus.setDebug(!d); } });
  }
}

const ctrlk = new CtrlK();

export {
  ctrlk, CtrlK,
  EventBus, CommandRegistry, ShortcutEngine, DensityController, AutoDiscovery,
  ViewStateManager, SelectionModel, FieldRegistry,
  ColumnNavigator, FocusNavigator, SessionTracker,
  MacroEngine, HistoryManager, ViewShare,
};
export default ctrlk;
