import { queryIdentity, type SearchIntent } from './search-contract';
import { absentTopicEvidence } from './topic-evidence';
type Requirement = { id: string; term: string; absent: boolean };
export function requirements(intent: SearchIntent): Requirement[] {
  return [
    ...intent.topic.must.map((term, i) => ({
      id: 'M' + i,
      term,
      absent: false,
    })),
    ...intent.topic.anyOf.map((term, i) => ({
      id: 'A' + i,
      term,
      absent: false,
    })),
    ...intent.topic.exclude.map((term, i) => ({
      id: 'X' + i,
      term,
      absent: true,
    })),
  ];
}
const negative = /\b(?:no|not|without|never)\b|لا\s|بدون|ليس|دون|غير/iu;
export function acceptedWitnesses(
  intent: SearchIntent,
  witnesses: { requirement: string; quote: string }[],
  evidence: string,
) {
  const valid = new Set<string>();
  for (const witness of witnesses) {
    const req = requirements(intent).find(
      (row) => row.id === witness.requirement,
    );
    if (!req || witness.quote.length < 12 || !evidence.includes(witness.quote))
      continue;
    const term = queryIdentity(req.term),
      quote = queryIdentity(witness.quote);
    // A language constraint cannot be established by generic NLP terminology.
    if (
      /^(arabic|english|العربية|الانجليزية)$/.test(term) &&
      !new RegExp(
        term === 'arabic' || term === 'العربية'
          ? 'arabic|عرب'
          : 'english|انجليزي',
        'iu',
      ).test(quote)
    )
      continue;
    const words = term.match(/[\p{L}\p{N}]+/gu) ?? [],
      stem = (word: string) => (word.endsWith('s') ? word.slice(0, -1) : word);
    const parts = quote.split(/(?<=[.!?؟])\s+|\n/),
      literalParts = parts.filter((part) =>
        words.every((word) =>
          (part.match(/[\p{L}\p{N}]+/gu) ?? []).map(stem).includes(stem(word)),
        ),
      );
    if (
      req.absent &&
      (!absentTopicEvidence(req.term, witness.quote).length ||
        !absentTopicEvidence(req.term, evidence).length)
    )
      continue;
    if (
      !req.absent &&
      literalParts.length &&
      literalParts.every(
        (part) =>
          negative.test(part) ||
          /outside.{0,30}(?:scope|demonstrator)/iu.test(part),
      )
    )
      continue;
    valid.add(req.id);
  }
  return (
    intent.topic.must.every((_, i) => valid.has('M' + i)) &&
    (!intent.topic.anyOf.length ||
      intent.topic.anyOf.some((_, i) => valid.has('A' + i))) &&
    intent.topic.exclude.every((_, i) => valid.has('X' + i))
  );
}
