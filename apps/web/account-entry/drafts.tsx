'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
export interface MemoryDraft {
  values: Record<string, string>;
  token: string;
  status: string;
  context: { name?: string; email?: string; expiresAt?: string };
  returnTo: string;
}
type Vault = { key: string; draft: MemoryDraft };
const Context = createContext<Vault | null>(null);
const empty = (): MemoryDraft => ({
  values: {},
  token: '',
  status: 'ready',
  context: {},
  returnTo: '',
});
export function AccountDrafts({ children }: { children: ReactNode }) {
  const vault = useRef<Vault>({ key: '', draft: empty() }),
    path = usePathname();
  useEffect(() => {
    const clear = () => {
      vault.current.draft.values = {};
      vault.current.draft.token = '';
      vault.current.draft.context = {};
      vault.current.draft.status = 'ready';
      vault.current.key = '';
      vault.current.draft = empty();
      document
        .querySelectorAll<HTMLInputElement>('input[data-secret]')
        .forEach((i) => {
          i.value = '';
        });
      window.dispatchEvent(new Event('account-draft-cleared'));
    };
    window.addEventListener('pagehide', clear);
    return () => window.removeEventListener('pagehide', clear);
  }, []);
  useEffect(() => {
    const logical = path.replace(/^\/(en|ar)/, '');
    if (vault.current.key && !vault.current.key.endsWith(logical)) {
      vault.current.key = '';
      vault.current.draft = empty();
    }
  }, [path]);
  return <Context.Provider value={vault.current}>{children}</Context.Provider>;
}
export function useMemoryDraft(key: string) {
  const vault = useContext(Context);
  if (!vault) throw Error('Account form memory boundary missing');
  if (vault.key !== key) {
    vault.key = key;
    vault.draft = empty();
  }
  return vault.draft;
}
