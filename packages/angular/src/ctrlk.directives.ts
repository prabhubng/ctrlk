import { Directive, Input, ElementRef, OnInit, OnDestroy } from '@angular/core';
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
export class CtrlkCommandDirective implements OnInit, OnDestroy {
  @Input('ctrlkCommand') commandId!: string;
  @Input() ctrlkCommandTitle = '';
  @Input() ctrlkCommandShortcut = '';
  @Input() ctrlkCommandCategory = 'Actions';
  @Input() ctrlkCommandIcon = '';

  private teardown: (() => void) | null = null;

  constructor(private el: ElementRef, private ctrlk: CtrlkService) {}

  ngOnInit(): void {
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

  ngOnDestroy(): void {
    this.teardown?.();
  }
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
@Directive({ selector: '[ctrlkField]', standalone: true })
export class CtrlkFieldDirective implements OnInit, OnDestroy {
  @Input('ctrlkField') fieldId!: string;
  @Input() ctrlkFieldLabel = '';
  @Input() ctrlkFieldSection = 'General';
  @Input() ctrlkFieldGroup = '';
  @Input() ctrlkFieldRequired = false;

  private teardown: (() => void) | null = null;

  constructor(private el: ElementRef, private ctrlk: CtrlkService) {}

  ngOnInit(): void {
    this.teardown = this.ctrlk.registerField({
      id: this.fieldId,
      label: this.ctrlkFieldLabel || this.fieldId,
      section: this.ctrlkFieldSection,
      group: this.ctrlkFieldGroup || undefined,
      element: this.el.nativeElement,
    });
  }

  ngOnDestroy(): void {
    this.teardown?.();
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
export class CtrlkShortcutDirective implements OnInit, OnDestroy {
  @Input('ctrlkShortcut') shortcut!: string;
  @Input() ctrlkShortcutCommand = '';

  private teardown: (() => void) | null = null;

  constructor(private ctrlk: CtrlkService) {}

  ngOnInit(): void {
    if (this.shortcut && this.ctrlkShortcutCommand) {
      this.teardown = this.ctrlk.bindShortcut(this.shortcut, this.ctrlkShortcutCommand);
    }
  }

  ngOnDestroy(): void {
    this.teardown?.();
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

  constructor(private el: ElementRef, private ctrlk: CtrlkService) {}

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
