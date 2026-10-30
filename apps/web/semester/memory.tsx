'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
type Memory = Record<string, string>;
type Vault = { actor: string; entries: Map<string, Memory> };
const Context = createContext<Vault | null>(null);
export function SemesterMemory({ children }: { children: ReactNode }) {
  const vault = useRef<Vault>({ actor: '', entries: new Map() });
  useEffect(() => {
    const clear = (event: Event) => {
      vault.current.actor = '';
      vault.current.entries.clear();
      window.dispatchEvent(
        new CustomEvent('semester-memory-cleared', {
          detail: {
            reason: event.type === 'pagehide' ? 'pagehide' : 'account',
          },
        }),
      );
    };
    window.addEventListener('pagehide', clear);
    window.addEventListener('account-draft-cleared', clear);
    return () => {
      window.removeEventListener('pagehide', clear);
      window.removeEventListener('account-draft-cleared', clear);
      vault.current.entries.clear();
    };
  }, []);
  return <Context.Provider value={vault.current}>{children}</Context.Provider>;
}
export function useSemesterMemory(actor: string, project: string) {
  const vault = useContext(Context);
  if (!vault) throw Error('Semester memory boundary required');
  if (vault.actor !== actor) {
    vault.actor = actor;
    vault.entries.clear();
  }
  if (!vault.entries.has(project)) {
    if (vault.entries.size >= 8)
      vault.entries.delete(vault.entries.keys().next().value!);
    vault.entries.set(project, {});
  }
  return vault.entries.get(project)!;
}
