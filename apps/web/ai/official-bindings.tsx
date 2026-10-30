'use client';
import { useContext } from 'react';
import { ThreadPrimitive } from '@assistant-ui/react';
import {
  EmptyState,
  EmptyStateGreeting,
  EmptyStateSuggestions,
  EmptyStateSuggestion,
} from '@/components/assistant-ui/elements/empty-state';
import { OfficialContext } from './official-locale';
import { Composer } from '@/components/assistant-ui/elements/thread.aui';
export function OfficialWelcome() {
  const { locale, kind } = useContext(OfficialContext),
    ar = locale === 'ar';
  const prompts =
    kind === 'discover'
      ? ar
        ? [
            'مشاريع استرجاع المستندات العربية',
            'مشاريع عتاد تراقب البيئة',
            'مشاريع نظم المعلومات',
          ]
        : [
            'Arabic document retrieval projects',
            'Hardware monitoring the environment',
            'Information Systems projects',
          ]
      : ar
        ? ['ما المشكلة التي يحلها؟', 'كيف يعمل؟', 'ما القيود الموثقة؟']
        : [
            'What problem does it solve?',
            'How does it work?',
            'What limitations are documented?',
          ];
  return (
    <div className="flex justify-center">
      <EmptyState>
        <EmptyStateGreeting>
          {kind === 'discover'
            ? ar
              ? 'ما المشاريع التي تبحث عنها؟'
              : 'What would you like to find?'
            : ar
              ? 'اسأل عن هذا المشروع'
              : 'Ask about this project'}
        </EmptyStateGreeting>
        <p className="ai-empty-scope">
          {ar
            ? 'إجابات من الأدلة العامة لهذا المشروع، مع مصادرها.'
            : 'Answers from this project’s public evidence, with sources.'}
        </p>
        <EmptyStateSuggestions>
          {prompts.map((prompt, index) => (
            <ThreadPrimitive.Suggestion
              key={prompt}
              prompt={prompt}
              send
              asChild
            >
              <EmptyStateSuggestion index={index}>
                {prompt}
              </EmptyStateSuggestion>
            </ThreadPrimitive.Suggestion>
          ))}
        </EmptyStateSuggestions>
        <Composer autoFocus={true} />
      </EmptyState>
    </div>
  );
}
