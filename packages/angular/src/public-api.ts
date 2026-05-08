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
export { CtrlkService } from './ctrlk.service';
export type {
  CtrlkInitOptions,
  CommandDef,
  PaletteRequest,
  FieldJumpRequest,
  DensityChange,
  ViewSavedEvent,
  ViewLoadedEvent,
  CommandExecutedEvent,
} from './ctrlk.service';

// Directives
export {
  CtrlkCommandDirective,
  CtrlkFieldDirective,
  CtrlkShortcutDirective,
  CtrlkZoneDirective,
  CTRLK_DIRECTIVES,
} from './ctrlk.directives';

// Module
export { CtrlkModule } from './ctrlk.module';
