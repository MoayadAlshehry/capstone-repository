import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { permanentFixture } from './fixture.js';
import { createCorrectionsEngine } from '@capstone/domain/corrections-engine';

it('retains required original evidence in verified-round supervisor amendments', async () => {
  const x = await permanentFixture(),
    corrections = createCorrectionsEngine(x.f.runtime, x.f.storage);
  try {
    const p = await x.prepare('P5 permanent supervisor correction contract', 2);
    const original = (
      await x.f.seed(
        "SELECT id,md5(to_jsonb(a)::text) hash,app.assessment_payload(id) form FROM app.internal_assessments a WHERE submission_id=$1 AND layer='supervisor'",
        [p.submission],
      )
    )[0]!;
    const issued = (await corrections.command(x.f.faculty.actor, {
      operation: 'issue',
      command: randomUUID(),
      body: {
        assessment: original.id,
        type: 'transcription_error',
        reason:
          'Controlled original evaluator fixture-provenance clarification.',
        evidence: [],
      },
    })) as { issue: string; revision: number; assessment: string };
    const authorized = (await corrections.command(x.f.admin, {
      operation: 'authorize',
      command: randomUUID(),
      body: {
        issue: issued.issue,
        expectedRevision: issued.revision,
        expectedHead: issued.assessment,
        reason:
          'Authorize only the original evaluator to clarify the immutable form.',
      },
    })) as { revision: number; assessment: string };
    const view = await corrections.view<{
      cases: unknown[];
      assessments: {
        layer: string;
        correctionPolicy: string;
        context: { project: string; version: string; submission: string };
      }[];
    }>(x.f.faculty.actor, undefined, issued.issue);
    expect(view.cases).toEqual([]);
    expect(view.assessments).toHaveLength(1);
    expect(view.assessments[0]!.layer).toBe('supervisor');
    expect(view.assessments[0]!.context).toMatchObject({
      project: p.project,
      version: p.version,
      submission: p.submission,
    });
    expect(view.assessments[0]!.correctionPolicy).toBe(
      'REFERENCED_ASSESSMENT_V1',
    );
    await expect(
      corrections.view(x.f.lead.actor, undefined, issued.issue),
    ).rejects.toThrow();
    const form = original.form;
    form.criteria[0].comment +=
      ' Clarification: the evidence is a reused synthetic engineering fixture.';
    const command = {
      operation: 'correct',
      command: randomUUID(),
      body: {
        issue: issued.issue,
        expectedRevision: authorized.revision,
        expectedHead: authorized.assessment,
        reason:
          'Append the original evaluator clarification while preserving all seven levels and evidence references.',
        form,
      },
    };
    await expect(corrections.command(x.f.admin, command)).rejects.toThrow();
    const missing = {
      ...form,
      criteria: form.criteria.map((c: Record<string, unknown>) => ({
        ...c,
        locators: [],
      })),
    };
    await expect(
      corrections.command(x.f.faculty.actor, {
        ...command,
        command: randomUUID(),
        body: { ...command.body, form: missing },
      }),
    ).rejects.toThrow();
    const corrected = await corrections.command(x.f.faculty.actor, command);
    expect(corrected).toHaveProperty('state', 'corrected');
    const fresh = createCorrectionsEngine(x.f.runtime, x.f.storage);
    try {
      expect(
        (await fresh.receipt(x.f.faculty.actor, command.command))?.result,
      ).toEqual(corrected);
      expect(await fresh.command(x.f.faculty.actor, command)).toEqual(
        corrected,
      );
      expect(await fresh.receipt(x.f.lead.actor, command.command)).toBeNull();
    } finally {
      await fresh.close();
    }
    expect(
      (
        await x.f.seed(
          'SELECT md5(to_jsonb(a)::text) hash FROM app.internal_assessments a WHERE id=$1',
          [original.id],
        )
      )[0]!.hash,
    ).toBe(original.hash);
    const rows = await x.f.seed(
      'SELECT quarter_points,payload FROM app.assessment_revisions WHERE logical_id=$1',
      [original.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quarter_points).toBe(200);
    expect(
      rows[0]!.payload.criteria.every(
        (c: { locators: unknown[] }) => c.locators.length === 1,
      ),
    ).toBe(true);
  } finally {
    await corrections.close();
    await x.close();
  }
});
