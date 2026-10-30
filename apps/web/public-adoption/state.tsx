'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { AccountDrafts } from '../account-entry/drafts';
type Memory = {
  key: string;
  value: string;
  focus: boolean;
  start: number | null;
  end: number | null;
};
const empty = (): Memory => ({
  key: '',
  value: '',
  focus: false,
  start: null,
  end: null,
});
type PdfMemory = Record<
  string,
  { page: number; zoom: number; fit: 'width' | 'page' }
>;
const Context = createContext<{
  memory: Memory;
  setMemory: (v: Memory) => void;
  pdfMemory: PdfMemory;
  setPdfMemory: Dispatch<SetStateAction<PdfMemory>>;
}>({
  memory: empty(),
  setMemory: () => {},
  pdfMemory: {},
  setPdfMemory: () => {},
});
export const usePublicDraft = () => useContext(Context);
/** Locale navigation shares the existing in-memory account boundary; no credentials enter persistent browser storage. */
export function PublicState({ children }: { children: ReactNode }) {
  const [memory, setMemory] = useState<Memory>(empty);
  const [pdfMemory, setPdfMemory] = useState<PdfMemory>({});
  useEffect(() => {
    const clear = () => {
      setMemory(empty());
      setPdfMemory({});
    };
    addEventListener('account-draft-cleared', clear);
    return () => removeEventListener('account-draft-cleared', clear);
  }, []);
  return (
    <AccountDrafts>
      <Context.Provider value={{ memory, setMemory, pdfMemory, setPdfMemory }}>
        {children}
      </Context.Provider>
    </AccountDrafts>
  );
}
