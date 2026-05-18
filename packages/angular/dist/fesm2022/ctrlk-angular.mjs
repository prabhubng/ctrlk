import * as i0 from '@angular/core';
import { InjectionToken, inject, NgZone, DestroyRef, Injectable, ElementRef, Input, Directive, NgModule } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';

/**
 * Injection token for the Window object.
 * Enables SSR compatibility and unit testing with mock window.
 */
const CTRLK_WINDOW = new InjectionToken('CTRLK_WINDOW', {
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
class CtrlkService {
    zone = inject(NgZone);
    destroyRef = inject(DestroyRef);
    window = inject(CTRLK_WINDOW);
    _initialized = false;
    _ctrlk = null;
    _gridDisconnect = null;
    _cleanups = [];
    // ─── Event Streams ───
    // Each Subject bridges a ctrlk event into Angular's zone + RxJS.
    _paletteRequested = new Subject();
    _fieldJumpRequested = new Subject();
    _shortcutsRequested = new Subject();
    _densityChanged = new Subject();
    _viewSaved = new Subject();
    _viewLoaded = new Subject();
    _commandExecuted = new Subject();
    paletteRequested$ = this._paletteRequested.asObservable();
    fieldJumpRequested$ = this._fieldJumpRequested.asObservable();
    shortcutsRequested$ = this._shortcutsRequested.asObservable();
    densityChanged$ = this._densityChanged.asObservable();
    viewSaved$ = this._viewSaved.asObservable();
    viewLoaded$ = this._viewLoaded.asObservable();
    commandExecuted$ = this._commandExecuted.asObservable();
    constructor() {
        this.destroyRef.onDestroy(() => this.dispose());
    }
    // ─── Lifecycle ───
    /**
     * Initialize the headless CtrlK engine.
     * Safe to call multiple times — idempotent.
     */
    init(options = {}) {
        if (this._initialized)
            return;
        const ctrlk = this.resolveCtrlk();
        ctrlk.init(options);
        this.bridgeEvents(ctrlk);
        this._initialized = true;
    }
    /**
     * Connect a grid adapter (DevExtreme, AG Grid, etc.)
     * Auto-disconnects previous adapter. Returns disconnect function.
     */
    connectGrid(adapter) {
        this.ensureInit();
        this._gridDisconnect?.();
        this._gridDisconnect = this.resolveCtrlk().connectGrid(adapter);
        return () => this.disconnectGrid();
    }
    /** Disconnect the current grid adapter. Cleans up event subscriptions. */
    disconnectGrid() {
        this._gridDisconnect?.();
        this._gridDisconnect = null;
    }
    // ─── Commands ───
    /** Register a command. Returns unsubscribe function. */
    registerCommand(def) {
        this.ensureInit();
        const unsub = this.resolveCtrlk().commands.register(def);
        this._cleanups.push(unsub);
        return unsub;
    }
    /** Execute a command by ID. */
    executeCommand(id) {
        return this.resolveCtrlk().commands.execute(id);
    }
    /** Search commands by query string. */
    searchCommands(query) {
        return this.resolveCtrlk().commands.search(query);
    }
    /** List all registered commands, optionally filtered by category. */
    listCommands(category) {
        return this.resolveCtrlk().commands.list(category);
    }
    // ─── Shortcuts ───
    /** Bind a keyboard shortcut to a command. Returns unsubscribe function. */
    bindShortcut(shortcut, commandId) {
        this.ensureInit();
        const unsub = this.resolveCtrlk().keys.bind(shortcut, commandId);
        this._cleanups.push(unsub);
        return unsub;
    }
    // ─── Views ───
    /** Save the current view state. */
    saveView(name) {
        this.resolveCtrlk().views.save(name);
    }
    /** Load a named view. Returns true if found. */
    loadView(name) {
        return this.resolveCtrlk().views.load(name);
    }
    /** List all saved views. */
    listViews() {
        return this.resolveCtrlk().views.list();
    }
    /** Get view slots with shortcut assignments. */
    getViewSlots() {
        return this.resolveCtrlk().views.getSlots();
    }
    // ─── Fields ───
    /** Register a field for jump-to navigation. Returns unsubscribe function. */
    registerField(def) {
        this.ensureInit();
        const unsub = this.resolveCtrlk().fields.register(def);
        this._cleanups.push(unsub);
        return unsub;
    }
    /** Trigger field discovery from DOM [data-ctrlk-field] attributes. */
    discoverFields() {
        this.resolveCtrlk().fields.discover();
    }
    /** Focus a registered field by ID (scroll + highlight). */
    focusField(id) {
        this.resolveCtrlk().fields.focus(id);
    }
    /** Set custom section ordering for field jump grouped search. */
    setFieldSectionOrder(order) {
        const fields = this.resolveCtrlk().fields;
        if (fields.setSectionOrder)
            fields.setSectionOrder(order);
    }
    /** Get field completeness stats. */
    getFieldCompleteness() {
        return this.resolveCtrlk().fields.getCompleteness();
    }
    // ─── Observables ───
    /**
     * Create an RxJS Observable from any ctrlk event.
     * Automatically bridges into NgZone and cleans up on destroy.
     */
    fromEvent(eventName) {
        const subject = new Subject();
        const unsub = this.resolveCtrlk().on(eventName, (data) => {
            this.zone.run(() => subject.next(data));
        });
        this._cleanups.push(unsub);
        return subject.pipe(takeUntilDestroyed(this.destroyRef));
    }
    // ─── Direct Access ───
    /** Direct access to the ctrlk singleton (escape hatch for advanced use). */
    get instance() { return this.resolveCtrlk(); }
    get commands() { return this.resolveCtrlk().commands; }
    get keys() { return this.resolveCtrlk().keys; }
    get views() { return this.resolveCtrlk().views; }
    get fields() { return this.resolveCtrlk().fields; }
    get density() { return this.resolveCtrlk().density; }
    get selection() { return this.resolveCtrlk().selection; }
    get share() { return this.resolveCtrlk().share; }
    // ─── Internal ───
    bridgeEvents(ctrlk) {
        const bridge = (hookFn, subject) => {
            const unsub = hookFn((data) => {
                this.zone.run(() => subject.next(data));
            });
            this._cleanups.push(unsub);
        };
        bridge(ctrlk.onPaletteRequest.bind(ctrlk), this._paletteRequested);
        bridge(ctrlk.onFieldJumpRequest.bind(ctrlk), this._fieldJumpRequested);
        bridge(ctrlk.onShortcutsRequest.bind(ctrlk), this._shortcutsRequested);
        bridge(ctrlk.onDensityChange.bind(ctrlk), this._densityChanged);
        bridge(ctrlk.onViewSaved.bind(ctrlk), this._viewSaved);
        bridge(ctrlk.onViewLoaded.bind(ctrlk), this._viewLoaded);
        bridge(ctrlk.onCommandExecuted.bind(ctrlk), this._commandExecuted);
    }
    resolveCtrlk() {
        if (!this._ctrlk) {
            const win = this.window;
            if (win.ctrlk) {
                this._ctrlk = win.ctrlk;
            }
            else {
                throw new Error('[CtrlK] ctrlk not found on window. Add @ctrlk/core runtime to angular.json scripts:\n' +
                    '"scripts": ["node_modules/@ctrlk/core/dist/ctrlk.runtime.min.js"]');
            }
        }
        return this._ctrlk;
    }
    ensureInit() {
        if (!this._initialized)
            this.init();
    }
    dispose() {
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
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkService, deps: [], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkService, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkService, decorators: [{
            type: Injectable,
            args: [{ providedIn: 'root' }]
        }], ctorParameters: () => [] });

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
class CtrlkCommandDirective {
    commandId;
    ctrlkCommandTitle = '';
    ctrlkCommandShortcut = '';
    ctrlkCommandCategory = 'Actions';
    ctrlkCommandIcon = '';
    el = inject(ElementRef);
    ctrlk = inject(CtrlkService);
    destroyRef = inject(DestroyRef);
    ngOnInit() {
        const nativeEl = this.el.nativeElement;
        const title = this.ctrlkCommandTitle || nativeEl.textContent?.trim() || this.commandId;
        const teardown = this.ctrlk.registerCommand({
            id: this.commandId,
            title,
            shortcut: this.ctrlkCommandShortcut || undefined,
            category: this.ctrlkCommandCategory,
            icon: this.ctrlkCommandIcon || undefined,
            execute: () => nativeEl.click(),
        });
        this.destroyRef.onDestroy(teardown);
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkCommandDirective, deps: [], target: i0.ɵɵFactoryTarget.Directive });
    static ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "21.2.13", type: CtrlkCommandDirective, isStandalone: true, selector: "[ctrlkCommand]", inputs: { commandId: ["ctrlkCommand", "commandId"], ctrlkCommandTitle: "ctrlkCommandTitle", ctrlkCommandShortcut: "ctrlkCommandShortcut", ctrlkCommandCategory: "ctrlkCommandCategory", ctrlkCommandIcon: "ctrlkCommandIcon" }, ngImport: i0 });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkCommandDirective, decorators: [{
            type: Directive,
            args: [{ selector: '[ctrlkCommand]', standalone: true }]
        }], propDecorators: { commandId: [{
                type: Input,
                args: ['ctrlkCommand']
            }], ctrlkCommandTitle: [{
                type: Input
            }], ctrlkCommandShortcut: [{
                type: Input
            }], ctrlkCommandCategory: [{
                type: Input
            }], ctrlkCommandIcon: [{
                type: Input
            }] } });
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
class CtrlkFieldDirective {
    fieldId;
    ctrlkFieldLabel = '';
    ctrlkFieldSection = 'General';
    ctrlkFieldGroup = '';
    ctrlkFieldRequired = false;
    el = inject(ElementRef);
    ctrlk = inject(CtrlkService);
    destroyRef = inject(DestroyRef);
    ngOnInit() {
        const teardown = this.ctrlk.registerField({
            id: this.fieldId,
            label: this.ctrlkFieldLabel || this.fieldId,
            section: this.ctrlkFieldSection,
            group: this.ctrlkFieldGroup || undefined,
            element: this.el.nativeElement,
        });
        this.destroyRef.onDestroy(teardown);
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkFieldDirective, deps: [], target: i0.ɵɵFactoryTarget.Directive });
    static ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "21.2.13", type: CtrlkFieldDirective, isStandalone: true, selector: "[ctrlkField]", inputs: { fieldId: ["ctrlkField", "fieldId"], ctrlkFieldLabel: "ctrlkFieldLabel", ctrlkFieldSection: "ctrlkFieldSection", ctrlkFieldGroup: "ctrlkFieldGroup", ctrlkFieldRequired: "ctrlkFieldRequired" }, ngImport: i0 });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkFieldDirective, decorators: [{
            type: Directive,
            args: [{ selector: '[ctrlkField]', standalone: true }]
        }], propDecorators: { fieldId: [{
                type: Input,
                args: ['ctrlkField']
            }], ctrlkFieldLabel: [{
                type: Input
            }], ctrlkFieldSection: [{
                type: Input
            }], ctrlkFieldGroup: [{
                type: Input
            }], ctrlkFieldRequired: [{
                type: Input
            }] } });
