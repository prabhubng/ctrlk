/**
 * @ctrlk/core — Headless IOUX Engine
 * TypeScript declarations for the core API surface.
 */

// ═══════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════

export interface CommandDef {
  id: string;
  title: string;
  execute: (...args: any[]) => any;
  shortcut?: string;
  category?: string;
  icon?: string;
  description?: string;
  undo?: (previousResult: any) => void;
  when?: () => boolean;
}

export interface ViewState {
  name: string;
  slot: number;
  savedAt: number;
  lastUsed: number;
  state: Record<string, any>;
  description?: string;
  scope?: string;
}

export interface FieldDef {
  id: string;
  label: string;
  section?: string;
  group?: string;
  element?: HTMLElement;
  required?: boolean;
  getValue?: () => any;
  getOriginalValue?: () => any;
}

export interface FieldSearchResult {
  field: FieldDef;
  score: number;
}

export interface ColumnDef {
  colId: string;
  headerName: string;
  visible: boolean;
  width: number;
  order: number;
  pinned: boolean | string | null;
  sort: string | null;
  sortIndex: number | null;
}

export interface FilterDef {
  colId: string;
  operator: string;
  value: any;
}

export interface DensityLevel {
  level: 'compact' | 'comfortable' | 'spacious';
  previous?: string;
}

export interface Completeness {
  total: number;
  filled: number;
  empty: number;
  percent: number;
}

export interface SessionProgress {
  visited: number;
  reviewed: number;
  dirty: number;
  total: number;
  percent: number;
}

export type Unsubscribe = () => void;

// ═══════════════════════════════════════════════
// EVENT PAYLOADS
// ═══════════════════════════════════════════════

export interface PaletteRequestPayload {
  commands: CommandDef[];
  search: (query: string) => CommandDef[];
  execute: (commandId: string) => any;
}

export interface FieldJumpRequestPayload {
  fields: FieldDef[];
  search: (query: string, options?: { limit?: number }) => FieldSearchResult[];
  searchGrouped: (query: string, options?: { limit?: number }) => { sections: Array<{ name: string; fields: FieldSearchResult[] }>; total: number };
  focus: (fieldId: string) => void;
  setSectionOrder: (order: string[]) => void;
  discover: () => void;
  getCompleteness: () => Completeness;
}

export interface ShortcutsRequestPayload {
  shortcuts: Array<{
    combo: string;
    commandId: string;
    title: string;
    category: string;
  }>;
}

export interface ViewSavedPayload {
  name: string;
  slot: number;
  shortcut: string | null;
  totalSaved: number;
  maxViews: number;
  remaining: number;
  evicted: string | null;
}

export interface ViewLoadedPayload {
  name: string;
}

export interface CommandExecutedPayload {
  id: string;
  result: any;
}

// ═══════════════════════════════════════════════
// SUBSYSTEMS
// ═══════════════════════════════════════════════

export interface EventBus {
  on(event: string, handler: (data: any) => void): Unsubscribe;
  emit(event: string, data?: any): void;
  off(event?: string): void;
  setDebug(enabled: boolean): void;
}

export interface CommandRegistry {
  register(def: CommandDef): Unsubscribe;
  unregister(id: string): void;
  execute(id: string, ...args: any[]): any;
  get(id: string): CommandDef | undefined;
  has(id: string): boolean;
  search(query: string, options?: { limit?: number }): CommandDef[];
  list(category?: string): CommandDef[];
  clear(): void;
}

export interface ShortcutEngine {
  attach(): void;
  detach(): void;
  bind(shortcut: string, commandId: string, options?: { scope?: string }): Unsubscribe;
  unbind(shortcut: string): void;
  setScope(scope: string): void;
  getScope(): string;
  getAll(): Array<{ combo: string; commandId: string; title: string; category: string }>;
}

