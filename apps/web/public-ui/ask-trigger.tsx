'use client';
import { useEffect } from 'react';
import { useAISystem } from '../ai/context';
import type { AIProjectRef } from '../ai/types';

export function PublicProjectAsk({ project }: { project: AIProjectRef }) {
  const ai = useAISystem();
  useEffect(() => {
    if (ai.enabled) ai.registerProject(project);
  }, [
    ai.enabled,
    ai.registerProject,
    project.id,
    project.version,
    project.title,
  ]);
  return null;
}
