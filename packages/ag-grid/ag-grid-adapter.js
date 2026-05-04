/**
 * CtrlK AG Grid Adapter
 * ──────────────────────────────────────────────
 * Bridges ctrlk to AG Grid (Community & Enterprise).
 * 
 * Handles heavily customized AG Grid instances — wraps
 * whatever gridApi/columnApi surface exists, including
 * custom cell editors, value getters, and column groups.
 * 
 * Usage:
 *   import { AgGridAdapter } from '@ctrlk/ag-grid';
 *   
 *   // After grid is ready (onGridReady callback)
 *   const adapter = new AgGridAdapter(gridApi, {
 *     rowIdField: 'id',        // default: 'id'
 *     customStateKeys: ['pivotMode', 'groupState'],  // extra state to capture
 *   });
 *   
 *   ctrlk.views.setGridAdapter(adapter);
 *   ctrlk.selection.setGridAdapter(adapter);
 * 
 * Supports AG Grid v28+ (legacy columnApi merged into gridApi in v31).
 * Detects API version automatically.
 * 
 * @module @ctrlk/ag-grid
 * @author Prabhu Raja
 */

export class AgGridAdapter {
  /**
   * @param {Object} gridApi - AG Grid's gridApi (from onGridReady)
   * @param {Object} [options]
   * @param {string} [options.rowIdField='id'] - Field name used as row identifier
   * @param {string[]} [options.customStateKeys] - Additional state keys to capture
   * @param {Object} [options.columnApi] - Legacy columnApi for AG Grid < v31
   */
  constructor(gridApi, options = {}) {
    if (!gridApi) throw new Error('[CtrlK/AG Grid] gridApi is required');

    this._api = gridApi;
    this._rowIdField = options.rowIdField || 'id';
    this._customStateKeys = options.customStateKeys || [];
    this._eventCleanups = [];

    // AG Grid v31+ merged columnApi into gridApi
    // Detect which API surface is available
    this._colApi = options.columnApi || (gridApi.getColumnState ? gridApi : null);
  }

  // ═══════════════════════════════════════════
  // STATE — Capture & Restore
  // ═══════════════════════════════════════════

  captureState() {
    const state = {
      columns: this._captureColumnState(),
      filters: this._captureFilterState(),
      sort: this._captureSortState(),
      scrollTop: 0,
      scrollLeft: 0,
      selectedRowIds: this.getSelectedRowIds(),
      custom: {},
    };

    // Capture scroll position
    try {
      const vp = this._api.getVerticalPixelRange?.();
      if (vp) state.scrollTop = vp.top;
      const hp = this._api.getHorizontalPixelRange?.();
      if (hp) state.scrollLeft = hp.left;
    } catch (e) { /* not available */ }

    // Capture custom state keys (for heavily customized grids)
    for (const key of this._customStateKeys) {
      try {
        if (key === 'pivotMode') {
          state.custom.pivotMode = this._api.isPivotMode?.() || false;
        } else if (key === 'groupState') {
          // Capture expanded/collapsed group state
          const groups = [];
          this._api.forEachNode?.(node => {
            if (node.group) {
              groups.push({ key: node.key, expanded: node.expanded });
            }
          });
          state.custom.groupState = groups;
        }
      } catch (e) { /* silent */ }
    }

    return state;
  }

  restoreState(state) {
    if (!state) return;

    // Restore column state (visibility, order, width, pinning)
    if (state.columns) {
      this._restoreColumnState(state.columns);
    }

    // Restore filters
    if (state.filters) {
      this._restoreFilterState(state.filters);
    }

    // Restore sort
    if (state.sort) {
      this._restoreSortState(state.sort);
    }

    // Restore selection
    if (state.selectedRowIds?.length) {
      // Defer selection until data is rendered
      setTimeout(() => {
        this.setSelectedRowIds(state.selectedRowIds);
      }, 100);
    }

    // Restore scroll position
    if (state.scrollTop || state.scrollLeft) {
      setTimeout(() => {
        try {
          if (state.scrollTop) this._api.ensureIndexVisible?.(0);
          // AG Grid doesn't have a direct setScrollPosition — use ensureVisible
          if (state.scrollLeft) {
            this._api.ensureColumnVisible?.(this.getVisibleColumns()[0]?.colId);
          }
        } catch (e) { /* silent */ }
      }, 200);
    }

    // Restore custom state
    if (state.custom) {
      if (state.custom.pivotMode !== undefined) {
        this._api.setPivotMode?.(state.custom.pivotMode);
      }
      if (state.custom.groupState) {
        setTimeout(() => {
          for (const g of state.custom.groupState) {
            this._api.forEachNode?.(node => {
              if (node.group && node.key === g.key) {
                node.setExpanded(g.expanded);
              }
            });
          }
        }, 150);
      }
    }
  }