export interface ViewStateManager {
  init(): void;
  setGridAdapter(adapter: GridAdapter): void;
  registerProvider(key: string, provider: { capture: () => any; restore: (state: any) => void }): Unsubscribe;
  capture(): Record<string, any>;
  save(name: string, options?: { description?: string; scope?: string; overwrite?: boolean }): ViewState;
  load(name: string, options?: {}): boolean;
  get(name: string): ViewState | undefined;
  has(name: string): boolean;
  delete(name: string): boolean;
  list(options?: { scope?: string; sort?: string }): ViewState[];
  getSlots(): Array<ViewState & { shortcut: string | null }>;
  getActive(): string | null;
  setMaxViews(max: number): void;
  getMaxViews(): number;
  autoSave(): void;
  autoRestore(): boolean;
}

export interface SelectionModel {
  init(): void;
  setGridAdapter?(adapter: GridAdapter): void;
  select(ids: string[]): void;
  deselect(ids: string[]): void;
  toggle(id: string): void;
  clear(): void;
  getSelected(): Set<string>;
  count(): number;
  isSelected(id: string): boolean;
  where(predicate: (row: any) => boolean): void;
  saveAs(name: string): void;
  loadSet(name: string): void;
  union(setName: string): void;
  intersect(setName: string): void;
  subtract(setName: string): void;
}

export interface FieldRegistry {
  init(): void;
  register(def: FieldDef): Unsubscribe;
  registerMany(defs: FieldDef[]): Unsubscribe;
  discover(): void;
  clear(): void;
  list(): FieldDef[];
  getAll(): FieldDef[];
  getGrouped(): Map<string, FieldDef[]>;
  setSectionOrder(sections: string[]): void;
  getSectionOrder(): string[];
  search(query: string, options?: { limit?: number; editableOnly?: boolean; emptyOnly?: boolean }): FieldSearchResult[];
  searchGrouped(query: string, options?: { limit?: number; editableOnly?: boolean }): {
    sections: Array<{ name: string; fields: FieldSearchResult[] }>;
    total: number;
  };
  focus(id: string, options?: { highlight?: boolean; scroll?: boolean }): void;
  focusNext(options?: {}): void;
  focusPrev(options?: {}): void;
  focusNextEmpty(): void;
  focusPrevEmpty(): void;
  focusFirst(): void;
  focusLast(): void;
  getDirty(): Array<{ id: string; label: string; original: any; current: any }>;
  getDirtyCount(): number;
  getCompleteness(): Completeness;
  pin(id: string): void;
  unpin(id: string): void;
  togglePin(id: string): void;
  isPinned(id: string): boolean;
  getPinned(): string[];
}

export interface DensityController {
  init(): void;
  cycle(): void;
  set(level: 'compact' | 'comfortable' | 'spacious'): void;
  get(): 'compact' | 'comfortable' | 'spacious';
}

export interface ColumnNavigator {
  init(): void;
  setGridAdapter?(adapter: GridAdapter): void;
  search(query: string): ColumnDef[];
  jumpTo(colId: string): void;
  bookmark(colId: string): void;
  nextBookmark(): void;
  prevBookmark(): void;
  getBookmarks(): string[];
  setVisibilityProfile(name: string, colIds: string[]): void;
  applyProfile(name: string): void;
}

export interface FocusNavigator {
  attach(): void;
  detach(): void;
  discover(): void;
  addZone(id: string, element: HTMLElement, options?: { label?: string }): void;
  nextZone(): void;
  prevZone(): void;
  focusZone(id: string): void;
}

export interface SessionTracker {
  init(): void;
  markVisited(id: string): void;
  markReviewed(id: string): void;
  markDirty(id: string): void;
  nextUnreviewed(): string | null;
  getProgress(): SessionProgress;
  isReviewed(id: string): boolean;
  reset(): void;
}

export interface MacroEngine {
  init(): void;
  startRecording(name: string): void;
  stopRecording(): void;
  play(name: string, params?: Record<string, any>): void;
  list(): Array<{ name: string; steps: number }>;
  delete(name: string): void;
  isRecording(): boolean;
}

export interface HistoryManager {
  init(): void;
  destroy(): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  getHistory(): Array<{ commandId: string; timestamp: number }>;
  clear(): void;
}