/**
 * Bind a keyboard shortcut to a command.
 *
 * @example
 * ```html
 * <div ctrlkShortcut="Ctrl+R" ctrlkShortcutCommand="grid.refresh"></div>
 * ```
 */
class CtrlkShortcutDirective {
    shortcut;
    ctrlkShortcutCommand = '';
    ctrlk = inject(CtrlkService);
    destroyRef = inject(DestroyRef);
    ngOnInit() {
        if (this.shortcut && this.ctrlkShortcutCommand) {
            const teardown = this.ctrlk.bindShortcut(this.shortcut, this.ctrlkShortcutCommand);
            this.destroyRef.onDestroy(teardown);
        }
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkShortcutDirective, deps: [], target: i0.ɵɵFactoryTarget.Directive });
    static ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "21.2.13", type: CtrlkShortcutDirective, isStandalone: true, selector: "[ctrlkShortcut]", inputs: { shortcut: ["ctrlkShortcut", "shortcut"], ctrlkShortcutCommand: "ctrlkShortcutCommand" }, ngImport: i0 });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkShortcutDirective, decorators: [{
            type: Directive,
            args: [{ selector: '[ctrlkShortcut]', standalone: true }]
        }], propDecorators: { shortcut: [{
                type: Input,
                args: ['ctrlkShortcut']
            }], ctrlkShortcutCommand: [{
                type: Input
            }] } });