  // ═══════════════════════════════════════════
  // COLUMNS
  // ═══════════════════════════════════════════

  getColumns() {
    try {
      const colState = this._getColumnState();
      const colDefs = this._api.getColumnDefs?.() || [];
      const defMap = new Map();
      for (const def of this._flattenColDefs(colDefs)) {
        defMap.set(def.field || def.colId, def);
      }

      return colState.map((cs, idx) => {
        const def = defMap.get(cs.colId) || {};
        return {
          colId: cs.colId,
          headerName: def.headerName || cs.colId,
          visible: !cs.hide,
          width: cs.width || 100,
          order: idx,
          pinned: cs.pinned || false,
          sort: cs.sort || null,
          sortIndex: cs.sortIndex ?? null,
        };
      });
    } catch (err) {
      console.warn('[CtrlK/AG Grid] getColumns failed:', err.message);
      return [];
    }
  }

  getVisibleColumns() {
    return this.getColumns().filter(c => c.visible);
  }

  setColumnVisibility(visibility) {
    try {
      const state = this._getColumnState();
      const updated = state.map(cs => ({
        ...cs,
        hide: visibility[cs.colId] !== undefined ? !visibility[cs.colId] : cs.hide,
      }));
      this._applyColumnState(updated);
    } catch (err) {
      console.warn('[CtrlK/AG Grid] setColumnVisibility failed:', err.message);
    }
  }

  setColumnOrder(colIds) {
    try {
      const state = this._getColumnState();
      const stateMap = new Map(state.map(cs => [cs.colId, cs]));
      const ordered = colIds
        .filter(id => stateMap.has(id))
        .map(id => stateMap.get(id));
      // Add any columns not in the provided list at the end
      for (const cs of state) {
        if (!colIds.includes(cs.colId)) {
          ordered.push(cs);
        }
      }
      this._applyColumnState(ordered);
    } catch (err) {
      console.warn('[CtrlK/AG Grid] setColumnOrder failed:', err.message);
    }
  }

  ensureColumnVisible(colId) {
    try {
      this._api.ensureColumnVisible(colId);
    } catch (err) {
      console.warn('[CtrlK/AG Grid] ensureColumnVisible failed:', err.message);
    }
  }

  searchColumns(query) {
    const q = query.toLowerCase();
    return this.getColumns().filter(c =>
      c.headerName.toLowerCase().includes(q) ||
      c.colId.toLowerCase().includes(q)
    );
  }

  // ═══════════════════════════════════════════
  // ROWS
  // ═══════════════════════════════════════════

  getRows(options = {}) {
    const { filtered = true } = options;
    const rows = [];
    try {
      if (filtered) {
        this._api.forEachNodeAfterFilterAndSort?.(node => {
          if (node.data) rows.push(node.data);
        });
      } else {
        this._api.forEachNode?.(node => {
          if (node.data) rows.push(node.data);
        });
      }
    } catch (err) {
      console.warn('[CtrlK/AG Grid] getRows failed:', err.message);
    }
    return rows;
  }

  getRowCount() {
    try {
      return this._api.getDisplayedRowCount?.() || 0;
    } catch (e) {
      return 0;
    }
  }

  getSelectedRowIds() {
    try {
      const nodes = this._api.getSelectedNodes?.() || [];
      return nodes.map(n => String(n.data?.[this._rowIdField] || n.id));
    } catch (e) {
      return [];
    }
  }

  setSelectedRowIds(rowIds, options = {}) {
    const { additive = false } = options;
    try {
      if (!additive) {
        this._api.deselectAll?.();
      }
      const idSet = new Set(rowIds.map(String));
      this._api.forEachNode?.(node => {
        const nodeId = String(node.data?.[this._rowIdField] || node.id);
        if (idSet.has(nodeId)) {
          node.setSelected(true);
        }
      });
    } catch (err) {
      console.warn('[CtrlK/AG Grid] setSelectedRowIds failed:', err.message);
    }
  }

  clearSelection() {
    try {
      this._api.deselectAll?.();
    } catch (e) { /* silent */ }
  }

  ensureRowVisible(rowId) {
    try {
      this._api.forEachNode?.(node => {
        const nodeId = String(node.data?.[this._rowIdField] || node.id);
        if (nodeId === rowId) {
          this._api.ensureNodeVisible(node);
        }
      });
    } catch (e) { /* silent */ }
  }

  getRowIdField() {
    return this._rowIdField;
  }

  // ═══════════════════════════════════════════
  // CELLS
  // ═══════════════════════════════════════════

