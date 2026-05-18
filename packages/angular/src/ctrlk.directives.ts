import { Directive, Input, ElementRef, DestroyRef, OnInit, inject } from '@angular/core';
import { CtrlkService } from './ctrlk.service';

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
@Directive({ selector: '[ctrlkCommand]', standalone: true })
export class CtrlkCommandDirective implements OnInit {
  @Input('ctrlkCommand') commandId!: string;
  @Input() ctrlkCommandTitle = '';
  @Input() ctrlkCommandShortcut = '';
  @Input() ctrlkCommandCategory = 'Actions';
  @Input() ctrlkCommandIcon = '';

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly ctrlk = inject(CtrlkService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
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
@Directive({ selector: '[ctrlkField]', standalone: true })
export class CtrlkFieldDirective implements OnInit {
  @Input('ctrlkField') fieldId!: string;
  @Input() ctrlkFieldLabel = '';
  @Input() ctrlkFieldSection = 'General';
  @Input() ctrlkFieldGroup = '';
  @Input() ctrlkFieldRequired = false;

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly ctrlk = inject(CtrlkService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    const teardown = this.ctrlk.registerField({
      id: this.fieldId,
      label: this.ctrlkFieldLabel || this.fieldId,
      section: this.ctrlkFieldSection,
      group: this.ctrlkFieldGroup || undefined,
      element: this.el.nativeElement,
    });

    this.destroyRef.onDestroy(teardown);
  }
}

/**
 * Bind a keyboard shortcut to a command.
 *
 * @example
 * ```html
 * <div ctrlkShortcut="Ctrl+R" ctrlkShortcutCommand="grid.refresh"></div>
 * ```
 */
@Directive({ selector: '[ctrlkShortcut]', standalone: true })
export class CtrlkShortcutDirective implements OnInit {
  @Input('ctrlkShortcut') shortcut!: string;
  @Input() ctrlkShortcutCommand = '';

  private readonly ctrlk = inject(CtrlkService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    if (this.shortcut && this.ctrlkShortcutCommand) {
      const teardown = this.ctrlk.bindShortcut(this.shortcut, this.ctrlkShortcutCommand);
      this.destroyRef.onDestroy(teardown);
    }
  }
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
@Directive({ selector: '[ctrlkZone]', standalone: true })
export class CtrlkZoneDirective implements OnInit {
  @Input('ctrlkZone') zoneId!: string;
  @Input() ctrlkZoneLabel = '';

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly ctrlk = inject(CtrlkService);

  ngOnInit(): void {
    const focus = this.ctrlk.instance?.focus;
    if (focus?.addZone) {
      focus.addZone(this.zoneId, this.el.nativeElement, { label: this.ctrlkZoneLabel });
    }
  }
}

/** Convenience array for importing all directives at once. */
export const CTRLK_DIRECTIVES = [
  CtrlkCommandDirective,
  CtrlkFieldDirective,
  CtrlkShortcutDirective,
  CtrlkZoneDirective,
] as const;
