/**
 * CtrlK DevExtreme DataGrid Adapter
 * ──────────────────────────────────────────────
 * Bridges ctrlk to DevExtreme DataGrid.
 * 
 * Handles DevExtreme's column options API, built-in state()
 * serialization, virtual scrolling, and master-detail grids.
 * 
 * Usage:
 *   import { DevExtremeAdapter } from '@ctrlk/devextreme';
 *   
 *   const grid = new DevExpress.ui.dxDataGrid(el, { ... });
 *   const adapter = new DevExtremeAdapter(grid, {
 *     keyExpr: 'id',           // default: 'id'
 *   });
 *   
 *   ctrlk.views.setGridAdapter(adapter);
 *   ctrlk.selection.setGridAdapter(adapter);
 * 
 * Supports DevExtreme v21+ (tested on v23.2).
 * 
 * @module @ctrlk/devextreme
 * @author Prabhu Raja
 */

export class DevExtremeAdapter {
  /**
   * @param {Object} grid - DevExtreme dxDataGrid instance
   * @param {Object} [options]
   * @param {string} [options.keyExpr='id'] - Key field for row identification
   * @param {string[]} [options.customStateKeys] - Additional state keys to capture
   */
  constructor(grid, options = {}) {
    if (!grid) throw new Error('[CtrlK/DevExtreme] dxDataGrid instance is required');

    this._grid = grid;
    this._keyExpr = options.keyExpr || 'id';
    this._customStateKeys = options.customStateKeys || [];
    this._eventCleanups = [];

    // Cache column definitions for search
    this._columnDefs = null;
  }

  // ═══════════════════════════════════════════
  // STATE — Capture & Restore
  // ═══════════════════════════════════════════