  getFocusedCell() {
    try {
      const cell = this._api.getFocusedCell?.();
      if (!cell) return null;
      const rowNode = this._api.getDisplayedRowAtIndex?.(cell.rowIndex);
      return {
        rowId: String(rowNode?.data?.[this._rowIdField] || rowNode?.id || ''),
        colId: cell.column?.getColId?.() || '',
        rowIndex: cell.rowIndex,
        colIndex: cell.column?.getInstanceId?.() || 0,
      };
    } catch (e) {
      return null;
    }
  }

  focusCell(rowId, colId) {
    try {
      let targetIndex = null;
      this._api.forEachNode?.(node => {
        const nodeId = String(node.data?.[this._rowIdField] || node.id);
        if (nodeId === rowId) {
          targetIndex = node.rowIndex;
        }
      });
      if (targetIndex !== null) {
        this._api.setFocusedCell?.(targetIndex, colId);
        this._api.ensureIndexVisible?.(targetIndex);
        this._api.ensureColumnVisible?.(colId);
      }
    } catch (err) {
      console.warn('[CtrlK/AG Grid] focusCell failed:', err.message);
    }
  }

  startCellEditing() {
    try {
      const cell = this._api.getFocusedCell?.();
      if (cell) {
        this._api.startEditingCell?.({
          rowIndex: cell.rowIndex,
          colKey: cell.column?.getColId?.(),
        });
      }
    } catch (e) { /* silent */ }
  }

  stopCellEditing(cancel = false) {
    try {
      this._api.stopEditing?.(cancel);
    } catch (e) { /* silent */ }
  }

  getCellValue(rowId, colId) {
    try {
      let value = undefined;
      this._api.forEachNode?.(node => {
        const nodeId = String(node.data?.[this._rowIdField] || node.id);
        if (nodeId === rowId) {
          value = this._api.getValue?.(colId, node) ?? node.data?.[colId];
        }
      });
      return value;
    } catch (e) {
      return undefined;
    }
  }

