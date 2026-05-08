import * as i0 from '@angular/core';
import { OnDestroy, NgZone, OnInit, ElementRef, ModuleWithProviders } from '@angular/core';
import { Observable } from 'rxjs';

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
declare class CtrlkService implements OnDestroy {
    private zone;
    private _initialized;
    private _cleanups;
    private _ctrlk;
    private readonly _paletteRequested;
    private readonly _fieldJumpRequested;
    private readonly _densityChanged;
    private readonly _viewSaved;
    private readonly _viewLoaded;
    private readonly _commandExecuted;
    readonly paletteRequested$: Observable<PaletteRequest>;
    readonly fieldJumpRequested$: Observable<FieldJumpRequest>;
    readonly densityChanged$: Observable<DensityChange>;
    readonly viewSaved$: Observable<ViewSavedEvent>;
    readonly viewLoaded$: Observable<ViewLoadedEvent>;
    readonly commandExecuted$: Observable<CommandExecutedEvent>;
    constructor(zone: NgZone);
    /**
     * Initialize the headless CtrlK engine.
     * Safe to call multiple times — idempotent.
     */
    init(options?: CtrlkInitOptions): void;
    private _gridDisconnect;
    /**
     * Connect a grid adapter (DevExtreme, AG Grid, etc.)
     * Auto-disconnects when service is destroyed or a new grid is connected.
     */
    connectGrid(adapter: any): void;
    /**
     * Disconnect the current grid adapter. Cleans up event subscriptions.
     * Called automatically on destroy.
     */
    disconnectGrid(): void;
    /**
     * Register a command.
     * @returns Unsubscribe function
     */
    registerCommand(def: CommandDef): () => void;
    /**
     * Execute a command by ID.
     */
    executeCommand(id: string): any;
    /**
     * Search commands by query.
     */
    searchCommands(query: string): CommandDef[];
    /**
     * List all registered commands.
     */
    listCommands(category?: string): CommandDef[];
    /**
     * Bind a keyboard shortcut to a command.
     * @returns Unsubscribe function
     */
    bindShortcut(shortcut: string, commandId: string): () => void;
    /**
     * Save the current view state.
     */
    saveView(name: string): void;
    /**
     * Load a named view.
     */
    loadView(name: string): boolean;
    /**
     * List all saved views.
     */
    listViews(): any[];
    /**
     * Register a field for jump-to navigation.
     * @returns Unsubscribe function
     */
    registerField(def: {
        id: string;
        label: string;
        section?: string;
        group?: string;
        element?: HTMLElement;
    }): () => void;
    /**
     * Trigger field discovery from DOM [data-ctrlk-field] attributes.
     */
    discoverFields(): void;
    /**
     * Focus a registered field by ID.
     */
    focusField(id: string): void;
    /**
     * Get field completeness stats.
     */
    getFieldCompleteness(): {
        total: number;
        filled: number;
        empty: number;
        percent: number;
    };
    /**
     * Create an RxJS Observable from any ctrlk event.
     */
    fromEvent<T = any>(eventName: string): Observable<T>;
    /**
     * Direct access to the ctrlk instance (escape hatch).
     */
    get instance(): any;
    get commands(): any;
    get keys(): any;
    get views(): any;
    get fields(): any;
    get density(): any;
    get selection(): any;
    ngOnDestroy(): void;
    private getCtrlk;
    private ensureInit;
    static ɵfac: i0.ɵɵFactoryDeclaration<CtrlkService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<CtrlkService>;
}
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
    fields: any[];
    search: (query: string, opts?: any) => any[];
    focus: (id: string) => void;
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
declare class CtrlkCommandDirective implements OnInit, OnDestroy {
    private el;
    private ctrlk;
    commandId: string;
    ctrlkCommandTitle: string;
    ctrlkCommandShortcut: string;
    ctrlkCommandCategory: string;
    ctrlkCommandIcon: string;
    private teardown;
    constructor(el: ElementRef, ctrlk: CtrlkService);
    ngOnInit(): void;
    ngOnDestroy(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<CtrlkCommandDirective, never>;
    static ɵdir: i0.ɵɵDirectiveDeclaration<CtrlkCommandDirective, "[ctrlkCommand]", never, { "commandId": { "alias": "ctrlkCommand"; "required": false; }; "ctrlkCommandTitle": { "alias": "ctrlkCommandTitle"; "required": false; }; "ctrlkCommandShortcut": { "alias": "ctrlkCommandShortcut"; "required": false; }; "ctrlkCommandCategory": { "alias": "ctrlkCommandCategory"; "required": false; }; "ctrlkCommandIcon": { "alias": "ctrlkCommandIcon"; "required": false; }; }, {}, never, never, true, never>;
}
/**
 * Register a form field for jump-to navigation.
 *
 * @example
 * ```html
 * <input ctrlkField="patient.name"
 *        ctrlkFieldLabel="Patient Name"
 *        ctrlkFieldSection="Demographics" />
 * ```
 */
declare class CtrlkFieldDirective implements OnInit, OnDestroy {
    private el;
    private ctrlk;
    fieldId: string;
    ctrlkFieldLabel: string;
    ctrlkFieldSection: string;
    ctrlkFieldGroup: string;
    ctrlkFieldRequired: boolean;
    private teardown;
    constructor(el: ElementRef, ctrlk: CtrlkService);
    ngOnInit(): void;
    ngOnDestroy(): void;
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
declare class CtrlkShortcutDirective implements OnInit, OnDestroy {
    private ctrlk;
    shortcut: string;
    ctrlkShortcutCommand: string;
    private teardown;
    constructor(ctrlk: CtrlkService);
    ngOnInit(): void;
    ngOnDestroy(): void;
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
    private el;
    private ctrlk;
    zoneId: string;
    ctrlkZoneLabel: string;
    constructor(el: ElementRef, ctrlk: CtrlkService);
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

export { CTRLK_DIRECTIVES, CtrlkCommandDirective, CtrlkFieldDirective, CtrlkModule, CtrlkService, CtrlkShortcutDirective, CtrlkZoneDirective };
export type { CommandDef, CommandExecutedEvent, CtrlkInitOptions, DensityChange, FieldJumpRequest, PaletteRequest, ViewLoadedEvent, ViewSavedEvent };
