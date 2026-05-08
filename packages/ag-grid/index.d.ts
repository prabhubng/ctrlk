/**
 * @ctrlk/ag-grid — AG Grid Adapter
 */

import { GridAdapter, ColumnDef, FilterDef, Unsubscribe } from '@ctrlk/core';

export interface AgGridAdapterOptions {
  rowIdField?: string;
}

export declare class AgGridAdapter implements GridAdapter {
  constructor(gridApi: any, options?: AgGridAdapterOptions);

  // GridAdapter interface
  captureState(): Record<string, any>;
  restoreState(state: Record<string, any>): void;
  getColumns(): ColumnDef[];
  getVisibleColumns(): ColumnDef[];
  setColumnVisibility(visibility: Record<string, boolean>): void;
  setColumnOrder(colIds: string[]): void;
  ensureColumnVisible(colId: string): void;
  searchColumns(query: string): ColumnDef[];
  flashCells(options?: { columns?: string[]; rowNodes?: any[] }): void;

  // Rows
  getRows(options?: { filtered?: boolean }): any[];
  getRowCount(): number;
  getSelectedRowIds(): string[];
  setSelectedRowIds(ids: string[], options?: { additive?: boolean }): void;
  clearSelection(): void;
  ensureRowVisible(rowId: string): void;
  getRowIdField(): string;

  // Cells
  getFocusedCell(): { rowIndex: number; colId: string } | null;
  focusCell(rowId: string, colId: string): void;
  startCellEditing(rowId: string, colId: string): void;
  stopCellEditing(cancel?: boolean): void;

  // Filters & Sort
  getFilters(): FilterDef[];
  setFilters(filters: Record<string, any>): void;
  clearFilters(): void;
  getSortModel(): Array<{ colId: string; sort: string }>;
  setSortModel(model: Array<{ colId: string; sort: string }>): void;

  // Scroll & Density
  getScrollPosition(): { top: number; left: number };
  setScrollPosition(position: { top?: number; left?: number }): void;
  setDensity(level: 'compact' | 'comfortable' | 'spacious'): void;

  // Events & Export
  onGridEvent(event: string, handler: (e: any) => void): Unsubscribe;
  exportData(format?: 'csv' | 'json'): string;

  // Cleanup
  destroy(): void;
}