  setCellValue(rowId, colId, value) {
    try {
      this._api.forEachNode?.(node => {
        const nodeId = String(node.data?.[this._rowIdField] || node.id);
        if (nodeId === rowId && node.data) {
          node.data[colId] = value;
          this._api.refreshCells?.({ rowNodes: [node], columns: [colId] });
        }
      });
    } catch (err) {
      console.warn('[CtrlK/AG Grid] setCellValue failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════
  // FILTERS
  // ═══════════════════════════════════════════

  getFilters() {
    try {
      const model = this._api.getFilterModel?.() || {};
      return Object.entries(model).map(([colId, filter]) => ({
        colId,
        type: filter.filterType || 'text',
        value: filter.filter ?? filter.values ?? filter,
        operator: filter.type || 'equals',
      }));
    } catch (e) {
      return [];
    }
  }

  setFilters(filters) {
    try {
      const model = {};
      for (const f of filters) {
        model[f.colId] = {
          filterType: f.type || 'text',
          type: f.operator || 'equals',
          filter: f.value,
        };
      }
      this._api.setFilterModel?.(model);
    } catch (err) {
      console.warn('[CtrlK/AG Grid] setFilters failed:', err.message);
    }
  }

  clearFilters() {
    try {
      this._api.setFilterModel?.(null);
    } catch (e) { /* silent */ }
  }

  // ═══════════════════════════════════════════
  // SORT
  // ═══════════════════════════════════════════

  getSortModel() {
    try {
      // AG Grid v28+: sort is part of column state
      const state = this._getColumnState();
      return state
        .filter(cs => cs.sort)
        .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
        .map(cs => ({ colId: cs.colId, sort: cs.sort }));
    } catch (e) {
      return [];
    }
  }

  setSortModel(sortModel) {
    try {
      const state = this._getColumnState();
      const updated = state.map(cs => {
        const sm = sortModel.find(s => s.colId === cs.colId);
        return {
          ...cs,
          sort: sm ? sm.sort : null,
          sortIndex: sm ? sortModel.indexOf(sm) : null,
        };
      });
      this._applyColumnState(updated);
    } catch (err) {
      console.warn('[CtrlK/AG Grid] setSortModel failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════
  // SCROLL
  // ═══════════════════════════════════════════

  getScrollPosition() {
    try {
      const vp = this._api.getVerticalPixelRange?.() || { top: 0 };
      const hp = this._api.getHorizontalPixelRange?.() || { left: 0 };
      return { top: vp.top, left: hp.left };
    } catch (e) {
      return { top: 0, left: 0 };
    }
  }

  setScrollPosition(position) {
    // AG Grid doesn't have a direct scroll setter
    // Use ensureIndexVisible as approximation
    try {
      if (position.top !== undefined) {
        const rowHeight = this._api.getSizesForCurrentTheme?.()?.rowHeight || 28;
        const idx = Math.floor(position.top / rowHeight);
        this._api.ensureIndexVisible?.(idx, 'top');
      }
    } catch (e) { /* silent */ }
  }

  // ═══════════════════════════════════════════
  // EVENTS
  // ═══════════════════════════════════════════

  onGridEvent(event, handler) {
    const eventMap = {
      'selectionChanged': 'selectionChanged',
      'filterChanged': 'filterChanged',
      'sortChanged': 'sortChanged',
      'cellFocused': 'cellFocused',
      'cellEditStarted': 'cellEditingStarted',
      'cellEditStopped': 'cellEditingStopped',
      'columnMoved': 'columnMoved',
      'columnResized': 'columnResized',
      'columnVisible': 'columnVisible',
    };

    const agEvent = eventMap[event] || event;
    try {
      this._api.addEventListener?.(agEvent, handler);
      const cleanup = () => this._api.removeEventListener?.(agEvent, handler);
      this._eventCleanups.push(cleanup);
      return cleanup;
    } catch (e) {
      return () => {};
    }
  }

  // ═══════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════

  exportData(format = 'csv') {
    try {
      if (format === 'csv') {
        return this._api.getDataAsCsv?.() || '';
      }
      // JSON export
      const rows = this.getRows({ filtered: true });
      return JSON.stringify(rows, null, 2);
    } catch (e) {
      return '';
    }
  }

  // ═══════════════════════════════════════════
  // DESTROY
  // ═══════════════════════════════════════════

  destroy() {
    for (const cleanup of this._eventCleanups) {
      try { cleanup(); } catch (e) { /* silent */ }
    }
    this._eventCleanups = [];
    this._api = null;
    this._colApi = null;
  }

  // ═══════════════════════════════════════════
  // INTERNAL — AG Grid API abstraction
  // ═══════════════════════════════════════════

  /** @private Get column state (handles v28 vs v31+ API difference) */
  _getColumnState() {
    try {
      // v31+: gridApi.getColumnState()
      if (this._api.getColumnState) return this._api.getColumnState();
      // v28-30: columnApi.getColumnState()
      if (this._colApi?.getColumnState) return this._colApi.getColumnState();
      return [];
    } catch (e) {
      return [];
    }
  }

  /** @private Apply column state */
  _applyColumnState(state) {
    try {
      // v31+
      if (this._api.applyColumnState) {
        this._api.applyColumnState({ state, applyOrder: true });
        return;
      }
      // v28-30
      if (this._colApi?.applyColumnState) {
        this._colApi.applyColumnState({ state, applyOrder: true });
        return;
      }
      // Legacy
      if (this._colApi?.setColumnState) {
        this._colApi.setColumnState(state);
      }
    } catch (e) {
      console.warn('[CtrlK/AG Grid] applyColumnState failed:', e.message);
    }
  }

  /** @private Capture column state for serialization */
  _captureColumnState() {
    return this._getColumnState().map(cs => ({
      colId: cs.colId,
      width: cs.width,
      hide: cs.hide,
      pinned: cs.pinned,
      sort: cs.sort,
      sortIndex: cs.sortIndex,
      flex: cs.flex,
      aggFunc: cs.aggFunc,
      pivot: cs.pivot,
      pivotIndex: cs.pivotIndex,
      rowGroup: cs.rowGroup,
      rowGroupIndex: cs.rowGroupIndex,
    }));
  }

  /** @private Capture filter state for serialization */
  _captureFilterState() {
    try {
      return this._api.getFilterModel?.() || {};
    } catch (e) {
      return {};
    }
  }

  /** @private Capture sort state */
  _captureSortState() {
    return this.getSortModel();
  }

  /** @private Restore column state */
  _restoreColumnState(columns) {
    this._applyColumnState(columns);
  }

  /** @private Restore filter state */
  _restoreFilterState(filters) {
    try {
      // Filters can be either an array (ctrlk format) or an object (AG Grid native)
      if (Array.isArray(filters)) {
        const model = {};
        for (const f of filters) {
          model[f.colId] = { filterType: f.type, type: f.operator, filter: f.value };
        }
        this._api.setFilterModel?.(model);
      } else {
        this._api.setFilterModel?.(filters);
      }
    } catch (e) {
      console.warn('[CtrlK/AG Grid] restoreFilterState failed:', e.message);
    }
  }

  /** @private Restore sort state */
  _restoreSortState(sort) {
    this.setSortModel(sort);
  }

  /** @private Flatten nested column group definitions */
  _flattenColDefs(defs) {
    const flat = [];
    for (const def of defs) {
      if (def.children) {
        flat.push(...this._flattenColDefs(def.children));
      } else {
        flat.push(def);
      }
    }
    return flat;
  }
}
