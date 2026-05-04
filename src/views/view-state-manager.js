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
 * @author Neural Weaves Pvt Ltd
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

export class ViewStateManager {
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
