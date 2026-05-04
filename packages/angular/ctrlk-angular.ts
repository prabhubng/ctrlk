/**
 * CtrlK Angular Adapter
 * ──────────────────────────────────────────────
 * Services, directives, and decorators for Angular integration (Pattern C).
 * 
 * Usage in AppModule:
 *   import { CtrlKModule } from '@ctrlk/angular';
 * 
 *   @NgModule({
 *     imports: [CtrlKModule.forRoot({ debug: false })],
 *   })
 *   export class AppModule {}
 * 
 * Usage in standalone components (Angular 17+):
 *   @Component({
 *     imports: [CtrlKDirectives],
 *   })
 * 
 * @module @ctrlk/angular
 * @author Neural Weaves Pvt Ltd
 */

// ═══════════════════════════════════════════════
// SERVICE — Injectable CtrlK wrapper
// ═══════════════════════════════════════════════

/**
 * @Injectable({ providedIn: 'root' })
 * 
 * Primary service — wraps the ctrlk runtime in an Angular-friendly API.
 * Exposes all modules as typed properties with Observable wrappers.
 * 
 * Usage in a component:
 *   constructor(private ctrlk: CtrlKService) {}
 *   
 *   ngOnInit() {
 *     this.ctrlk.commands.register({
 *       id: 'grid.refresh',
 *       title: 'Refresh Data',
 *       execute: () => this.refresh(),
 *     });
 *   }
 */
export class CtrlKService {
  // NOTE: This is a conceptual implementation.
  // Real Angular code requires @Injectable decorator and Angular's DI system.
  // This file serves as the specification for the Angular adapter.

  constructor() {
    // Access the global ctrlk instance or create one
    this._ctrlk = typeof window !== 'undefined' ? window.ctrlk : null;
    this._subscriptions = [];
  }

  /** Direct access to ctrlk modules */
  get commands() { return this._ctrlk?.commands; }
  get keys() { return this._ctrlk?.keys; }
  get views() { return this._ctrlk?.views; }
  get selection() { return this._ctrlk?.selection; }
  get fields() { return this._ctrlk?.fields; }
  get density() { return this._ctrlk?.density; }
  get bus() { return this._ctrlk?.bus; }

  /**
   * Register a command (auto-unregisters when caller is destroyed).
   * 
   * Usage in component:
   *   private unregister = this.ctrlk.registerCommand({
   *     id: 'report.generate', title: 'Generate Report',
   *     shortcut: 'Ctrl+Shift+R',
   *     execute: () => this.generateReport(),
   *   });
   *   
   *   ngOnDestroy() { this.unregister(); }
   */
  registerCommand(def) {
    const unregCmd = this._ctrlk.commands.register(def);
    let unbindKey;
    if (def.shortcut) {
      unbindKey = this._ctrlk.keys.bind(def.shortcut, def.id, {
        scope: def.scope || 'global',
      });
    }
    return () => {
      unregCmd();
      unbindKey?.();
    };
  }

  /**
   * Register a view state provider.
   * 
   * Usage:
   *   this.ctrlk.registerViewProvider('sidebar', {
   *     capture: () => ({ collapsed: this.collapsed, tab: this.activeTab }),
   *     restore: (state) => { this.collapsed = state.collapsed; this.activeTab = state.tab; },
   *   });
   */
  registerViewProvider(key, provider) {
    return this._ctrlk.views.registerProvider(key, provider);
  }

  /**
   * Register a field.
   *   this.ctrlk.registerField({
   *     id: 'patient.name', label: 'Patient Name',
   *     section: 'Demographics', editable: true,
   *     element: this.nameFieldRef.nativeElement,
   *     getValue: () => this.patient.name,
   *     setValue: (v) => { this.patient.name = v; },
   *   });
   */
  registerField(def) {
    return this._ctrlk.fields.register(def);
  }

  /**
   * Subscribe to a ctrlk event.
   * Returns an RxJS-compatible object with unsubscribe.
   * 
   * Usage:
   *   this.ctrlk.on('density:changed', ({ level }) => {
   *     this.densityLevel = level;
   *     this.cdr.detectChanges();
   *   });
   */
  on(event, handler) {
    const unsub = this._ctrlk.bus.on(event, handler);
    this._subscriptions.push(unsub);
    return { unsubscribe: unsub };
  }

