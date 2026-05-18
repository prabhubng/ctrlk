import { Injectable, InjectionToken, NgZone, DestroyRef, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, Observable } from 'rxjs';

import type {
  CtrlkInitOptions,
  CommandDef,
  PaletteRequest,
  FieldJumpRequest,
  DensityChange,
  ViewSavedEvent,
  ViewLoadedEvent,
  CommandExecutedEvent,
  ShortcutsRequest,
} from './ctrlk.types';

/**
 * Injection token for the Window object.
 * Enables SSR compatibility and unit testing with mock window.
 */
export const CTRLK_WINDOW = new InjectionToken<Window>('CTRLK_WINDOW', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    const win = doc.defaultView;
    if (!win) {
      throw new Error('[CtrlK] Window is not available (SSR environment)');
    }
    return win;
  },
});

/**
 * CtrlK Runtime Service — headless IOUX engine for Angular.
 *
 * Wraps the @ctrlk/core singleton in Angular's DI system and bridges
 * events into NgZone + RxJS Observables for automatic change detection.
 *
 * Uses modern Angular patterns:
 * - `inject()` function over constructor injection
 * - `DestroyRef` + `takeUntilDestroyed` for automatic cleanup
 * - `DOCUMENT` / `CTRLK_WINDOW` tokens for SSR safety
 * - Separated type definitions
 *
 * @example
 * ```typescript
 * export class AppComponent {
 *   private readonly ctrlk = inject(CtrlkService);
 *
 *   constructor() {
 *     this.ctrlk.init({ palette: true, density: true });
 *     this.ctrlk.paletteRequested$.subscribe(req => this.showPalette(req));
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class CtrlkService {
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly window = inject(CTRLK_WINDOW);

  private _initialized = false;
  private _ctrlk: any = null;
  private _gridDisconnect: (() => void) | null = null;
  private readonly _cleanups: (() => void)[] = [];

  // ─── Event Streams ───
  // Each Subject bridges a ctrlk event into Angular's zone + RxJS.

  private readonly _paletteRequested = new Subject<PaletteRequest>();
  private readonly _fieldJumpRequested = new Subject<FieldJumpRequest>();
  private readonly _shortcutsRequested = new Subject<ShortcutsRequest>();
  private readonly _densityChanged = new Subject<DensityChange>();
  private readonly _viewSaved = new Subject<ViewSavedEvent>();
  private readonly _viewLoaded = new Subject<ViewLoadedEvent>();
  private readonly _commandExecuted = new Subject<CommandExecutedEvent>();

  readonly paletteRequested$: Observable<PaletteRequest> = this._paletteRequested.asObservable();
  readonly fieldJumpRequested$: Observable<FieldJumpRequest> = this._fieldJumpRequested.asObservable();
  readonly shortcutsRequested$: Observable<ShortcutsRequest> = this._shortcutsRequested.asObservable();
  readonly densityChanged$: Observable<DensityChange> = this._densityChanged.asObservable();
  readonly viewSaved$: Observable<ViewSavedEvent> = this._viewSaved.asObservable();
  readonly viewLoaded$: Observable<ViewLoadedEvent> = this._viewLoaded.asObservable();
  readonly commandExecuted$: Observable<CommandExecutedEvent> = this._commandExecuted.asObservable();

  constructor() {
    this.destroyRef.onDestroy(() => this.dispose());
  }

  // ─── Lifecycle ───

  /**
   * Initialize the headless CtrlK engine.
   * Safe to call multiple times — idempotent.
   */
  init(options: CtrlkInitOptions = {}): void {
    if (this._initialized) return;

    const ctrlk = this.resolveCtrlk();
    ctrlk.init(options);
    this.bridgeEvents(ctrlk);
    this._initialized = true;
  }

  /**
   * Connect a grid adapter (DevExtreme, AG Grid, etc.)
   * Auto-disconnects previous adapter. Returns disconnect function.
   */
  connectGrid(adapter: any): () => void {
    this.ensureInit();
    this._gridDisconnect?.();
    this._gridDisconnect = this.resolveCtrlk().connectGrid(adapter);
    return () => this.disconnectGrid();
  }

  /** Disconnect the current grid adapter. Cleans up event subscriptions. */
  disconnectGrid(): void {
    this._gridDisconnect?.();
    this._gridDisconnect = null;
  }

  // ─── Commands ───

  /** Register a command. Returns unsubscribe function. */
  registerCommand(def: CommandDef): () => void {
    this.ensureInit();
    const unsub = this.resolveCtrlk().commands.register(def);
    this._cleanups.push(unsub);
    return unsub;
  }

  /** Execute a command by ID. */
  executeCommand(id: string): any {
    return this.resolveCtrlk().commands.execute(id);
  }

  /** Search commands by query string. */
  searchCommands(query: string): CommandDef[] {
    return this.resolveCtrlk().commands.search(query);
  }

  /** List all registered commands, optionally filtered by category. */
  listCommands(category?: string): CommandDef[] {
    return this.resolveCtrlk().commands.list(category);
  }

  // ─── Shortcuts ───

  /** Bind a keyboard shortcut to a command. Returns unsubscribe function. */
  bindShortcut(shortcut: string, commandId: string): () => void {
    this.ensureInit();
    const unsub = this.resolveCtrlk().keys.bind(shortcut, commandId);
    this._cleanups.push(unsub);
    return unsub;
  }

  // ─── Views ───

  /** Save the current view state. */
  saveView(name: string): void {
    this.resolveCtrlk().views.save(name);
  }

  /** Load a named view. Returns true if found. */
  loadView(name: string): boolean {
    return this.resolveCtrlk().views.load(name);
  }

  /** List all saved views. */
  listViews(): any[] {
    return this.resolveCtrlk().views.list();
  }

  /** Get view slots with shortcut assignments. */
  getViewSlots(): any[] {
    return this.resolveCtrlk().views.getSlots();
  }

  // ─── Fields ───

  /** Register a field for jump-to navigation. Returns unsubscribe function. */
  registerField(def: {
    id: string;
    label: string;
    section?: string;
    group?: string;
    element?: HTMLElement;
  }): () => void {
    this.ensureInit();
    const unsub = this.resolveCtrlk().fields.register(def);
    this._cleanups.push(unsub);
    return unsub;
  }

  /** Trigger field discovery from DOM [data-ctrlk-field] attributes. */
  discoverFields(): void {
    this.resolveCtrlk().fields.discover();
  }

  /** Focus a registered field by ID (scroll + highlight). */
  focusField(id: string): void {
    this.resolveCtrlk().fields.focus(id);
  }

  /** Set custom section ordering for field jump grouped search. */
  setFieldSectionOrder(order: string[]): void {
    const fields = this.resolveCtrlk().fields;
    if (fields.setSectionOrder) fields.setSectionOrder(order);
  }

  /** Get field completeness stats. */
  getFieldCompleteness(): { total: number; filled: number; empty: number; percent: number } {
    return this.resolveCtrlk().fields.getCompleteness();
  }

  // ─── Observables ───

  /**
   * Create an RxJS Observable from any ctrlk event.
   * Automatically bridges into NgZone and cleans up on destroy.
   */
  fromEvent<T = any>(eventName: string): Observable<T> {
    const subject = new Subject<T>();
    const unsub = this.resolveCtrlk().on(eventName, (data: T) => {
      this.zone.run(() => subject.next(data));
    });
    this._cleanups.push(unsub);

    return subject.pipe(takeUntilDestroyed(this.destroyRef));
  }

  // ─── Direct Access ───

  /** Direct access to the ctrlk singleton (escape hatch for advanced use). */
  get instance(): any { return this.resolveCtrlk(); }
  get commands() { return this.resolveCtrlk().commands; }
  get keys() { return this.resolveCtrlk().keys; }
  get views() { return this.resolveCtrlk().views; }
  get fields() { return this.resolveCtrlk().fields; }
  get density() { return this.resolveCtrlk().density; }
  get selection() { return this.resolveCtrlk().selection; }
  get share() { return this.resolveCtrlk().share; }

  // ─── Internal ───

  private bridgeEvents(ctrlk: any): void {
    const bridge = <T>(hookFn: (cb: (data: T) => void) => () => void, subject: Subject<T>) => {
      const unsub = hookFn((data: T) => {
        this.zone.run(() => subject.next(data));
      });
      this._cleanups.push(unsub);
    };

    bridge<PaletteRequest>(ctrlk.onPaletteRequest.bind(ctrlk), this._paletteRequested);
    bridge<FieldJumpRequest>(ctrlk.onFieldJumpRequest.bind(ctrlk), this._fieldJumpRequested);
    bridge<ShortcutsRequest>(ctrlk.onShortcutsRequest.bind(ctrlk), this._shortcutsRequested);
    bridge<DensityChange>(ctrlk.onDensityChange.bind(ctrlk), this._densityChanged);
    bridge<ViewSavedEvent>(ctrlk.onViewSaved.bind(ctrlk), this._viewSaved);
    bridge<ViewLoadedEvent>(ctrlk.onViewLoaded.bind(ctrlk), this._viewLoaded);
    bridge<CommandExecutedEvent>(ctrlk.onCommandExecuted.bind(ctrlk), this._commandExecuted);
  }

  private resolveCtrlk(): any {
    if (!this._ctrlk) {
      const win = this.window as any;
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
    if (!this._initialized) this.init();
  }

  private dispose(): void {
    this.disconnectGrid();
    this._cleanups.forEach(fn => fn());
    this._cleanups.length = 0;

    this._paletteRequested.complete();
    this._fieldJumpRequested.complete();
    this._shortcutsRequested.complete();
    this._densityChanged.complete();
    this._viewSaved.complete();
    this._viewLoaded.complete();
    this._commandExecuted.complete();
  }
}
