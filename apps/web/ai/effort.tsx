'use client';
import { ReasoningEffort } from '@/components/assistant-ui/elements/reasoning-effort';
import { useAISystem } from './context';
import type { AIEffort } from './types';
export function ComposerEffort() {
  const ai = useAISystem(),
    ar = ai.locale === 'ar';
  return (
    <div
      className="ai-effort"
      aria-label={ar ? 'جهد التفكير' : 'Reasoning effort'}
    >
      <ReasoningEffort
        showUsage={false}
        spent={0}
        levels={[
          { key: 'quick', label: ar ? 'سريع' : 'Quick', budget: 0 },
          { key: 'balanced', label: ar ? 'متوازن' : 'Balanced', budget: 3500 },
          { key: 'deep', label: ar ? 'متعمّق' : 'Deep', budget: 5000 },
        ]}
        selectedKey={ai.mode}
        onSelect={(v) => ai.setMode(v as AIEffort)}
      />
    </div>
  );
}
