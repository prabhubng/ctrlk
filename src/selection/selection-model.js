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

export class SelectionModel {
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
