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
export { CtrlkService, CTRLK_WINDOW } from './ctrlk.service';

// Types
export type {
  CtrlkInitOptions,
  CommandDef,
  PaletteRequest,
  FieldJumpRequest,
  FieldDef,
  FieldSearchResult,
  FieldSection,
  Completeness,
  DensityChange,
  ViewSavedEvent,
  ViewLoadedEvent,
  CommandExecutedEvent,
  ShortcutsRequest,
} from './ctrlk.types';

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
