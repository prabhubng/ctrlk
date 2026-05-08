/**
 * @ctrlk/react — React Hooks for CtrlK
 */

import { ComponentType, ReactNode } from 'react';
import { CommandDef, CtrlK, Unsubscribe, PaletteRequestPayload, FieldJumpRequestPayload } from '@ctrlk/core';

// Provider
export interface CtrlKProviderProps {
  instance?: CtrlK;
  children: ReactNode;
}
export declare const CtrlKProvider: ComponentType<CtrlKProviderProps>;

// Hooks
export declare function useCtrlk(): CtrlK;

export declare function useCtrlkCommand(
  def: CommandDef,
  deps?: any[]
): void;

export declare function useCtrlkView<T = any>(
  key: string,
  defaultValue: T
): [T, (value: T) => void];

export declare function useCtrlkDensity(): 'compact' | 'comfortable' | 'spacious';

export declare function useCtrlkSelection(): [
  Set<string>,
  {
    select: (ids: string[]) => void;
    deselect: (ids: string[]) => void;
    toggle: (id: string) => void;
    clear: () => void;
  }
];

export declare function useCtrlkField(
  fieldId: string,
  options: {
    label: string;
    section?: string;
    group?: string;
    ref?: React.RefObject<HTMLElement>;
    required?: boolean;
  }
): void;

export declare function useCtrlkShortcut(
  shortcut: string,
  handler: () => void,
  deps?: any[]
): void;

export declare function useCtrlkPalette(): {
  open: boolean;
  request: PaletteRequestPayload | null;
  close: () => void;
};

export declare function useCtrlkFieldJump(): {
  open: boolean;
  request: FieldJumpRequestPayload | null;
  close: () => void;
};