  /**
   * Capture the full grid state.
   * DevExtreme's state() method captures columns, filters, sort,
   * grouping, paging, and focused row — all in one call.
   */
  captureState() {
    try {
      const dxState = this._grid.state();
      return {
        dxState,                                    // DevExtreme's native state blob
        columns: this._captureColumnMeta(),         // Additional column metadata
        filters: this._captureFilterState(),        // Normalized filter format
        sort: this._captureSortState(),             // Normalized sort format
        scrollTop: this._getScrollTop(),
        scrollLeft: this._getScrollLeft(),
        selectedRowIds: this.getSelectedRowIds(),
        custom: {},
      };
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] captureState failed:', err.message);
      return { dxState: null, columns: [], filters: [], sort: [], selectedRowIds: [], custom: {} };
    }
  }

  /**
   * Restore a previously captured state.
   * Uses DevExtreme's state() for the heavy lifting, then
   * restores selection and scroll separately (state() doesn't capture these).
   */
  restoreState(state) {
    if (!state) return;

    try {
      // DevExtreme's state() restores columns, filters, sort, grouping, paging
      if (state.dxState) {
        this._grid.state(state.dxState);
      } else {
        // Fallback: restore from normalized format
        if (state.columns) this._restoreColumnMeta(state.columns);
        if (state.filters) this._restoreFilterState(state.filters);
        if (state.sort) this._restoreSortState(state.sort);
      }

      // Restore selection (not captured by state())
      if (state.selectedRowIds?.length) {
        setTimeout(() => {
          this.setSelectedRowIds(state.selectedRowIds);
        }, 100);
      }

      // Restore scroll position
      if (state.scrollTop || state.scrollLeft) {
        setTimeout(() => {
          this._setScrollPosition(state.scrollTop || 0, state.scrollLeft || 0);
        }, 200);
      }
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] restoreState failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════
  // COLUMNS
  // ═══════════════════════════════════════════

  /**
   * Get all columns with metadata.
   * @returns {Array<{colId, headerName, visible, width, order, pinned, sort, sortIndex}>}
   */
  getColumns() {
    try {
      const count = this._grid.columnCount();
      const cols = [];
      for (let i = 0; i < count; i++) {
        const field = this._grid.columnOption(i, 'dataField');
        if (!field) continue; // Skip command columns, band columns without dataField
        cols.push({
          colId: field,
          headerName: this._grid.columnOption(i, 'caption') || field,
          visible: this._grid.columnOption(i, 'visible') !== false,
          width: this._grid.columnOption(i, 'width') || this._grid.columnOption(i, 'visibleWidth') || 100,
          order: this._grid.columnOption(i, 'visibleIndex') ?? i,
          pinned: this._grid.columnOption(i, 'fixed') || false,
          pinnedSide: this._grid.columnOption(i, 'fixedPosition') || null,
          sort: this._grid.columnOption(i, 'sortOrder') || null,
          sortIndex: this._grid.columnOption(i, 'sortIndex') ?? null,
          dataType: this._grid.columnOption(i, 'dataType') || 'string',
          allowFiltering: this._grid.columnOption(i, 'allowFiltering') !== false,
          allowSorting: this._grid.columnOption(i, 'allowSorting') !== false,
        });
      }
      this._columnDefs = cols;
      return cols;
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] getColumns failed:', err.message);
      return this._columnDefs || [];
    }
  }

  /**
   * Get only visible columns.
   */
  getVisibleColumns() {
    return this.getColumns().filter(c => c.visible);
  }

  /**
   * Set visibility for multiple columns.
   * @param {Object} visibility - { fieldName: boolean }
   */
  setColumnVisibility(visibility) {
    try {
      this._grid.beginUpdate();
      for (const [field, visible] of Object.entries(visibility)) {
        this._grid.columnOption(field, 'visible', visible);
      }
      this._grid.endUpdate();
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] setColumnVisibility failed:', err.message);
    }
  }

  /**
   * Set column order.
   * @param {string[]} colIds - Array of field names in desired order
   */
  setColumnOrder(colIds) {
    try {
      this._grid.beginUpdate();
      colIds.forEach((field, idx) => {
        this._grid.columnOption(field, 'visibleIndex', idx);
      });
      this._grid.endUpdate();
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] setColumnOrder failed:', err.message);
    }
  }

  /**
   * Scroll the grid to make a column visible.
   * @param {string} colId - Field name
   */
  ensureColumnVisible(colId) {
    try {
      const visibleIndex = this._grid.getVisibleColumnIndex(colId);
      if (visibleIndex < 0) return;
      const scrollable = this._grid.getScrollable();
      if (!scrollable) return;

      // Find the column header element and scroll to it
      const headerRow = this._grid.element()?.querySelector('.dx-header-row');
      if (headerRow) {
        const cells = headerRow.querySelectorAll('td');
        if (cells[visibleIndex]) {
          scrollable.scrollToElement(cells[visibleIndex]);
        }
      }
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] ensureColumnVisible failed:', err.message);
    }
  }

  /**
   * Search columns by name or field.
   * @param {string} query
   * @returns {Array}
   */
  searchColumns(query) {
    const q = query.toLowerCase();
    return this.getColumns().filter(c =>
      c.headerName.toLowerCase().includes(q) ||
      c.colId.toLowerCase().includes(q)
    );
  }

  /**
   * Flash-highlight cells in a column (visual feedback for column jump).
   * DevExtreme doesn't have a native flashCells — we use CSS animation.
   * @param {Object} options - { columns: [colId] }
   */
  flashCells(options = {}) {
    const columns = options.columns || [];
    try {
      for (const colId of columns) {
        const visibleIndex = this._grid.getVisibleColumnIndex(colId);
        if (visibleIndex < 0) continue;
        const gridEl = this._grid.element();
        if (!gridEl) continue;

        // Highlight header
        const headerCells = gridEl.querySelectorAll(`.dx-header-row td`);
        if (headerCells[visibleIndex]) {
          this._flashElement(headerCells[visibleIndex]);
        }

        // Highlight data cells in that column
        const rows = gridEl.querySelectorAll('.dx-data-row');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells[visibleIndex]) {
            this._flashElement(cells[visibleIndex]);
          }
        });
      }
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] flashCells failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════
  // ROWS
  // ═══════════════════════════════════════════

  /**
   * Get row data.
   * @param {Object} [options]
   * @param {boolean} [options.filtered=true] - Return only filtered/visible rows
   */
  getRows(options = {}) {
    try {
      const { filtered = true } = options;
      if (filtered) {
        const visibleRows = this._grid.getVisibleRows();
        return visibleRows
          .filter(r => r.rowType === 'data')
          .map(r => r.data);
      } else {
        const ds = this._grid.getDataSource();
        return ds?.items?.() || [];
      }
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] getRows failed:', err.message);
      return [];
    }
  }

  /**
   * Get displayed row count.
   */
  getRowCount() {
    try {
      return this._grid.totalCount?.() || this._grid.getVisibleRows()?.length || 0;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Get selected row keys.
   */
  getSelectedRowIds() {
    try {
      const keys = this._grid.getSelectedRowKeys();
      return keys.map(String);
    } catch (e) {
      return [];
    }
  }

  /**
   * Set selected rows by key.
   * @param {Array} rowIds - Array of row key values
   * @param {Object} [options]
   * @param {boolean} [options.additive=false] - Add to existing selection
   */
  setSelectedRowIds(rowIds, options = {}) {
    const { additive = false } = options;
    try {
      if (!additive) {
        this._grid.clearSelection();
      }
      // DevExtreme selectRows expects typed keys matching keyExpr type
      this._grid.selectRows(rowIds, additive);
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] setSelectedRowIds failed:', err.message);
    }
  }

  /**
   * Clear all selection.
   */
  clearSelection() {
    try {
      this._grid.clearSelection();
    } catch (e) { /* silent */ }
  }

  /**
   * Scroll to make a specific row visible.
   * @param {*} rowId - Row key value
   */
  ensureRowVisible(rowId) {
    try {
      const rowIndex = this._grid.getRowIndexByKey(rowId);
      if (rowIndex >= 0) {
        this._grid.getScrollable()?.scrollToElement(
          this._grid.getRowElement(rowIndex)?.[0]
        );
      }
    } catch (e) { /* silent */ }
  }

  /**
   * Get the key expression field name.
   */
  getRowIdField() {
    return this._keyExpr;
  }

  // ═══════════════════════════════════════════
  // CELLS
  // ═══════════════════════════════════════════

  /**
   * Get the currently focused cell.
   */
  getFocusedCell() {
    try {
      // DevExtreme doesn't have a direct getFocusedCell — check the DOM
      const focused = this._grid.element()?.querySelector('.dx-focused');
      if (!focused) return null;
      const rowIndex = focused.closest('.dx-data-row')?.getAttribute('aria-rowindex');
      return { rowIndex: rowIndex ? parseInt(rowIndex) : null };
    } catch (e) {
      return null;
    }
  }

  /**
   * Focus a specific cell.
   * @param {*} rowId - Row key
   * @param {string} colId - Field name
   */
  focusCell(rowId, colId) {
    try {
      const rowIndex = this._grid.getRowIndexByKey(rowId);
      const colIndex = this._grid.getVisibleColumnIndex(colId);
      if (rowIndex >= 0 && colIndex >= 0) {
        this._grid.focus(this._grid.getCellElement(rowIndex, colIndex));
      }
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] focusCell failed:', err.message);
    }
  }

  /**
   * Start editing a cell.
   * @param {*} rowId - Row key
   * @param {string} colId - Field name
   */
  startCellEditing(rowId, colId) {
    try {
      const rowIndex = this._grid.getRowIndexByKey(rowId);
      if (rowIndex >= 0) {
        this._grid.editCell(rowIndex, colId);
      }
    } catch (e) { /* silent */ }
  }

  /**
   * Stop editing.
   * @param {boolean} cancel - If true, discard changes
   */
  stopCellEditing(cancel = false) {
    try {
      if (cancel) {
        this._grid.cancelEditData();
      } else {
        this._grid.saveEditData();
      }
    } catch (e) { /* silent */ }
  }

  /**
   * Get a cell value.
   * @param {*} rowId - Row key
   * @param {string} colId - Field name
   */
  getCellValue(rowId, colId) {
    try {
      const rowIndex = this._grid.getRowIndexByKey(rowId);
      if (rowIndex >= 0) {
        return this._grid.cellValue(rowIndex, colId);
      }
      return undefined;
    } catch (e) {
      return undefined;
    }
  }

  /**
   * Set a cell value.
   * @param {*} rowId - Row key
   * @param {string} colId - Field name
   * @param {*} value - New value
   */
  setCellValue(rowId, colId, value) {
    try {
      const rowIndex = this._grid.getRowIndexByKey(rowId);
      if (rowIndex >= 0) {
        this._grid.cellValue(rowIndex, colId, value);
        this._grid.saveEditData();
      }
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] setCellValue failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════
  // FILTERS
  // ═══════════════════════════════════════════

  /**
   * Get active filters in normalized format.
   * @returns {Array<{colId, type, value, operator}>}
   */
  getFilters() {
    try {
      const filter = this._grid.getCombinedFilter?.(true) || this._grid.filter();
      if (!filter) return [];

      // DevExtreme filters can be arrays or complex expressions
      // Simple filter: ['field', '=', 'value']
      // Combined: [['field1','=','v1'],'and',['field2','=','v2']]
      return this._parseFilterExpression(filter);
    } catch (e) {
      return [];
    }
  }

  /**
   * Set filters.
   * @param {Array} filters - Array of { colId, operator, value }
   */
  setFilters(filters) {
    try {
      if (!filters?.length) {
        this._grid.clearFilter();
        return;
      }

      // Build DevExtreme filter expression
      const expressions = filters.map(f => [f.colId, f.operator || '=', f.value]);
      if (expressions.length === 1) {
        this._grid.filter(expressions[0]);
      } else {
        // AND all filters together
        const combined = [];
        expressions.forEach((expr, i) => {
          combined.push(expr);
          if (i < expressions.length - 1) combined.push('and');
        });
        this._grid.filter(combined);
      }
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] setFilters failed:', err.message);
    }
  }

  /**
   * Clear all filters.
   */
  clearFilters() {
    try {
      this._grid.clearFilter();
    } catch (e) { /* silent */ }
  }

  // ═══════════════════════════════════════════
  // SORT
  // ═══════════════════════════════════════════

  /**
   * Get the current sort model.
   * @returns {Array<{colId, sort}>}
   */
  getSortModel() {
    try {
      const cols = this.getColumns();
      return cols
        .filter(c => c.sort)
        .sort((a, b) => (a.sortIndex ?? 99) - (b.sortIndex ?? 99))
        .map(c => ({ colId: c.colId, sort: c.sort }));
    } catch (e) {
      return [];
    }
  }

  /**
   * Set the sort model.
   * @param {Array<{colId, sort}>} sortModel
   */
  setSortModel(sortModel) {
    try {
      this._grid.beginUpdate();
      // Clear existing sort
      this._grid.clearSorting();
      // Apply new sort
      sortModel.forEach((s, idx) => {
        this._grid.columnOption(s.colId, 'sortOrder', s.sort);
        this._grid.columnOption(s.colId, 'sortIndex', idx);
      });
      this._grid.endUpdate();
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] setSortModel failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════
  // SCROLL
  // ═══════════════════════════════════════════

  /**
   * Get current scroll position.
   */
  getScrollPosition() {
    try {
      const scrollable = this._grid.getScrollable();
      if (!scrollable) return { top: 0, left: 0 };
      const offset = scrollable.scrollOffset();
      return { top: offset?.top || 0, left: offset?.left || 0 };
    } catch (e) {
      return { top: 0, left: 0 };
    }
  }

  /**
   * Set scroll position.
   */
  setScrollPosition(position) {
    this._setScrollPosition(position.top || 0, position.left || 0);
  }

  // ═══════════════════════════════════════════
  // DENSITY
  // ═══════════════════════════════════════════

  /**
   * Set the grid density by adjusting row padding and font size.
   * @param {string} level - 'compact', 'comfortable', or 'spacious'
   */
  setDensity(level) {
    const config = {
      compact:     { padding: '2px 7px',  fontSize: '12px' },
      comfortable: { padding: '5px 7px',  fontSize: '13px' },
      spacious:    { padding: '10px 12px', fontSize: '14px' },
    };
    const cfg = config[level] || config.comfortable;

    try {
      const el = this._grid.element();
      if (!el) return;
      // DevExtreme doesn't have a row height API — apply via CSS
      const cells = el.querySelectorAll('.dx-data-row td, .dx-header-row td');
      cells.forEach(td => {
        td.style.padding = cfg.padding;
        td.style.fontSize = cfg.fontSize;
      });

      // Also style the filter row if visible
      const filterCells = el.querySelectorAll('.dx-datagrid-filter-row td');
      filterCells.forEach(td => {
        td.style.padding = cfg.padding;
      });
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] setDensity failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════
  // EVENTS
  // ═══════════════════════════════════════════

  /**
   * Subscribe to a grid event.
   * @param {string} event - Normalized event name
   * @param {Function} handler
   * @returns {Function} Cleanup function
   */
  onGridEvent(event, handler) {
    const eventMap = {
      'selectionChanged':  'selectionChanged',
      'filterChanged':     'optionChanged',
      'sortChanged':       'optionChanged',
      'cellFocused':       'focusedCellChanged',
      'cellEditStarted':   'editingStart',
      'cellEditStopped':   'editCanceled',
      'columnMoved':       'optionChanged',
      'columnResized':     'optionChanged',
      'columnVisible':     'optionChanged',
      'contentReady':      'contentReady',
      'rowClick':          'rowClick',
      'cellClick':         'cellClick',
    };

    const dxEvent = eventMap[event] || event;
    try {
      // DevExtreme uses on/off for event handling
      const wrappedHandler = (e) => {
        // For optionChanged, filter to relevant changes
        if (dxEvent === 'optionChanged') {
          const relevantPrefixes = {
            'filterChanged': 'columns[',
            'sortChanged': 'columns[',
            'columnMoved': 'columns[',
            'columnResized': 'columns[',
            'columnVisible': 'columns[',
          };
          const prefix = relevantPrefixes[event];
          if (prefix && !e.fullName?.startsWith(prefix)) return;
        }
        handler(e);
      };

      this._grid.on(dxEvent, wrappedHandler);
      const cleanup = () => {
        try { this._grid.off(dxEvent, wrappedHandler); } catch (e) { /* silent */ }
      };
      this._eventCleanups.push(cleanup);
      return cleanup;
    } catch (e) {
      return () => {};
    }
  }

  // ═══════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════

  /**
   * Export grid data.
   * @param {string} format - 'csv', 'json', or 'xlsx'
   */
  exportData(format = 'csv') {
    try {
      if (format === 'xlsx') {
        // DevExtreme's native Excel export (requires exceljs)
        this._grid.exportToExcel?.(false);
        return '';
      }
      // CSV or JSON
      const rows = this.getRows({ filtered: true });
      if (format === 'csv') {
        if (!rows.length) return '';
        const cols = this.getVisibleColumns();
        const header = cols.map(c => c.headerName).join(',');
        const body = rows.map(r => cols.map(c => {
          const val = r[c.colId];
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        }).join(',')).join('\n');
        return header + '\n' + body;
      }
      return JSON.stringify(rows, null, 2);
    } catch (e) {
      return '';
    }
  }

  // ═══════════════════════════════════════════
  // GROUPING (DevExtreme-specific)
  // ═══════════════════════════════════════════

  /**
   * Get grouping state.
   * @returns {Array<{colId, groupIndex}>}
   */
  getGrouping() {
    try {
      return this.getColumns()
        .filter(c => this._grid.columnOption(c.colId, 'groupIndex') !== undefined &&
                     this._grid.columnOption(c.colId, 'groupIndex') >= 0)
        .map(c => ({
          colId: c.colId,
          groupIndex: this._grid.columnOption(c.colId, 'groupIndex'),
        }))
        .sort((a, b) => a.groupIndex - b.groupIndex);
    } catch (e) {
      return [];
    }
  }

  /**
   * Set grouping.
   * @param {string[]} colIds - Columns to group by (in order)
   */
  setGrouping(colIds) {
    try {
      this._grid.beginUpdate();
      // Clear existing grouping
      this.getColumns().forEach(c => {
        this._grid.columnOption(c.colId, 'groupIndex', undefined);
      });
      // Apply new grouping
      colIds.forEach((colId, idx) => {
        this._grid.columnOption(colId, 'groupIndex', idx);
      });
      this._grid.endUpdate();
    } catch (err) {
      console.warn('[CtrlK/DevExtreme] setGrouping failed:', err.message);
    }
  }

  /**
   * Expand or collapse all groups.
   * @param {boolean} expand
   */
  expandAllGroups(expand = true) {
    try {
      if (expand) {
        this._grid.expandAll?.(-1);
      } else {
        this._grid.collapseAll?.(-1);
      }
    } catch (e) { /* silent */ }
  }

  // ═══════════════════════════════════════════
  // SUMMARY (DevExtreme-specific)
  // ═══════════════════════════════════════════

  /**
   * Get total summary values.
   * @returns {Array<{column, summaryType, value}>}
   */
  getTotalSummary() {
    try {
      const items = this._grid.getTotalSummaryValue?.() || [];
      return items;
    } catch (e) {
      return [];
    }
  }

  // ═══════════════════════════════════════════
  // MASTER-DETAIL (DevExtreme-specific)
  // ═══════════════════════════════════════════

  /**
   * Expand a master row to show its detail.
   * @param {*} rowKey
   */
  expandDetail(rowKey) {
    try {
      this._grid.expandRow?.(rowKey);
    } catch (e) { /* silent */ }
  }

  /**
   * Collapse a master row detail.
   * @param {*} rowKey
   */
  collapseDetail(rowKey) {
    try {
      this._grid.collapseRow?.(rowKey);
    } catch (e) { /* silent */ }
  }

  /**
   * Check if a row's detail is expanded.
   * @param {*} rowKey
   * @returns {boolean}
   */
  isDetailExpanded(rowKey) {
    try {
      return this._grid.isRowExpanded?.(rowKey) || false;
    } catch (e) {
      return false;
    }
  }

  // ═══════════════════════════════════════════
  // BATCH EDITING (DevExtreme-specific)
  // ═══════════════════════════════════════════

  /**
   * Check if there are unsaved batch edits.
   * @returns {boolean}
   */
  hasChanges() {
    try {
      return this._grid.hasEditData?.() || false;
    } catch (e) {
      return false;
    }
  }

  /**
   * Save all pending batch edits.
   */
  saveChanges() {
    try {
      this._grid.saveEditData?.();
    } catch (e) { /* silent */ }
  }

  /**
   * Discard all pending batch edits.
   */
  cancelChanges() {
    try {
      this._grid.cancelEditData?.();
    } catch (e) { /* silent */ }
  }

  // ═══════════════════════════════════════════
  // DESTROY
  // ═══════════════════════════════════════════

  /**
   * Clean up event listeners and references.
   */
  destroy() {
    for (const cleanup of this._eventCleanups) {
      try { cleanup(); } catch (e) { /* silent */ }
    }
    this._eventCleanups = [];
    this._grid = null;
    this._columnDefs = null;
  }

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  /** @private Capture column metadata for serialization */
  _captureColumnMeta() {
    return this.getColumns().map(c => ({
      colId: c.colId,
      visible: c.visible,
      width: c.width,
      order: c.order,
      pinned: c.pinned,
      sort: c.sort,
      sortIndex: c.sortIndex,
    }));
  }

  /** @private Restore column metadata */
  _restoreColumnMeta(columns) {
    try {
      this._grid.beginUpdate();
      for (const col of columns) {
        this._grid.columnOption(col.colId, 'visible', col.visible);
        if (col.width) this._grid.columnOption(col.colId, 'width', col.width);
        if (col.sort) this._grid.columnOption(col.colId, 'sortOrder', col.sort);
      }
      this._grid.endUpdate();
    } catch (e) {
      console.warn('[CtrlK/DevExtreme] _restoreColumnMeta failed:', e.message);
    }
  }

  /** @private Capture filter state */
  _captureFilterState() {
    return this.getFilters();
  }

  /** @private Restore filter state */
  _restoreFilterState(filters) {
    this.setFilters(filters);
  }

  /** @private Capture sort state */
  _captureSortState() {
    return this.getSortModel();
  }

  /** @private Restore sort state */
  _restoreSortState(sort) {
    this.setSortModel(sort);
  }

  /** @private Get scroll top */
  _getScrollTop() {
    try {
      return this._grid.getScrollable()?.scrollOffset()?.top || 0;
    } catch (e) { return 0; }
  }

  /** @private Get scroll left */
  _getScrollLeft() {
    try {
      return this._grid.getScrollable()?.scrollOffset()?.left || 0;
    } catch (e) { return 0; }
  }

  /** @private Set scroll position */
  _setScrollPosition(top, left) {
    try {
      const scrollable = this._grid.getScrollable();
      if (scrollable) {
        scrollable.scrollTo({ top, left });
      }
    } catch (e) { /* silent */ }
  }

  /** @private Flash-highlight a DOM element */
  _flashElement(el) {
    if (!el) return;
    const orig = el.style.background;
    el.style.transition = 'background 0.3s';
    el.style.background = '#eef2ff';
    setTimeout(() => {
      el.style.background = orig || '';
      setTimeout(() => { el.style.transition = ''; }, 300);
    }, 1500);
  }

  /** @private Parse DevExtreme filter expression into normalized format */
  _parseFilterExpression(filter) {
    if (!filter || !Array.isArray(filter)) return [];
    const results = [];

    // Simple filter: ['field', '=', 'value']
    if (filter.length === 3 && typeof filter[0] === 'string' && typeof filter[1] === 'string') {
      results.push({ colId: filter[0], operator: filter[1], value: filter[2] });
      return results;
    }

    // Combined filter: [expr, 'and'|'or', expr, ...]
    for (const part of filter) {
      if (Array.isArray(part)) {
        results.push(...this._parseFilterExpression(part));
      }
      // Skip 'and'/'or' strings
    }
    return results;
  }
}
