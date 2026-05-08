import { NgModule, ModuleWithProviders } from '@angular/core';
import { CtrlkService, CtrlkInitOptions } from './ctrlk.service';
import {
  CtrlkCommandDirective,
  CtrlkFieldDirective,
  CtrlkShortcutDirective,
  CtrlkZoneDirective,
} from './ctrlk.directives';

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
@NgModule({
  imports: DIRECTIVES,
  exports: DIRECTIVES,
})
export class CtrlkModule {
  static forRoot(options?: CtrlkInitOptions): ModuleWithProviders<CtrlkModule> {
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
}
