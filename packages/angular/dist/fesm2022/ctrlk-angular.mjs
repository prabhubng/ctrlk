import * as i0 from '@angular/core';
import { Injectable, Input, Directive, NgModule } from '@angular/core';
import { Subject } from 'rxjs';

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
class CtrlkService {
    zone;
    _initialized = false;
    _cleanups = [];
    // Lazy-load ctrlk to avoid SSR issues
    _ctrlk = null;
    // RxJS bridges for Angular change detection
    _paletteRequested = new Subject();
    _fieldJumpRequested = new Subject();
    _densityChanged = new Subject();
    _viewSaved = new Subject();
    _viewLoaded = new Subject();
    _commandExecuted = new Subject();
    paletteRequested$ = this._paletteRequested.asObservable();
    fieldJumpRequested$ = this._fieldJumpRequested.asObservable();
    densityChanged$ = this._densityChanged.asObservable();
    viewSaved$ = this._viewSaved.asObservable();
    viewLoaded$ = this._viewLoaded.asObservable();
    commandExecuted$ = this._commandExecuted.asObservable();
    constructor(zone) {
        this.zone = zone;
    }
    /**
     * Initialize the headless CtrlK engine.
     * Safe to call multiple times — idempotent.
     */
    init(options = {}) {
        if (this._initialized)
            return;
        const ctrlk = this.getCtrlk();
        ctrlk.init(options);
        // Bridge events into Angular zone + RxJS
        this._cleanups.push(ctrlk.onPaletteRequest((data) => {
            this.zone.run(() => this._paletteRequested.next(data));
        }), ctrlk.onFieldJumpRequest((data) => {
            this.zone.run(() => this._fieldJumpRequested.next(data));
        }), ctrlk.onDensityChange((data) => {
            this.zone.run(() => this._densityChanged.next(data));
        }), ctrlk.onViewSaved((data) => {
            this.zone.run(() => this._viewSaved.next(data));
        }), ctrlk.onViewLoaded((data) => {
            this.zone.run(() => this._viewLoaded.next(data));
        }), ctrlk.onCommandExecuted((data) => {
            this.zone.run(() => this._commandExecuted.next(data));
        }));
        this._initialized = true;
    }
    _gridDisconnect = null;
    /**
     * Connect a grid adapter (DevExtreme, AG Grid, etc.)
     * Auto-disconnects when service is destroyed or a new grid is connected.
     */
    connectGrid(adapter) {
        this.ensureInit();
        this._gridDisconnect = this.getCtrlk().connectGrid(adapter);
    }
    /**
     * Disconnect the current grid adapter. Cleans up event subscriptions.
     * Called automatically on destroy.
     */
    disconnectGrid() {
        this._gridDisconnect?.();
        this._gridDisconnect = null;
    }
    /**
     * Register a command.
     * @returns Unsubscribe function
     */
    registerCommand(def) {
        this.ensureInit();
        return this.getCtrlk().commands.register(def);
    }
    /**
     * Execute a command by ID.
     */
    executeCommand(id) {
        return this.getCtrlk().commands.execute(id);
    }
    /**
     * Search commands by query.
     */
    searchCommands(query) {
        return this.getCtrlk().commands.search(query);
    }
    /**
     * List all registered commands.
     */
    listCommands(category) {
        return this.getCtrlk().commands.list(category);
    }
    /**
     * Bind a keyboard shortcut to a command.
     * @returns Unsubscribe function
     */
    bindShortcut(shortcut, commandId) {
        this.ensureInit();
        return this.getCtrlk().keys.bind(shortcut, commandId);
    }
    /**
     * Save the current view state.
     */
    saveView(name) {
        this.getCtrlk().views.save(name);
    }
    /**
     * Load a named view.
     */
    loadView(name) {
        return this.getCtrlk().views.load(name);
    }
    /**
     * List all saved views.
     */
    listViews() {
        return this.getCtrlk().views.list();
    }
    /**
     * Register a field for jump-to navigation.
     * @returns Unsubscribe function
     */
    registerField(def) {
        this.ensureInit();
        return this.getCtrlk().fields.register(def);
    }
    /**
     * Trigger field discovery from DOM [data-ctrlk-field] attributes.
     */
    discoverFields() {
        this.getCtrlk().fields.discover();
    }
    /**
     * Focus a registered field by ID.
     */
    focusField(id) {
        this.getCtrlk().fields.focus(id);
    }
    /**
     * Get field completeness stats.
     */
    getFieldCompleteness() {
        return this.getCtrlk().fields.getCompleteness();
    }
    /**
     * Create an RxJS Observable from any ctrlk event.
     */
    fromEvent(eventName) {
        const subject = new Subject();
        const unsub = this.getCtrlk().on(eventName, (data) => {
            this.zone.run(() => subject.next(data));
        });
        this._cleanups.push(unsub);
        return subject.asObservable();
    }
    /**
     * Direct access to the ctrlk instance (escape hatch).
     */
    get instance() {
        return this.getCtrlk();
    }
    get commands() { return this.getCtrlk().commands; }
    get keys() { return this.getCtrlk().keys; }
    get views() { return this.getCtrlk().views; }
    get fields() { return this.getCtrlk().fields; }
    get density() { return this.getCtrlk().density; }
    get selection() { return this.getCtrlk().selection; }
    ngOnDestroy() {
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
    getCtrlk() {
        if (!this._ctrlk) {
            // CtrlK is loaded via angular.json scripts array or global import
            const win = (typeof window !== 'undefined' ? window : {});
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
        if (!this._initialized) {
            this.init();
        }
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkService, deps: [{ token: i0.NgZone }], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkService, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkService, decorators: [{
            type: Injectable,
            args: [{ providedIn: 'root' }]
        }], ctorParameters: () => [{ type: i0.NgZone }] });

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
    el;
    ctrlk;
    commandId;
    ctrlkCommandTitle = '';
    ctrlkCommandShortcut = '';
    ctrlkCommandCategory = 'Actions';
    ctrlkCommandIcon = '';
    teardown = null;
    constructor(el, ctrlk) {
        this.el = el;
        this.ctrlk = ctrlk;
    }
    ngOnInit() {
        const title = this.ctrlkCommandTitle || this.el.nativeElement.textContent?.trim() || this.commandId;
        this.teardown = this.ctrlk.registerCommand({
            id: this.commandId,
            title,
            shortcut: this.ctrlkCommandShortcut || undefined,
            category: this.ctrlkCommandCategory,
            icon: this.ctrlkCommandIcon || undefined,
            execute: () => this.el.nativeElement.click(),
        });
    }
    ngOnDestroy() {
        this.teardown?.();
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkCommandDirective, deps: [{ token: i0.ElementRef }, { token: CtrlkService }], target: i0.ɵɵFactoryTarget.Directive });
    static ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "21.2.12", type: CtrlkCommandDirective, isStandalone: true, selector: "[ctrlkCommand]", inputs: { commandId: ["ctrlkCommand", "commandId"], ctrlkCommandTitle: "ctrlkCommandTitle", ctrlkCommandShortcut: "ctrlkCommandShortcut", ctrlkCommandCategory: "ctrlkCommandCategory", ctrlkCommandIcon: "ctrlkCommandIcon" }, ngImport: i0 });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkCommandDirective, decorators: [{
            type: Directive,
            args: [{ selector: '[ctrlkCommand]', standalone: true }]
        }], ctorParameters: () => [{ type: i0.ElementRef }, { type: CtrlkService }], propDecorators: { commandId: [{
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
 * Register a form field for jump-to navigation.
 *
 * @example
 * ```html
 * <input ctrlkField="patient.name"
 *        ctrlkFieldLabel="Patient Name"
 *        ctrlkFieldSection="Demographics" />
 * ```
 */
class CtrlkFieldDirective {
    el;
    ctrlk;
    fieldId;
    ctrlkFieldLabel = '';
    ctrlkFieldSection = 'General';
    ctrlkFieldGroup = '';
    ctrlkFieldRequired = false;
    teardown = null;
    constructor(el, ctrlk) {
        this.el = el;
        this.ctrlk = ctrlk;
    }
    ngOnInit() {
        this.teardown = this.ctrlk.registerField({
            id: this.fieldId,
            label: this.ctrlkFieldLabel || this.fieldId,
            section: this.ctrlkFieldSection,
            group: this.ctrlkFieldGroup || undefined,
            element: this.el.nativeElement,
        });
    }
    ngOnDestroy() {
        this.teardown?.();
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkFieldDirective, deps: [{ token: i0.ElementRef }, { token: CtrlkService }], target: i0.ɵɵFactoryTarget.Directive });
    static ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "21.2.12", type: CtrlkFieldDirective, isStandalone: true, selector: "[ctrlkField]", inputs: { fieldId: ["ctrlkField", "fieldId"], ctrlkFieldLabel: "ctrlkFieldLabel", ctrlkFieldSection: "ctrlkFieldSection", ctrlkFieldGroup: "ctrlkFieldGroup", ctrlkFieldRequired: "ctrlkFieldRequired" }, ngImport: i0 });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkFieldDirective, decorators: [{
            type: Directive,
            args: [{ selector: '[ctrlkField]', standalone: true }]
        }], ctorParameters: () => [{ type: i0.ElementRef }, { type: CtrlkService }], propDecorators: { fieldId: [{
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
    ctrlk;
    shortcut;
    ctrlkShortcutCommand = '';
    teardown = null;
    constructor(ctrlk) {
        this.ctrlk = ctrlk;
    }
    ngOnInit() {
        if (this.shortcut && this.ctrlkShortcutCommand) {
            this.teardown = this.ctrlk.bindShortcut(this.shortcut, this.ctrlkShortcutCommand);
        }
    }
    ngOnDestroy() {
        this.teardown?.();
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkShortcutDirective, deps: [{ token: CtrlkService }], target: i0.ɵɵFactoryTarget.Directive });
    static ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "21.2.12", type: CtrlkShortcutDirective, isStandalone: true, selector: "[ctrlkShortcut]", inputs: { shortcut: ["ctrlkShortcut", "shortcut"], ctrlkShortcutCommand: "ctrlkShortcutCommand" }, ngImport: i0 });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkShortcutDirective, decorators: [{
            type: Directive,
            args: [{ selector: '[ctrlkShortcut]', standalone: true }]
        }], ctorParameters: () => [{ type: CtrlkService }], propDecorators: { shortcut: [{
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
    el;
    ctrlk;
    zoneId;
    ctrlkZoneLabel = '';
    constructor(el, ctrlk) {
        this.el = el;
        this.ctrlk = ctrlk;
    }
    ngOnInit() {
        const focus = this.ctrlk.instance?.focus;
        if (focus?.addZone) {
            focus.addZone(this.zoneId, this.el.nativeElement, { label: this.ctrlkZoneLabel });
        }
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkZoneDirective, deps: [{ token: i0.ElementRef }, { token: CtrlkService }], target: i0.ɵɵFactoryTarget.Directive });
    static ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "21.2.12", type: CtrlkZoneDirective, isStandalone: true, selector: "[ctrlkZone]", inputs: { zoneId: ["ctrlkZone", "zoneId"], ctrlkZoneLabel: "ctrlkZoneLabel" }, ngImport: i0 });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkZoneDirective, decorators: [{
            type: Directive,
            args: [{ selector: '[ctrlkZone]', standalone: true }]
        }], ctorParameters: () => [{ type: i0.ElementRef }, { type: CtrlkService }], propDecorators: { zoneId: [{
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
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkModule, deps: [], target: i0.ɵɵFactoryTarget.NgModule });
    static ɵmod = i0.ɵɵngDeclareNgModule({ minVersion: "14.0.0", version: "21.2.12", ngImport: i0, type: CtrlkModule, imports: [CtrlkCommandDirective,
            CtrlkFieldDirective,
            CtrlkShortcutDirective,
            CtrlkZoneDirective], exports: [CtrlkCommandDirective,
            CtrlkFieldDirective,
            CtrlkShortcutDirective,
            CtrlkZoneDirective] });
    static ɵinj = i0.ɵɵngDeclareInjector({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkModule });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "21.2.12", ngImport: i0, type: CtrlkModule, decorators: [{
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
// Service

/**
 * Generated bundle index. Do not edit.
 */

export { CTRLK_DIRECTIVES, CtrlkCommandDirective, CtrlkFieldDirective, CtrlkModule, CtrlkService, CtrlkShortcutDirective, CtrlkZoneDirective };
//# sourceMappingURL=ctrlk-angular.mjs.map
