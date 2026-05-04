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
export class GridAdapter {
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
