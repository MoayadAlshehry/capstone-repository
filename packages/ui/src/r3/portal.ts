'use client';
import { createContext, useContext } from 'react';
export const PortalContext = createContext<HTMLElement | null>(null);
export const usePortal = () => useContext(PortalContext);
