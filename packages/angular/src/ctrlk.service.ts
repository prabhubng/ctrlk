import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';

/**
 * CtrlK Runtime Service — headless IOUX engine for Angular.
 *
 * Wraps the @ctrlk/core singleton in Angular's DI system and bridges
 * events into NgZone + RxJS Observables for change detection.
 *
 * @example
 * ```typescript
 * constructor(private ctrlk: CtrlkService) {
 *   this.ctrlk.init({ palette: true, density: true });
 *   this.ctrlk.paletteRequested$.subscribe(req => this.showPalette(req));
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class CtrlkService implements OnDestroy {
  private _initialized = false;
  private _cleanups: (() => void)[] = [];

  // Lazy-load ctrlk to avoid SSR issues
  private _ctrlk: any = null;

  // RxJS bridges for Angular change detection
  private readonly _paletteRequested = new Subject<PaletteRequest>();
  private readonly _fieldJumpRequested = new Subject<FieldJumpRequest>();
  private readonly _densityChanged = new Subject<DensityChange>();
  private readonly _viewSaved = new Subject<ViewSavedEvent>();
  private readonly _viewLoaded = new Subject<ViewLoadedEvent>();
  private readonly _commandExecuted = new Subject<CommandExecutedEvent>();

  readonly paletteRequested$: Observable<PaletteRequest> = this._paletteRequested.asObservable();
  readonly fieldJumpRequested$: Observable<FieldJumpRequest> = this._fieldJumpRequested.asObservable();
  readonly densityChanged$: Observable<DensityChange> = this._densityChanged.asObservable();
  readonly viewSaved$: Observable<ViewSavedEvent> = this._viewSaved.asObservable();
  readonly viewLoaded$: Observable<ViewLoadedEvent> = this._viewLoaded.asObservable();
  readonly commandExecuted$: Observable<CommandExecutedEvent> = this._commandExecuted.asObservable();

  constructor(private zone: NgZone) {}

  /**
   * Initialize the headless CtrlK engine.
   * Safe to call multiple times — idempotent.
   */
  init(options: CtrlkInitOptions = {}): void {
    if (this._initialized) return;

    const ctrlk = this.getCtrlk();
    ctrlk.init(options);

    // Bridge events into Angular zone + RxJS
    this._cleanups.push(
      ctrlk.onPaletteRequest((data: PaletteRequest) => {
        this.zone.run(() => this._paletteRequested.next(data));
      }),
      ctrlk.onFieldJumpRequest((data: FieldJumpRequest) => {
        this.zone.run(() => this._fieldJumpRequested.next(data));
      }),
      ctrlk.onDensityChange((data: DensityChange) => {
        this.zone.run(() => this._densityChanged.next(data));
      }),
      ctrlk.onViewSaved((data: ViewSavedEvent) => {
        this.zone.run(() => this._viewSaved.next(data));
      }),
      ctrlk.onViewLoaded((data: ViewLoadedEvent) => {
        this.zone.run(() => this._viewLoaded.next(data));
      }),
      ctrlk.onCommandExecuted((data: CommandExecutedEvent) => {
        this.zone.run(() => this._commandExecuted.next(data));
      }),
    );

    this._initialized = true;
  }

  private _gridDisconnect: (() => void) | null = null;

  /**
   * Connect a grid adapter (DevExtreme, AG Grid, etc.)
   * Auto-disconnects when service is destroyed or a new grid is connected.
   */
  connectGrid(adapter: any): void {
    this.ensureInit();
    this._gridDisconnect = this.getCtrlk().connectGrid(adapter);
  }

  /**
   * Disconnect the current grid adapter. Cleans up event subscriptions.
   * Called automatically on destroy.
   */
  disconnectGrid(): void {
    this._gridDisconnect?.();
    this._gridDisconnect = null;
  }

  /**
   * Register a command.
   * @returns Unsubscribe function
   */
  registerCommand(def: CommandDef): () => void {
    this.ensureInit();
    return this.getCtrlk().commands.register(def);
  }

  /**
   * Execute a command by ID.
   */
  executeCommand(id: string): any {
    return this.getCtrlk().commands.execute(id);
  }

  /**
   * Search commands by query.
   */
  searchCommands(query: string): CommandDef[] {
    return this.getCtrlk().commands.search(query);
  }

  /**
   * List all registered commands.
   */
  listCommands(category?: string): CommandDef[] {
    return this.getCtrlk().commands.list(category);
  }

  /**
   * Bind a keyboard shortcut to a command.
   * @returns Unsubscribe function
   */
  bindShortcut(shortcut: string, commandId: string): () => void {
    this.ensureInit();
    return this.getCtrlk().keys.bind(shortcut, commandId);
  }

  /**
   * Save the current view state.
   */
  saveView(name: string): void {
    this.getCtrlk().views.save(name);
  }

  /**
   * Load a named view.
   */
  loadView(name: string): boolean {
    return this.getCtrlk().views.load(name);
  }

  /**
   * List all saved views.
   */
  listViews(): any[] {
    return this.getCtrlk().views.list();
  }

  /**
   * Register a field for jump-to navigation.
   * @returns Unsubscribe function
   */
  registerField(def: { id: string; label: string; section?: string; group?: string; element?: HTMLElement }): () => void {
    this.ensureInit();
    return this.getCtrlk().fields.register(def);
  }

  /**
   * Trigger field discovery from DOM [data-ctrlk-field] attributes.
   */
  discoverFields(): void {
    this.getCtrlk().fields.discover();
  }

  /**
   * Focus a registered field by ID.
   */
  focusField(id: string): void {
    this.getCtrlk().fields.focus(id);
  }

  /**
   * Get field completeness stats.
   */
  getFieldCompleteness(): { total: number; filled: number; empty: number; percent: number } {
    return this.getCtrlk().fields.getCompleteness();
  }

  /**
   * Create an RxJS Observable from any ctrlk event.
   */
  fromEvent<T = any>(eventName: string): Observable<T> {
    const subject = new Subject<T>();
    const unsub = this.getCtrlk().on(eventName, (data: T) => {
      this.zone.run(() => subject.next(data));
    });
    this._cleanups.push(unsub);
    return subject.asObservable();
  }

  /**
   * Direct access to the ctrlk instance (escape hatch).
   */
  get instance(): any {
    return this.getCtrlk();
  }

  get commands() { return this.getCtrlk().commands; }
  get keys() { return this.getCtrlk().keys; }
  get views() { return this.getCtrlk().views; }
  get fields() { return this.getCtrlk().fields; }
  get density() { return this.getCtrlk().density; }
  get selection() { return this.getCtrlk().selection; }

  ngOnDestroy(): void {
    this.disconnectGrid();
    this._cleanups.forEach(fn => fn());
    this._cleanups = [];
    this._paletteRequested.complete();
    this._fieldJumpRequested.complete();
    this._densityChanged.complete();
    this._viewSaved.complete();
    this._viewLoaded.complete();
    this._commandExecuted.complete();
  }

  private getCtrlk(): any {
    if (!this._ctrlk) {
      // CtrlK is loaded via angular.json scripts array or global import
      const win = (typeof window !== 'undefined' ? window : {}) as any;
      if (win.ctrlk) {
        this._ctrlk = win.ctrlk;
      } else {
        throw new Error(
          '[CtrlK] ctrlk not found on window. Add @ctrlk/core runtime to angular.json scripts:\n' +
          '"scripts": ["node_modules/@ctrlk/core/dist/ctrlk.runtime.min.js"]'
        );
      }
    }
    return this._ctrlk;
  }

  private ensureInit(): void {
    if (!this._initialized) {
      this.init();
    }
  }
}

// ═══════════════════════════════════════════════
// TYPES
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
  fields: any[];
  search: (query: string, opts?: any) => any[];
  focus: (id: string) => void;
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