export interface ViewShare {
  init(): void;
  createLink(options?: { name?: string; description?: string }): string;
  applyFromUrl(): boolean;
  copyLink(options?: { name?: string; description?: string }): Promise<void>;
  peekLink(url: string): { name?: string; state: Record<string, any> } | null;
}

// ═══════════════════════════════════════════════
// GRID ADAPTER INTERFACE
// ═══════════════════════════════════════════════

export interface GridAdapter {
  captureState(): Record<string, any>;
  restoreState(state: Record<string, any>): void;
  getColumns(): ColumnDef[];
  getVisibleColumns(): ColumnDef[];
  setColumnVisibility(visibility: Record<string, boolean>): void;
  setColumnOrder?(colIds: string[]): void;
  ensureColumnVisible(colId: string): void;
  searchColumns?(query: string): ColumnDef[];
  flashCells?(options: { columns?: string[] }): void;
  getRows?(options?: { filtered?: boolean }): any[];
  getRowCount?(): number;
  getSelectedRowIds?(): string[];
  setSelectedRowIds?(ids: string[], options?: { additive?: boolean }): void;
  clearSelection?(): void;
  ensureRowVisible?(rowId: string): void;
  getRowIdField?(): string;
  getFilters?(): FilterDef[];
  setFilters?(filters: FilterDef[]): void;
  clearFilters?(): void;
  getSortModel?(): Array<{ colId: string; sort: string }>;
  setSortModel?(model: Array<{ colId: string; sort: string }>): void;
  setDensity?(level: 'compact' | 'comfortable' | 'spacious'): void;
  exportData?(format: 'csv' | 'json' | 'xlsx'): string;
  onGridEvent?(event: string, handler: (e: any) => void): Unsubscribe;
  destroy?(): void;
}

// ═══════════════════════════════════════════════
// CTRLK MAIN CLASS
// ═══════════════════════════════════════════════

export interface CtrlKInitOptions {
  autoDiscover?: boolean;
  palette?: boolean;
  density?: boolean;
  macros?: boolean;
  history?: boolean;
  session?: boolean;
  debug?: boolean;
  paletteShortcut?: string;
  densityCycleShortcut?: string;
  fieldJumpShortcut?: string;
}

export interface CtrlK {
  readonly version: string;

  // Subsystems
  readonly bus: EventBus;
  readonly commands: CommandRegistry;
  readonly keys: ShortcutEngine;
  readonly density: DensityController;
  readonly views: ViewStateManager;
  readonly selection: SelectionModel;
  readonly fields: FieldRegistry;
  readonly columnNav: ColumnNavigator;
  readonly focus: FocusNavigator;
  readonly session: SessionTracker;
  readonly macro: MacroEngine;
  readonly history: HistoryManager;
  readonly share: ViewShare;

  // Lifecycle
  init(options?: CtrlKInitOptions): CtrlK;
  destroy(): void;

  // Grid adapter
  connectGrid(adapter: GridAdapter): Unsubscribe;
  disconnectGrid(): void;

  // Event hooks (convenience API)
  onPaletteRequest(callback: (payload: PaletteRequestPayload) => void): Unsubscribe;
  onFieldJumpRequest(callback: (payload: FieldJumpRequestPayload) => void): Unsubscribe;
  onShortcutsRequest(callback: (payload: ShortcutsRequestPayload) => void): Unsubscribe;
  onDensityChange(callback: (payload: DensityLevel) => void): Unsubscribe;
  onViewSaved(callback: (payload: ViewSavedPayload) => void): Unsubscribe;
  onViewLoaded(callback: (payload: ViewLoadedPayload) => void): Unsubscribe;
  onCommandExecuted(callback: (payload: CommandExecutedPayload) => void): Unsubscribe;

  // Generic event subscription
  on(event: string, handler: (data: any) => void): Unsubscribe;
}

declare const ctrlk: CtrlK;
export default ctrlk;
export { ctrlk, CtrlK };
