'use client';
import { createContext, useContext } from 'react';
import type {
  AILocale,
  AIProjectRef,
  AIPanelKind,
  AISnapshot,
  AIEffort,
} from './types';
export type Selection = {
  kind: AIPanelKind;
  project?: AIProjectRef;
  query?: string;
  cached?: AISnapshot;
  serial: number;
};
export type System = {
  enabled: boolean;
  locale: AILocale;
  mode: AIEffort;
  setMode: (value: AIEffort) => void;
  open: (
    kind: AIPanelKind,
    project?: AIProjectRef,
    query?: string,
    cached?: AISnapshot,
  ) => void;
  close: () => void;
  isOpen: boolean;
  registerProject: (project: AIProjectRef) => void;
};
export const SystemContext = createContext<System>({
  enabled: false,
  locale: 'en',
  mode: 'balanced',
  setMode: () => undefined,
  open: () => undefined,
  close: () => undefined,
  isOpen: false,
  registerProject: () => undefined,
});
export const useAISystem = () => useContext(SystemContext);
