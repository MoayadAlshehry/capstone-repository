'use client';
import { useEffect, useState } from 'react';

/** Keep native forms usable while protecting fields that need client handlers. */
export function useClientInputReady(needsClientHandler: boolean) {
  const [prepared, setPrepared] = useState(false);
  useEffect(() => setPrepared(true), []);
  return !needsClientHandler || prepared;
}
