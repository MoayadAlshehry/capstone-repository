'use client';
import { createContext, useContext } from 'react';
export const AssistantPortal = createContext<HTMLElement | ShadowRoot | null>(
  null,
);
export const useAssistantPortal = () => useContext(AssistantPortal);
export const AssistantOverlayPortal = createContext<
  HTMLElement | ShadowRoot | null
>(null);
export const useAssistantOverlayPortal = () =>
  useContext(AssistantOverlayPortal);
