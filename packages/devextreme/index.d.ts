/**
 * @ctrlk/devextreme — DevExtreme DataGrid Adapter
 */

import { GridAdapter, ColumnDef, FilterDef, Unsubscribe } from '@ctrlk/core';

export interface DevExtremeAdapterOptions {
  keyExpr?: string;
  customStateKeys?: string[];
}

export declare class DevExtremeAdapter implements GridAdapter {
  constructor(grid: any, options?: DevExtremeAdapterOptions);

  // GridAdapter interface
  captureState(): Record<string, any>;
  restoreState(state: Record<string, any>): void;
  getColumns(): ColumnDef[];
  getVisibleColumns(): ColumnDef[];
  setColumnVisibility(visibility: Record<string, boolean>): void;
  setColumnOrder(colIds: string[]): void;
  ensureColumnVisible(colId: string): void;
  searchColumns(query: string): ColumnDef[];
  flashCells(options?: { columns?: string[] }): void;

  // Rows
  getRows(options?: { filtered?: boolean }): any[];
  getRowCount(): number;
  getSelectedRowIds(): string[];
  setSelectedRowIds(ids: string[], options?: { additive?: boolean }): void;
  clearSelection(): void;
  ensureRowVisible(rowId: string): void;
  getRowIdField(): string;

  // Cells
  getFocusedCell(): { rowIndex: number | null } | null;
  focusCell(rowId: string, colId: string): void;
  startCellEditing(rowId: string, colId: string): void;
  stopCellEditing(cancel?: boolean): void;
  getCellValue(rowId: string, colId: string): any;
  setCellValue(rowId: string, colId: string, value: any): void;

  // Filters & Sort
  getFilters(): FilterDef[];
  setFilters(filters: FilterDef[]): void;
  clearFilters(): void;
  getSortModel(): Array<{ colId: string; sort: string }>;
  setSortModel(model: Array<{ colId: string; sort: string }>): void;

  // Scroll & Density
  getScrollPosition(): { top: number; left: number };
  setScrollPosition(position: { top?: number; left?: number }): void;
  setDensity(level: 'compact' | 'comfortable' | 'spacious'): void;

  // Events & Export
  onGridEvent(event: string, handler: (e: any) => void): Unsubscribe;
  exportData(format?: 'csv' | 'json' | 'xlsx'): string;

  // DevExtreme-specific
  getGrouping(): Array<{ colId: string; groupIndex: number }>;
  setGrouping(colIds: string[]): void;
  expandAllGroups(expand?: boolean): void;
  getTotalSummary(): any[];
  expandDetail(rowKey: any): void;
  collapseDetail(rowKey: any): void;
  isDetailExpanded(rowKey: any): boolean;
  hasChanges(): boolean;
  saveChanges(): void;
  cancelChanges(): void;

  // Cleanup
  destroy(): void;
}