/**
 * Define a focus navigation zone (F6 cycling).
 *
 * @example
 * ```html
 * <nav ctrlkZone="toolbar" ctrlkZoneLabel="Main Toolbar">...</nav>
 * <div ctrlkZone="grid" ctrlkZoneLabel="Data Grid">...</div>
 * ```
 */
class CtrlkZoneDirective {
    zoneId;
    ctrlkZoneLabel = '';
    el = inject(ElementRef);
    ctrlk = inject(CtrlkService);
    ngOnInit() {
        const focus = this.ctrlk.instance?.focus;
        if (focus?.addZone) {
            focus.addZone(this.zoneId, this.el.nativeElement, { label: this.ctrlkZoneLabel });
        }
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkZoneDirective, deps: [], target: i0.ɵɵFactoryTarget.Directive });
    static ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "21.2.13", type: CtrlkZoneDirective, isStandalone: true, selector: "[ctrlkZone]", inputs: { zoneId: ["ctrlkZone", "zoneId"], ctrlkZoneLabel: "ctrlkZoneLabel" }, ngImport: i0 });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkZoneDirective, decorators: [{
            type: Directive,
            args: [{ selector: '[ctrlkZone]', standalone: true }]
        }], propDecorators: { zoneId: [{
                type: Input,
                args: ['ctrlkZone']
            }], ctrlkZoneLabel: [{
                type: Input
            }] } });
