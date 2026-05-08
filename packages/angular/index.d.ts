/**
 * @ctrlk/angular — Angular Service and Directives for CtrlK
 */

import { Observable } from 'rxjs';
import { CommandDef, CtrlK, GridAdapter, PaletteRequestPayload, FieldJumpRequestPayload, Unsubscribe, DensityLevel } from '@ctrlk/core';

// Module
export declare class CtrlkModule {
  static forRoot(options?: {
    palette?: boolean;
    density?: boolean;
    autoDiscover?: boolean;
  }): any;
}

// Service
export declare class CtrlkService {
  readonly instance: CtrlK;

  // RxJS Observables for Angular change detection
  readonly paletteRequested$: Observable<PaletteRequestPayload>;
  readonly fieldJumpRequested$: Observable<FieldJumpRequestPayload>;
  readonly densityChanged$: Observable<DensityLevel>;

  init(options?: Parameters<CtrlK['init']>[0]): void;
  destroy(): void;

  // Grid
  connectGrid(adapter: GridAdapter): void;

  // Commands
  register(def: CommandDef): Unsubscribe;
  execute(id: string): any;
  search(query: string): CommandDef[];

  // Shortcuts
  bind(shortcut: string, commandId: string): Unsubscribe;

  // Views
  saveView(name: string): void;
  loadView(name: string): void;
  listViews(): any[];

  // Fields
  registerField(def: { id: string; label: string; section?: string; element?: HTMLElement }): Unsubscribe;
  discoverFields(): void;
  focusField(id: string): void;

  // Observable from any ctrlk event
  fromEvent<T = any>(eventName: string): Observable<T>;
}

// Directives

/** Register a command from a template element. */
export declare class CtrlkCommandDirective {
  ctrlkCommand: string;
  ctrlkCommandTitle: string;
  ctrlkCommandShortcut: string;
  ctrlkCommandCategory: string;
  ctrlkCommandIcon: string;
}

/** Register a form field for jump-to navigation. */
export declare class CtrlkFieldDirective {
  ctrlkField: string;
  ctrlkFieldLabel: string;
  ctrlkFieldSection: string;
  ctrlkFieldGroup: string;
  ctrlkFieldRequired: boolean;
}

/** Bind a keyboard shortcut to a method. */
export declare class CtrlkShortcutDirective {
  ctrlkShortcut: string;
  ctrlkShortcutCommand: string;
}

/** Define a focus navigation zone. */
export declare class CtrlkZoneDirective {
  ctrlkZone: string;
  ctrlkZoneLabel: string;
}