  /**
   * Create an RxJS Observable from a ctrlk event.
   * 
   * Usage:
   *   this.ctrlk.on$('selection:changed').pipe(
   *     map(e => e.count),
   *     distinctUntilChanged(),
   *   ).subscribe(count => this.selectionCount = count);
   */
  on$(event) {
    // Returns an Observable-like object for demonstration
    // Real implementation would use: new Observable(subscriber => { ... })
    return {
      subscribe: (handler) => {
        const unsub = this._ctrlk.bus.on(event, handler);
        this._subscriptions.push(unsub);
        return { unsubscribe: unsub };
      },
    };
  }

  /**
   * Clean up all subscriptions (call in module/service destroy).
   */
  destroy() {
    for (const unsub of this._subscriptions) {
      try { unsub(); } catch (e) { /* silent */ }
    }
    this._subscriptions = [];
  }
}


// ═══════════════════════════════════════════════
// DIRECTIVES — Declarative template integration
// ═══════════════════════════════════════════════

/**
 * Directive specifications for the Angular adapter.
 * These are implemented as Angular directives using @Directive decorator.
 * Below is the specification / pseudocode for each.
 */

/**
 * [ctrlkScope] Directive
 * ──────────────────────────────────────────────
 * Declares a keyboard shortcut scope on a DOM element.
 * 
 * Usage:
 *   <div ctrlkScope="grid" [ctrlkScopeParent]="'main'">
 *     <!-- shortcuts inside here have 'grid' scope -->
 *   </div>
 * 
 * Implementation:
 *   @Directive({ selector: '[ctrlkScope]' })
 *   export class CtrlKScopeDirective implements OnInit, OnDestroy {
 *     @Input('ctrlkScope') scopeId: string;
 *     @Input() ctrlkScopeParent: string = 'global';
 *     
 *     constructor(private el: ElementRef, private ctrlk: CtrlKService) {}
 *     
 *     ngOnInit() {
 *       this.el.nativeElement.setAttribute('data-ctrlk-scope', this.scopeId);
 *       this.ctrlk.keys.registerScope(this.scopeId, {
 *         element: this.el.nativeElement,
 *         parent: this.ctrlkScopeParent,
 *       });
 *     }
 *   }
 */
export const CtrlKScopeDirectiveSpec = {
  selector: '[ctrlkScope]',
  inputs: ['ctrlkScope:scopeId', 'ctrlkScopeParent:parent'],
  description: 'Declares a keyboard shortcut scope on the host element.',
};

/**
 * [ctrlkField] Directive
 * ──────────────────────────────────────────────
 * Registers a field for navigation, search, and dirty tracking.
 * 
 * Usage:
 *   <input 
 *     ctrlkField="patient.name"
 *     ctrlkFieldLabel="Patient Name"
 *     ctrlkFieldSection="Demographics"
 *     [(ngModel)]="patient.name"
 *   />
 * 
 * Or with a wrapper element:
 *   <div ctrlkField="ratings.moodys" ctrlkFieldLabel="Moody's Rating" ctrlkFieldSection="Ratings">
 *     <app-rating-badge [value]="moodysRating" />
 *   </div>
 * 
 * Implementation:
 *   @Directive({ selector: '[ctrlkField]' })
 *   export class CtrlKFieldDirective implements OnInit, OnDestroy, OnChanges {
 *     @Input('ctrlkField') fieldId: string;
 *     @Input() ctrlkFieldLabel: string;
 *     @Input() ctrlkFieldSection: string = 'General';
 *     @Input() ctrlkFieldEditable: boolean = true;
 *     @Input() ctrlkFieldRequired: boolean = false;
 *     @Input() ctrlkFieldValue: any;
 *     
 *     private unregister: Function;
 *     
 *     constructor(private el: ElementRef, private ctrlk: CtrlKService) {}
 *     
 *     ngOnInit() {
 *       this.unregister = this.ctrlk.registerField({
 *         id: this.fieldId,
 *         label: this.ctrlkFieldLabel || this.fieldId,
 *         section: this.ctrlkFieldSection,
 *         element: this.el.nativeElement,
 *         editable: this.ctrlkFieldEditable,
 *         required: this.ctrlkFieldRequired,
 *         value: this.ctrlkFieldValue,
 *       });
 *     }
 *     
 *     ngOnChanges(changes) {
 *       if (changes.ctrlkFieldValue) {
 *         this.ctrlk.fields.markDirty(this.fieldId, changes.ctrlkFieldValue.currentValue);
 *       }
 *     }
 *     
 *     ngOnDestroy() { this.unregister?.(); }
 *   }
 */