/** Convenience array for importing all directives at once. */
const CTRLK_DIRECTIVES = [
    CtrlkCommandDirective,
    CtrlkFieldDirective,
    CtrlkShortcutDirective,
    CtrlkZoneDirective,
];

const DIRECTIVES = [
    CtrlkCommandDirective,
    CtrlkFieldDirective,
    CtrlkShortcutDirective,
    CtrlkZoneDirective,
];
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
class CtrlkModule {
    static forRoot(options) {
        return {
            ngModule: CtrlkModule,
            providers: [
                {
                    provide: 'CTRLK_INIT_OPTIONS',
                    useValue: options || {},
                },
                CtrlkService,
            ],
        };
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkModule, deps: [], target: i0.ɵɵFactoryTarget.NgModule });
    static ɵmod = i0.ɵɵngDeclareNgModule({ minVersion: "14.0.0", version: "21.2.13", ngImport: i0, type: CtrlkModule, imports: [CtrlkCommandDirective,
            CtrlkFieldDirective,
            CtrlkShortcutDirective,
            CtrlkZoneDirective], exports: [CtrlkCommandDirective,
            CtrlkFieldDirective,
            CtrlkShortcutDirective,
            CtrlkZoneDirective] });
    static ɵinj = i0.ɵɵngDeclareInjector({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkModule });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.13", ngImport: i0, type: CtrlkModule, decorators: [{
            type: NgModule,
            args: [{
                    imports: DIRECTIVES,
                    exports: DIRECTIVES,
                }]
        }] });

/**
 * @ctrlk/angular — Angular adapter for the CtrlK IOUX engine.
 *
 * @example Module-based:
 * ```typescript
 * import { CtrlkModule } from '@ctrlk/angular';
 * @NgModule({ imports: [CtrlkModule.forRoot()] })
 * ```
 *
 * @example Standalone:
 * ```typescript
 * import { CtrlkService, CtrlkCommandDirective } from '@ctrlk/angular';
 * ```
 */
// Service + Window token

/**
 * Generated bundle index. Do not edit.
 */

export { CTRLK_DIRECTIVES, CTRLK_WINDOW, CtrlkCommandDirective, CtrlkFieldDirective, CtrlkModule, CtrlkService, CtrlkShortcutDirective, CtrlkZoneDirective };
//# sourceMappingURL=ctrlk-angular.mjs.map
