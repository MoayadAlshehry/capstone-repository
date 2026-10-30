'use client';
import { useEffect, useState } from 'react';
import { Button } from '@capstone/ui/workspace-v2';
import { FileWorkspace } from './files';
import {
  CheckpointDecision,
  CheckpointRecordedResponse,
  FrozenSummary,
} from './reviews';
import { StudioCard, t, type Locale, type FrozenRecord } from './common';
import type { CheckpointRound } from '@capstone/domain';
export function FrozenDesk({
  locale,
  actor,
  round,
  faculty,
  locked,
  initialFile,
}: {
  locale: Locale;
  actor: string;
  round: FrozenRecord;
  faculty: boolean;
  locked?: string | undefined;
  initialFile?: string | undefined;
}) {
  const [step, setStep] = useState('evidence'),
    [denied, setDenied] = useState(false),
    copy = (en: string, ar: string) => t(locale, en, ar);
  useEffect(() => {
    const revoke = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.project === round.project && d?.submission === round.id)
        setDenied(true);
    };
    window.addEventListener('semester-file-denied', revoke);
    return () => window.removeEventListener('semester-file-denied', revoke);
  }, [round.id]);
  return (
    <>
      {!faculty && round.purpose === 'CHECKPOINT' && (
        <StudioCard title={copy('Supervisor feedback', 'ملاحظات المشرف')}>
          <CheckpointRecordedResponse
            locale={locale}
            round={round as CheckpointRound}
          />
        </StudioCard>
      )}
      <div className="ss-desk-steps">
        <Button
          variant={step === 'evidence' ? 'secondary' : 'outline'}
          onClick={() => setStep('evidence')}
        >
          {copy('Evidence', 'الملفات المحفوظة')}
        </Button>
        {faculty && (
          <Button
            variant={step === 'response' ? 'secondary' : 'outline'}
            onClick={() => setStep('response')}
          >
            {copy('Supervisor response', 'رد المشرف')}
          </Button>
        )}
      </div>
      <div
        className={'ss-review-grid' + (!faculty ? ' ss-review-readonly' : '')}
        data-step={step}
      >
        <div className="ss-desk-evidence">
          <details className="ss-snapshot-details">
            <summary>{copy('Project summary', 'ملخص المشروع')} </summary>
            {!denied && <FrozenSummary locale={locale} round={round} />}
          </details>
          <FileWorkspace
            key={actor + ':' + round.id}
            locale={locale}
            actor={actor}
            project={round.project}
            version={round.version}
            initialFiles={round.files}
            initialFile={initialFile}
            editable={false}
            lead={false}
            submission={round.id}
            purpose={round.purpose}
            archived={round.state === 'archived'}
            readerOnly={faculty}
          />
        </div>
        {faculty && (
          <div className="ss-desk-response">
            <Button
              className="ss-evidence-return"
              variant="ghost"
              onClick={() => setStep('evidence')}
            >
              {copy('Back to evidence', 'العودة إلى الملفات المحفوظة')}
            </Button>
            <CheckpointDecision
              locale={locale}
              actor={actor}
              round={{
                ...(round as CheckpointRound),
                canDecide: !denied && round.canDecide,
              }}
              locked={locked}
            />
            {denied && (
              <p dir="auto" role="alert">
                {copy(
                  'File access has changed. Reload to recheck your assignment before responding.',
                  'تغير الوصول إلى الملفات. أعد التحميل للتحقق من الإسناد قبل الرد.',
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