export const CtrlKFieldDirectiveSpec = {
  selector: '[ctrlkField]',
  inputs: ['ctrlkField:fieldId', 'ctrlkFieldLabel', 'ctrlkFieldSection', 'ctrlkFieldEditable', 'ctrlkFieldRequired', 'ctrlkFieldValue'],
  description: 'Registers a field for jump-to-field navigation, dirty tracking, and edit mode.',
};

/**
 * [ctrlkCommand] Directive
 * ──────────────────────────────────────────────
 * Registers a command from a template element (button, link, etc.)
 * 
 * Usage:
 *   <button 
 *     ctrlkCommand="export.csv"
 *     ctrlkCommandTitle="Export to CSV"
 *     ctrlkCommandShortcut="Ctrl+Shift+E"
 *     ctrlkCommandCategory="Export"
 *     (click)="exportCsv()"
 *   >Export CSV</button>
 * 
 * Implementation:
 *   @Directive({ selector: '[ctrlkCommand]' })
 *   export class CtrlKCommandDirective implements OnInit, OnDestroy {
 *     @Input('ctrlkCommand') commandId: string;
 *     @Input() ctrlkCommandTitle: string;
 *     @Input() ctrlkCommandShortcut: string;
 *     @Input() ctrlkCommandCategory: string = 'Actions';
 *     @Input() ctrlkCommandIcon: string;
 *     
 *     private unregister: Function;
 *     
 *     constructor(private el: ElementRef, private ctrlk: CtrlKService) {}
 *     
 *     ngOnInit() {
 *       this.unregister = this.ctrlk.registerCommand({
 *         id: this.commandId,
 *         title: this.ctrlkCommandTitle || this.el.nativeElement.textContent?.trim(),
 *         category: this.ctrlkCommandCategory,
 *         icon: this.ctrlkCommandIcon,
 *         shortcut: this.ctrlkCommandShortcut,
 *         execute: () => this.el.nativeElement.click(),
 *       });
 *     }
 *     
 *     ngOnDestroy() { this.unregister?.(); }
 *   }
 */
export const CtrlKCommandDirectiveSpec = {
  selector: '[ctrlkCommand]',
  inputs: ['ctrlkCommand:commandId', 'ctrlkCommandTitle', 'ctrlkCommandShortcut', 'ctrlkCommandCategory', 'ctrlkCommandIcon'],
  description: 'Registers a command from a template element.',
};

/**
 * [ctrlkDensity] Directive
 * ──────────────────────────────────────────────
 * Marks an element as density-aware. Applies density CSS classes.
 * 
 * Usage:
 *   <div ctrlkDensity>
 *     <!-- this element and children respond to density changes -->
 *   </div>
 * 
 *   <table ctrlkDensity [ctrlkDensityCompact]="{ fontSize: '11px', rowHeight: '24px' }">
 *     <!-- custom compact overrides for this specific table -->
 *   </table>
 */
export const CtrlKDensityDirectiveSpec = {
  selector: '[ctrlkDensity]',
  inputs: ['ctrlkDensityCompact', 'ctrlkDensityComfortable', 'ctrlkDensitySpacious'],
  description: 'Marks an element as density-aware with optional per-element overrides.',
};


// ═══════════════════════════════════════════════
// MODULE — NgModule for import
// ═══════════════════════════════════════════════

/**
 * Module specification:
 * 
 *   @NgModule({
 *     declarations: [
 *       CtrlKScopeDirective,
 *       CtrlKFieldDirective,
 *       CtrlKCommandDirective,
 *       CtrlKDensityDirective,
 *     ],
 *     exports: [
 *       CtrlKScopeDirective,
 *       CtrlKFieldDirective,
 *       CtrlKCommandDirective,
 *       CtrlKDensityDirective,
 *     ],
 *     providers: [CtrlKService],
 *   })
 *   export class CtrlKModule {
 *     static forRoot(config?: CtrlKConfig): ModuleWithProviders<CtrlKModule> {
 *       return {
 *         ngModule: CtrlKModule,
 *         providers: [
 *           { provide: CTRLK_CONFIG, useValue: config },
 *           CtrlKService,
 *         ],
 *       };
 *     }
 *   }
 * 
 * Standalone directives (Angular 17+):
 *   export const CtrlKDirectives = [
 *     CtrlKScopeDirective,
 *     CtrlKFieldDirective,
 *     CtrlKCommandDirective,
 *     CtrlKDensityDirective,
 *   ];
 */
