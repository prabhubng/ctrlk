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

export class ColumnNavigator {
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
