import type { ReactNode } from 'react';
import { PublicState } from '../../public-adoption/state';
export default function Layout({ children }: { children: ReactNode }) {
  return <PublicState>{children}</PublicState>;
}
