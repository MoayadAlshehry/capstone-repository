'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { NavigationContext } from './navigation-context';
type Validation = {
  key: string;
  actor: string;
  reviewer: boolean;
  intent: NavigationContext;
};
const Context = createContext<{
  value: Validation | null;
  set: (v: Validation) => void;
} | null>(null);
export function NavigationValidation({ children }: { children: ReactNode }) {
  const [value, set] = useState<Validation | null>(null);
  return <Context.Provider value={{ value, set }}>{children}</Context.Provider>;
}
export function useNavigationValidation() {
  return useContext(Context)?.value ?? null;
}
export function useValidatedPersonalNavigation(
  actor: string,
  reviewer: boolean,
  intent: NavigationContext,
) {
  const context = useContext(Context),
    path = usePathname(),
    query = useSearchParams(),
    key = path + (query.size ? '?' + query.toString() : ''),
    set = context?.set;
  useEffect(() => {
    set?.({ key, actor, reviewer, intent });
  }, [set, key, actor, reviewer, intent]);
}
