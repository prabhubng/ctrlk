// ═══════════════════════════════════════════════
// @ctrlk/angular — Type Definitions
// ═══════════════════════════════════════════════

export interface CtrlkInitOptions {
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

export interface CommandDef {
  id: string;
  title: string;
  execute: (...args: any[]) => any;
  shortcut?: string;
  category?: string;
  icon?: string;
  undo?: (prev: any) => void;
  when?: () => boolean;
}

export interface PaletteRequest {
  commands: CommandDef[];
  search: (query: string) => CommandDef[];
  execute: (id: string) => any;
}

export interface FieldJumpRequest {
  fields: FieldDef[];
  search: (query: string, opts?: { limit?: number }) => FieldSearchResult[];
  searchGrouped: (query: string, opts?: { limit?: number }) => { sections: FieldSection[]; total: number };
  focus: (id: string) => void;
  setSectionOrder?: (order: string[]) => void;
  discover?: () => void;
  getCompleteness?: () => Completeness;
}

export interface FieldDef {
  id: string;
  label: string;
  section: string;
  group?: string;
  element?: HTMLElement;
}

export interface FieldSearchResult {
  field: FieldDef;
  score: number;
}

export interface FieldSection {
  name: string;
  fields: FieldSearchResult[];
}

export interface Completeness {
  total: number;
  filled: number;
  empty: number;
  percent: number;
}

export interface DensityChange {
  level: 'compact' | 'comfortable' | 'spacious';
  previous?: string;
}

export interface ViewSavedEvent {
  name: string;
  slot: number;
  shortcut: string | null;
  totalSaved: number;
  maxViews: number;
  remaining: number;
  evicted: string | null;
}

export interface ViewLoadedEvent {
  name: string;
}

export interface CommandExecutedEvent {
  id: string;
  result: any;
}

export interface ShortcutsRequest {
  shortcuts: Array<{
    combo: string;
    commandId: string;
    title: string;
    category: string;
  }>;
}