export const CtrlKModuleSpec = {
  directives: ['CtrlKScopeDirective', 'CtrlKFieldDirective', 'CtrlKCommandDirective', 'CtrlKDensityDirective'],
  services: ['CtrlKService'],
  description: 'Import via CtrlKModule.forRoot() or standalone CtrlKDirectives array.',
};


// ═══════════════════════════════════════════════
// USAGE EXAMPLES — Real-world Angular patterns
// ═══════════════════════════════════════════════

/**
 * EXAMPLE 1: Component with commands and view state
 * 
 *   @Component({
 *     selector: 'app-surveillance-grid',
 *     template: `
 *       <div ctrlkScope="grid">
 *         <div class="toolbar">
 *           <button ctrlkCommand="grid.refresh" 
 *                   ctrlkCommandTitle="Refresh" 
 *                   ctrlkCommandShortcut="Ctrl+R"
 *                   (click)="refresh()">
 *             Refresh
 *           </button>
 *           <span>{{ selectionCount }} selected</span>
 *           <span>View: {{ activeView }}</span>
 *         </div>
 *         <ag-grid-angular 
 *           [rowData]="rowData" 
 *           [columnDefs]="columnDefs"
 *           (gridReady)="onGridReady($event)"
 *         />
 *       </div>
 *     `,
 *   })
 *   export class SurveillanceGridComponent implements OnInit, OnDestroy {
 *     private cleanups: Function[] = [];
 *     selectionCount = 0;
 *     activeView = '';
 *     
 *     constructor(private ctrlk: CtrlKService) {}
 *     
 *     onGridReady(params) {
 *       const adapter = new AgGridAdapter(params.api, { rowIdField: 'loanId' });
 *       this.ctrlk.views.setGridAdapter(adapter);
 *       this.ctrlk.selection.setGridAdapter(adapter);
 *       
 *       // Auto-restore last view state
 *       this.ctrlk.views.autoRestore();
 *     }
 *     
 *     ngOnInit() {
 *       this.cleanups.push(
 *         this.ctrlk.on('selection:changed', ({ count }) => {
 *           this.selectionCount = count;
 *         }).unsubscribe
 *       );
 *       
 *       this.cleanups.push(
 *         this.ctrlk.registerCommand({
 *           id: 'view.save', title: 'Save Current View',
 *           shortcut: 'Ctrl+Shift+S',
 *           execute: () => {
 *             const name = prompt('View name:');
 *             if (name) this.ctrlk.views.save(name);
 *           },
 *         })
 *       );
 *     }
 *     
 *     ngOnDestroy() {
 *       this.cleanups.forEach(fn => fn());
 *     }
 *   }
 * 
 * 
 * EXAMPLE 2: Detail page with field registration
 * 
 *   @Component({
 *     selector: 'app-patient-detail',
 *     template: `
 *       <div ctrlkScope="patient-detail">
 *         <section data-ctrlk-section="Demographics">
 *           <input ctrlkField="patient.name"
 *                  ctrlkFieldLabel="Patient Name"
 *                  ctrlkFieldSection="Demographics"
 *                  [ctrlkFieldValue]="patient.name"
 *                  [(ngModel)]="patient.name" />
 *           
 *           <input ctrlkField="patient.dob"
 *                  ctrlkFieldLabel="Date of Birth"
 *                  ctrlkFieldSection="Demographics"
 *                  ctrlkFieldRequired="true"
 *                  [ctrlkFieldValue]="patient.dob"
 *                  [(ngModel)]="patient.dob" />
 *         </section>
 *         
 *         <section data-ctrlk-section="Vitals">
 *           <input ctrlkField="vitals.bp"
 *                  ctrlkFieldLabel="Blood Pressure"
 *                  ctrlkFieldSection="Vitals"
 *                  [ctrlkFieldValue]="vitals.bp"
 *                  [(ngModel)]="vitals.bp" />
 *         </section>
 *         
 *         <div class="status-bar">
 *           {{ ctrlk.fields.getDirtyCount() }} unsaved changes
 *           | {{ ctrlk.fields.getCompleteness().percent }}% complete
 *         </div>
 *       </div>
 *     `,
 *   })
 *   export class PatientDetailComponent { ... }
 */
