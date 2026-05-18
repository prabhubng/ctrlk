import * as i0 from '@angular/core';
import { InjectionToken, OnInit, ModuleWithProviders } from '@angular/core';
import { Observable } from 'rxjs';

interface CtrlkInitOptions {
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
interface CommandDef {
    id: string;
    title: string;
    execute: (...args: any[]) => any;
    shortcut?: string;
    category?: string;
    icon?: string;
    undo?: (prev: any) => void;
    when?: () => boolean;
}
interface PaletteRequest {
    commands: CommandDef[];
    search: (query: string) => CommandDef[];
    execute: (id: string) => any;
}
interface FieldJumpRequest {
    fields: FieldDef[];
    search: (query: string, opts?: {
        limit?: number;
    }) => FieldSearchResult[];
    searchGrouped: (query: string, opts?: {
        limit?: number;
    }) => {
        sections: FieldSection[];
        total: number;
    };
    focus: (id: string) => void;
    setSectionOrder?: (order: string[]) => void;
    discover?: () => void;
    getCompleteness?: () => Completeness;
}
interface FieldDef {
    id: string;
    label: string;
    section: string;
    group?: string;
    element?: HTMLElement;
}
interface FieldSearchResult {
    field: FieldDef;
    score: number;
}
interface FieldSection {
    name: string;
    fields: FieldSearchResult[];
}
interface Completeness {
    total: number;
    filled: number;
    empty: number;
    percent: number;
}
interface DensityChange {
    level: 'compact' | 'comfortable' | 'spacious';
    previous?: string;
}
interface ViewSavedEvent {
    name: string;
    slot: number;
    shortcut: string | null;
    totalSaved: number;
    maxViews: number;
    remaining: number;
    evicted: string | null;
}
interface ViewLoadedEvent {
    name: string;
}
interface CommandExecutedEvent {
    id: string;
    result: any;
}
interface ShortcutsRequest {
    shortcuts: Array<{
        combo: string;
        commandId: string;
        title: string;
        category: string;
    }>;
}

/**
 * Injection token for the Window object.
 * Enables SSR compatibility and unit testing with mock window.
 */
declare const CTRLK_WINDOW: InjectionToken<Window>;
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
declare class CtrlkService {
    private readonly zone;
    private readonly destroyRef;
    private readonly window;
    private _initialized;
    private _ctrlk;
    private _gridDisconnect;
    private readonly _cleanups;
    private readonly _paletteRequested;
    private readonly _fieldJumpRequested;
    private readonly _shortcutsRequested;
    private readonly _densityChanged;
    private readonly _viewSaved;
    private readonly _viewLoaded;
    private readonly _commandExecuted;
    readonly paletteRequested$: Observable<PaletteRequest>;
    readonly fieldJumpRequested$: Observable<FieldJumpRequest>;
    readonly shortcutsRequested$: Observable<ShortcutsRequest>;
    readonly densityChanged$: Observable<DensityChange>;
    readonly viewSaved$: Observable<ViewSavedEvent>;
    readonly viewLoaded$: Observable<ViewLoadedEvent>;
    readonly commandExecuted$: Observable<CommandExecutedEvent>;
    constructor();
    /**
     * Initialize the headless CtrlK engine.
     * Safe to call multiple times — idempotent.
     */
    init(options?: CtrlkInitOptions): void;
    /**
     * Connect a grid adapter (DevExtreme, AG Grid, etc.)
     * Auto-disconnects previous adapter. Returns disconnect function.
     */
    connectGrid(adapter: any): () => void;
    /** Disconnect the current grid adapter. Cleans up event subscriptions. */
    disconnectGrid(): void;
    /** Register a command. Returns unsubscribe function. */
    registerCommand(def: CommandDef): () => void;
    /** Execute a command by ID. */
    executeCommand(id: string): any;
    /** Search commands by query string. */
    searchCommands(query: string): CommandDef[];
    /** List all registered commands, optionally filtered by category. */
    listCommands(category?: string): CommandDef[];
    /** Bind a keyboard shortcut to a command. Returns unsubscribe function. */
    bindShortcut(shortcut: string, commandId: string): () => void;
    /** Save the current view state. */
    saveView(name: string): void;
    /** Load a named view. Returns true if found. */
    loadView(name: string): boolean;
    /** List all saved views. */
    listViews(): any[];
    /** Get view slots with shortcut assignments. */
    getViewSlots(): any[];
    /** Register a field for jump-to navigation. Returns unsubscribe function. */
    registerField(def: {
        id: string;
        label: string;
        section?: string;
        group?: string;
        element?: HTMLElement;
    }): () => void;
    /** Trigger field discovery from DOM [data-ctrlk-field] attributes. */
    discoverFields(): void;
    /** Focus a registered field by ID (scroll + highlight). */
    focusField(id: string): void;
    /** Set custom section ordering for field jump grouped search. */
    setFieldSectionOrder(order: string[]): void;
    /** Get field completeness stats. */
    getFieldCompleteness(): {
        total: number;
        filled: number;
        empty: number;
        percent: number;
    };
    /**
     * Create an RxJS Observable from any ctrlk event.
     * Automatically bridges into NgZone and cleans up on destroy.
     */
    fromEvent<T = any>(eventName: string): Observable<T>;
    /** Direct access to the ctrlk singleton (escape hatch for advanced use). */
    get instance(): any;
    get commands(): any;
    get keys(): any;
    get views(): any;
    get fields(): any;
    get density(): any;
    get selection(): any;
    get share(): any;
    private bridgeEvents;
    private resolveCtrlk;
    private ensureInit;
    private dispose;
    static ɵfac: i0.ɵɵFactoryDeclaration<CtrlkService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<CtrlkService>;
}

/**
 * Register a command from a template element.
 *
 * @example
 * ```html
 * <button ctrlkCommand="export.csv"
 *         ctrlkCommandTitle="Export to CSV"
 *         ctrlkCommandShortcut="Ctrl+Shift+E"
 *         (click)="exportCsv()">
 *   Export
 * </button>
 * ```
 */
declare class CtrlkCommandDirective implements OnInit {
    commandId: string;
    ctrlkCommandTitle: string;
    ctrlkCommandShortcut: string;
    ctrlkCommandCategory: string;
    ctrlkCommandIcon: string;
    private readonly el;
    private readonly ctrlk;
    private readonly destroyRef;
    ngOnInit(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<CtrlkCommandDirective, never>;
    static ɵdir: i0.ɵɵDirectiveDeclaration<CtrlkCommandDirective, "[ctrlkCommand]", never, { "commandId": { "alias": "ctrlkCommand"; "required": false; }; "ctrlkCommandTitle": { "alias": "ctrlkCommandTitle"; "required": false; }; "ctrlkCommandShortcut": { "alias": "ctrlkCommandShortcut"; "required": false; }; "ctrlkCommandCategory": { "alias": "ctrlkCommandCategory"; "required": false; }; "ctrlkCommandIcon": { "alias": "ctrlkCommandIcon"; "required": false; }; }, {}, never, never, true, never>;
}
/**
 * Register a form field for jump-to navigation (Ctrl+G).
 *
 * @example
 * ```html
 * <input ctrlkField="patient.name"
 *        ctrlkFieldLabel="Patient Name"
 *        ctrlkFieldSection="Demographics" />
 * ```
 */
declare class CtrlkFieldDirective implements OnInit {
    fieldId: string;
    ctrlkFieldLabel: string;
    ctrlkFieldSection: string;
    ctrlkFieldGroup: string;
    ctrlkFieldRequired: boolean;
    private readonly el;
    private readonly ctrlk;
    private readonly destroyRef;
    ngOnInit(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<CtrlkFieldDirective, never>;
    static ɵdir: i0.ɵɵDirectiveDeclaration<CtrlkFieldDirective, "[ctrlkField]", never, { "fieldId": { "alias": "ctrlkField"; "required": false; }; "ctrlkFieldLabel": { "alias": "ctrlkFieldLabel"; "required": false; }; "ctrlkFieldSection": { "alias": "ctrlkFieldSection"; "required": false; }; "ctrlkFieldGroup": { "alias": "ctrlkFieldGroup"; "required": false; }; "ctrlkFieldRequired": { "alias": "ctrlkFieldRequired"; "required": false; }; }, {}, never, never, true, never>;
}
/**
 * Bind a keyboard shortcut to a command.
 *
 * @example
 * ```html
 * <div ctrlkShortcut="Ctrl+R" ctrlkShortcutCommand="grid.refresh"></div>
 * ```
 */
declare class CtrlkShortcutDirective implements OnInit {
    shortcut: string;
    ctrlkShortcutCommand: string;
    private readonly ctrlk;
    private readonly destroyRef;
    ngOnInit(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<CtrlkShortcutDirective, never>;
    static ɵdir: i0.ɵɵDirectiveDeclaration<CtrlkShortcutDirective, "[ctrlkShortcut]", never, { "shortcut": { "alias": "ctrlkShortcut"; "required": false; }; "ctrlkShortcutCommand": { "alias": "ctrlkShortcutCommand"; "required": false; }; }, {}, never, never, true, never>;
}
/**
 * Define a focus navigation zone (F6 cycling).
 *
 * @example
 * ```html
 * <nav ctrlkZone="toolbar" ctrlkZoneLabel="Main Toolbar">...</nav>
 * <div ctrlkZone="grid" ctrlkZoneLabel="Data Grid">...</div>
 * ```
 */
declare class CtrlkZoneDirective implements OnInit {
    zoneId: string;
    ctrlkZoneLabel: string;
    private readonly el;
    private readonly ctrlk;
    ngOnInit(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<CtrlkZoneDirective, never>;
    static ɵdir: i0.ɵɵDirectiveDeclaration<CtrlkZoneDirective, "[ctrlkZone]", never, { "zoneId": { "alias": "ctrlkZone"; "required": false; }; "ctrlkZoneLabel": { "alias": "ctrlkZoneLabel"; "required": false; }; }, {}, never, never, true, never>;
}
/** Convenience array for importing all directives at once. */
declare const CTRLK_DIRECTIVES: readonly [typeof CtrlkCommandDirective, typeof CtrlkFieldDirective, typeof CtrlkShortcutDirective, typeof CtrlkZoneDirective];

/**
 * CtrlK Angular Module.
 *
 * @example Module-based (Angular 14+):
 * ```typescript
 * @NgModule({
 *   imports: [CtrlkModule.forRoot({ palette: true, density: true })],
 * })
 * export class AppModule {}
 * ```
 *
 * @example Standalone (Angular 17+):
 * ```typescript
 * @Component({
 *   standalone: true,
 *   imports: [CtrlkCommandDirective, CtrlkFieldDirective],
 * })
 * ```
 */
declare class CtrlkModule {
    static forRoot(options?: CtrlkInitOptions): ModuleWithProviders<CtrlkModule>;
    static ɵfac: i0.ɵɵFactoryDeclaration<CtrlkModule, never>;
    static ɵmod: i0.ɵɵNgModuleDeclaration<CtrlkModule, never, [typeof CtrlkCommandDirective, typeof CtrlkFieldDirective, typeof CtrlkShortcutDirective, typeof CtrlkZoneDirective], [typeof CtrlkCommandDirective, typeof CtrlkFieldDirective, typeof CtrlkShortcutDirective, typeof CtrlkZoneDirective]>;
    static ɵinj: i0.ɵɵInjectorDeclaration<CtrlkModule>;
}

export { CTRLK_DIRECTIVES, CTRLK_WINDOW, CtrlkCommandDirective, CtrlkFieldDirective, CtrlkModule, CtrlkService, CtrlkShortcutDirective, CtrlkZoneDirective };
export type { CommandDef, CommandExecutedEvent, Completeness, CtrlkInitOptions, DensityChange, FieldDef, FieldJumpRequest, FieldSearchResult, FieldSection, PaletteRequest, ShortcutsRequest, ViewLoadedEvent, ViewSavedEvent };
