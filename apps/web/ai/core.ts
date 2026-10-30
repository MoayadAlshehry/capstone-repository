import { createHash } from 'node:crypto';
import { z } from 'zod';
import { overridesSchema } from './search-contract';
import { AIError, type AILocale, type AISource, type AIEffort } from './types';
export const PROMPT_VERSION = 'ai-v1-grounded-7';
export const GENERATION_MODEL = 'qwen/qwen3.5-9b';
export const EMBEDDING_MODEL = 'text-embedding-qwen3-embedding-0.6b';
export const LIMITS = Object.freeze({
  queue: 4,
  promptCharacters: 22000,
  outputSummary: 240,
  outputAnswer: 500,
  historyCharacters: 1800,
  fileBytes: 4_000_000,
  fileCount: 24,
  pages: 80,
  fileText: 100_000,
  projectText: 180_000,
  chunks: 96,
  chunkCharacters: 2100,
  overlap: 240,
  extractionMs: 8000,
  generationMs: 120000,
  embeddingBatch: 4,
  vectorDimensions: 1024,
});
export const REASONING_MODES = Object.freeze({
  quick: {
    reasoning: 'off',
    chunks: 5,
    units: 20,
    output: 900,
    deadline: 30000,
  },
  balanced: {
    reasoning: 'on',
    chunks: 9,
    units: 36,
    output: 5500,
    deadline: 90000,
  },
  deep: {
    reasoning: 'on',
    chunks: 14,
    units: 52,
    output: 7500,
    deadline: 120000,
  },
} as const);
export function generationDeadlineMs(effort: AIEffort, elapsedMs: number) {
  return Math.max(
    1,
    Math.min(
      REASONING_MODES[effort].deadline,
      LIMITS.generationMs - Math.max(0, elapsedMs),
    ),
  );
}
export const localeSchema = z.enum(['en', 'ar']);
export const requestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('searchView'),
      key: z.string().regex(/^[a-f0-9]{64}$/),
      locale: localeSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('search'),
      overrides: overridesSchema.optional(),
      query: z.string().trim().min(2).max(2000),
      locale: localeSchema,
      filters: z
        .partialRecord(
          z.enum([
            'university',
            'department',
            'academicYear',
            'domain',
            'author',
            'supervisor',
            'authorKey',
            'supervisorKey',
            'sort',
          ]),
          z.string().max(200),
        )
        .default({}),
    })
    .strict(),
  z
    .object({
      action: z.literal('snapshot'),
      version: z.uuid().optional(),
      project: z.uuid(),
      locale: localeSchema,
      briefSize: z.enum(['compact', 'standard', 'hero']).default('standard'),
    })
    .strict(),
  z
    .object({
      action: z.literal('ask'),
      version: z.uuid().optional(),
      project: z.uuid(),
      locale: localeSchema,
      question: z.string().trim().min(2).max(600),
      effort: z.enum(['quick', 'balanced', 'deep']).default('balanced'),
      history: z
        .array(
          z
            .object({
              question: z.string().max(600),
              answer: z.string().max(2500),
            })
            .strict(),
        )
        .max(2)
        .default([]),
    })
    .strict(),
  z
    .object({
      action: z.literal('discover'),
      query: z.string().trim().min(2).max(300),
      locale: localeSchema,
    })
    .strict(),
]);
export const snapshotSchema = z
  .object({
    summary: z.string().trim().min(30).max(650),
  })
  .strict();
export const answerLineSchema = z
  .object({
    answer: z.string().trim().min(3).max(900),
    citations: z
      .array(z.string().regex(/^S\d{1,3}$/))
      .min(1)
      .max(3),
    quote: z.string().trim().min(12).max(1100).optional(),
  })
  .strict();
export const discoverSchema = z
  .object({
    university: z.string().max(150).nullable(),
    department: z.enum(['CS', 'IS', 'CE']).nullable(),
    academicYear: z.string().max(20).nullable(),
    domain: z.enum(['software', 'data', 'hardware']).nullable(),
    terms: z.string().max(100),
    sort: z.enum(['newest', 'highest', 'popular']).nullable(),
  })
  .strict();
export function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function normalized(text: string) {
  return text
    .normalize('NFKC')
    .replace(/[\u0640\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
export function numbers(text: string) {
  const latin = text
    .replace(/\bPython\s*(\d+(?:\.\d+)+)\b/gi, ' $1')
    .replace(/[٠-٩]/g, (n) => String(n.charCodeAt(0) - 0x660))
    .replaceAll('٫', '.')
    .replaceAll('−', '-');
  const digits = (
    latin.match(
      /(?<![\p{L}\p{N}])[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?/gu,
    ) ?? []
  ).map((n) => {
    if (/[eE]/.test(n))
      return Number.isFinite(Number(n)) ? String(Number(n)) : n;
    const negative = n.startsWith('-');
    const parts = n.replace(/^[-+]/, '').split('.');
    const integer = (parts[0] || '0').replace(/^0+(?=\d)/, ''),
      fraction = (parts[1] ?? '').replace(/0+$/, '');
    const value = integer + (fraction ? '.' + fraction : '');
    return negative && value !== '0' ? '-' + value : value;
  });
  const small: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };
  for (const word of latin
    .toLowerCase()
    .match(
      /\b(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g,
    ) ?? [])
    digits.push(
      String(word.split(/[- ]/).reduce((n, part) => n + small[part]!, 0)),
    );
  const arabic: Record<string, number> = {
    صفر: 0,
    واحد: 1,
    واحدة: 1,
    اثنان: 2,
    اثنين: 2,
    اثنتان: 2,
    اثنتين: 2,
    ثلاثة: 3,
    ثلاث: 3,
    اربعة: 4,
    اربع: 4,
    خمسة: 5,
    خمس: 5,
    ستة: 6,
    ست: 6,
    سبعة: 7,
    سبع: 7,
    ثمانية: 8,
    ثمان: 8,
    تسعة: 9,
    تسع: 9,
    عشرة: 10,
    عشر: 10,
    عشرون: 20,
    عشرين: 20,
    ثلاثون: 30,
    ثلاثين: 30,
    اربعون: 40,
    اربعين: 40,
    خمسون: 50,
    خمسين: 50,
    ستون: 60,
    ستين: 60,
    سبعون: 70,
    سبعين: 70,
    ثمانون: 80,
    ثمانين: 80,
    تسعون: 90,
    تسعين: 90,
    مئة: 100,
    مائة: 100,
  };
  for (const word of normalized(text).split(/[^\p{L}]+/u)) {
    const value =
      arabic[word] ??
      (word.startsWith('و') ? arabic[word.slice(1)] : undefined);
    if (value !== undefined) digits.push(String(value));
  }
  return [...new Set(digits)];
}
export function groundedNumbers(answer: string, evidence: string) {
  const allowed = new Set(numbers(evidence)),
    claims = numbers(answer);
  if (
    claims.length &&
    /accuracy|الدقة|دقة/iu.test(answer) &&
    !/accuracy|الدقة|دقة/iu.test(evidence)
  )
    return false;
  if (
    /[%٪]/.test(answer) &&
    !/[%٪]|percent|accuracy|precision|recall|rate|نسبة|دقة/iu.test(evidence)
  )
    return false;
  return claims.every((n) => allowed.has(n));
}
export function groundedPaths(answer: string, evidence: string) {
  const paths =
    answer.match(
      /[\p{L}\p{N}_./-]+\.(?:py|md|txt|csv|json|pdf|ts|js|java|cpp|yml|yaml)\b/giu,
    ) ?? [];
  return paths.every((path) => evidence.includes(path));
}
export function academicNumericClaim(text: string) {
  const latin = normalized(text).replace(/[٠-٩]/g, (n) =>
    String(n.charCodeAt(0) - 0x660),
  );
  return /\b(?:academic score|course grade|grade|project score|project rating|supervisor score|committee score|reviewer score)\b\D{0,25}\d|(?:درجة|تقييم).{0,20}(?:المشروع|الطالب|الاكاديمي).{0,15}\d|(?:المشروع|الطالب).{0,25}(?:درجة|تقييم).{0,12}\d/iu.test(
    latin,
  );
}
export function dangerousAcademicQuestion(q: string) {
  const text = normalized(q);
  if (
    /\bacademic (?:score|grade|rating|evaluation|assessment|marks?)\b|\bcourse grade\b|\brubric\b|(?:committee|supervisor|reviewer).{0,30}(?:score|grade|rating)|project(?:'s)? (?:score|grade|rating)|التقييم الاكاديمي|(?:درجة|درجات) (?:المشروع|الطالب|الطلاب)|تقييم.{0,20}(?:لجنة|مشرف|مقيم)/iu.test(
      text,
    )
  )
    return true;
  if (
    /\bF1\b|accuracy|precision|recall|latency|throughput|(?:risk|anomaly|similarity|relevance|confidence|exposure) score|دقة|استرجاع|زمن الاستجابة|درجة (?:الحرارة|التشابه|المخاطر|الشذوذ)|قيم المستشعر/iu.test(
      text,
    )
  )
    return false;
  if (
    /^(?:please )?(?:rate|grade|score) (?:this|the) (?:project|work)|^(?:من فضلك )?(?:قيم|امنح|اعط|اعطي) (?:هذا|المشروع|مشروع|درجة)/iu.test(
      text,
    )
  )
    return true;
  if (/^(?:explain the evaluation|اشرح التقييم)[.?!؟]*$/iu.test(text))
    return true;
  return /(?:score|grade|rating|marks?).{0,35}(?:project|academic|committee|supervisor)|(?:why|explain|reason).{0,45}project.{0,20}(?:score|grade|rating)|(?:لماذا|اشرح|سبب).{0,45}(?:درجة|تقييم)|(?:درجة|تقييم).{0,25}(?:لجنة|مشرف|مشروع)|(?:اعط|امنح).{0,30}مشروع.{0,20}\d/iu.test(
    text,
  );
}
export function isSourceInstruction(text: string) {
  return /ignore (?:all |previous |the )*instructions|system prompt|developer message|execute (?:shell|command)|تجاهل.{0,15}التعليمات/iu.test(
    text,
  );
}
export function groundedTechnicalTerms(answer: string, evidence: string) {
  if (
    (/المفلتر بالمقاييس|المفلترة بالمقاييس/iu.test(answer) &&
      /constraint.filtered/iu.test(evidence)) ||
    (/رسوم.{0,20}مزروعة|حالات.{0,20}مزروعة/iu.test(answer) &&
      /seeded/iu.test(evidence))
  )
    return false;
  if (
    /count.{0,30}(?:feasible|safe|allowed) (?:routes|paths)/iu.test(answer) &&
    /enumerate_paths|oracle_paths/.test(evidence) &&
    !/len\(allowed\)|count.{0,20}(?:feasible|allowed)/iu.test(evidence)
  )
    return false;
  if (/عدم عبس/iu.test(answer)) return false;
  if (
    /معاير[ةه] أجهزة الاستشعار/iu.test(answer) &&
    !/calibrat|معاير/iu.test(evidence)
  )
    return false;
  if (
    /جرافات مزرعة|شحن أجهزة الاستشعار|عدم عبس/iu.test(answer) &&
    /seeded|calibration/iu.test(evidence)
  )
    return false;
  if (
    /graph model|نموذج بياني/iu.test(answer) &&
    !/\bgraph\b|نموذج بياني|رسم بياني/iu.test(evidence)
  )
    return false;
  if (
    /manual(?:ly)? (?:label|annotat)|(?:موسوم|مصنف|تصنيف|توسيم|وسم).{0,18}يدوي/iu.test(
      normalized(answer),
    ) &&
    !/manual|by hand|يدوي/iu.test(normalized(evidence))
  )
    return false;
  return true;
}
export function unsupportedCertainty(answer: string, evidence: string) {
  if (
    /لا يوجد.{0,35}(?:رقم.{0,20}اعتماد|شهادة اعتماد)|no (?:official )?certification (?:number )?exists/iu.test(
      answer,
    ) &&
    !/(?:certificate|certification) (?:number|id)\s*[:#]\s*[\w-]+|رقم (?:شهادة|اعتماد)\s*[:#]\s*[\d٠-٩]+/iu.test(
      evidence,
    )
  )
    return true;
  const absolute =
    /never (?:been )?(?:certified|approved|deployed|tested)|no (?:[a-z-]+ ){0,5}(?:authority|certification|field trials?|field deployment)|لم.{0,25}(?:يحصل.{0,10}(?:اعتماد|شهادة)|يتم اعتماده)/iu;
  return (
    absolute.test(answer) &&
    !absolute.test(evidence) &&
    /not.{0,30}claimed|none.{0,20}claimed|no.{0,60}claimed|cannot establish|outside.{0,30}(?:scope|demonstrator)|غير موثق/iu.test(
      evidence,
    )
  );
}
export function validateAnswerLine(value: unknown, sources: AISource[]) {
  const line = answerLineSchema.parse(value);
  // Only model-facing markers in prose are normalized. Code/quotes are literal.
  line.answer = line.answer
    .split(/(```[\s\S]*?```|`[^`]*`|"[^"\n]*"|^>[^\n]*)/gm)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/\[S(\d{1,3})\]/g, (_marker, n: string) => {
              const id = 'S' + n;
              if (
                !line.citations.includes(id) ||
                !sources.some((s) => s.id === id)
              )
                throw new AIError('UNSUPPORTED_CITATION', 422);
              return '';
            })
            .replace(/ +([.,;:!?])/g, '$1'),
    )
    .join('');
  const refs = line.citations.map((id) => sources.find((s) => s.id === id));
  if (refs.some((s) => !s)) throw new AIError('UNSUPPORTED_CITATION', 422);
  if (
    line.quote &&
    !refs.some((s) => normalized(s!.text).includes(normalized(line.quote!)))
  )
    throw new AIError('UNSUPPORTED_QUOTE', 422);
  if (
    isSourceInstruction(line.answer) ||
    (/safety is guaranteed|guarantees? (?:real[- ]road )?safety|سلامة مضمونة|يضمن.{0,15}السلامة/iu.test(
      line.answer,
    ) &&
      !/within.{0,20}(?:model|synthetic)|modeled.{0,20}(?:case|invariant)|ضمن.{0,20}(?:نموذج|اصطناع)/iu.test(
        line.answer,
      )) ||
    academicNumericClaim(line.answer) ||
    /server[- ]side code execution|uploaded code (?:is |was |never |cannot )|تنفيذ الشيفر[ةه] المرفوع/iu.test(
      line.answer,
    ) ||
    /(?:web )?platform.{0,25}(?:never executes?|does not execute)/iu.test(
      line.answer,
    )
  )
    throw new AIError('UNSUPPORTED_CLAIM', 422);
  const quoted = (refs as AISource[]).filter(
    (ref) =>
      (!line.quote || normalized(ref.text).includes(normalized(line.quote))) &&
      groundedNumbers(line.answer, line.quote ?? ref.text) &&
      !unsupportedCertainty(line.answer, line.quote ?? ref.text) &&
      groundedTechnicalTerms(line.answer, line.quote ?? ref.text) &&
      groundedPaths(line.answer, (line.quote ?? ref.text) + '\n' + ref.name),
  );
  if (!quoted.length) throw new AIError('UNSUPPORTED_CLAIM', 422);
  const quotes = Object.fromEntries(quoted.map((ref) => [ref.id, ref.text]));
  if (
    /\b0(?:[.,]0)?\s*[%٪]/.test(
      line.answer
        .replace(/[٠-٩]/g, (n) => String(n.charCodeAt(0) - 0x660))
        .replaceAll('٫', '.'),
    ) &&
    Object.values(quotes).some((quote) =>
      /(?:no|without|missing|absent|zero)\s+(?:(?:measured|reported|accuracy)\s+)*(?:accuracy|measurements?)|(?:accuracy|measurement).{0,20}(?:not (?:reported|provided|measured)|unavailable|missing)|(?:لا (?:يوجد|توجد)|غير (?:موثق|متاح)|لم (?:تقس|تذكر)).{0,20}(?:دقة|قياس)/iu.test(
        quote,
      ),
    )
  )
    throw new AIError('MISSING_IS_NOT_ZERO', 422);
  return {
    ...line,
    quote: quoted.length ? quotes[quoted[0]!.id]! : '',
    quotes,
    refs: quoted,
  };
}
export function chunkText(
  text: string,
  base: Omit<AISource, 'id' | 'text' | 'lineStart' | 'lineEnd'>,
  page: number | null = null,
): AISource[] {
  const result: AISource[] = [];
  const fragments = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((line, i) => {
      if (line.length <= LIMITS.chunkCharacters - 1)
        return [{ text: line, line: i + 1 }];
      const pieces: { text: string; line: number }[] = [];
      for (
        let offset = 0;
        offset < line.length;
        offset += LIMITS.chunkCharacters - 1
      )
        pieces.push({
          text: line.slice(offset, offset + LIMITS.chunkCharacters - 1),
          line: i + 1,
        });
      return pieces;
    });
  let buffer = '',
    start = 1,
    end = 1,
    last: { text: string; line: number } | null = null;
  const flush = () => {
    if (buffer.trim().length >= 30)
      result.push({
        ...base,
        id: '',
        text: buffer.trim(),
        page,
        lineStart:
          page === null
            ? start +
              (
                buffer
                  .slice(0, buffer.length - buffer.trimStart().length)
                  .match(/\n/g) ?? []
              ).length
            : null,
        lineEnd:
          page === null
            ? end -
              Math.max(
                0,
                (buffer.slice(buffer.trimEnd().length).match(/\n/g) ?? [])
                  .length - 1,
              )
            : null,
      });
  };
  for (const item of fragments) {
    if (
      buffer.length + item.text.length + 1 > LIMITS.chunkCharacters &&
      buffer
    ) {
      flush();
      const overlap =
        last &&
        last.text.length <= LIMITS.overlap &&
        last.text.length + item.text.length + 2 <= LIMITS.chunkCharacters
          ? last
          : null;
      buffer = overlap ? overlap.text + '\n' : '';
      start = overlap?.line ?? item.line;
    }
    if (!buffer) start = item.line;
    buffer += item.text + '\n';
    end = item.line;
    last = item;
    if (!item.text.trim() && buffer.length > 1200) {
      flush();
      buffer = '';
      last = null;
    }
  }
  flush();
  return result;
}
/** Server-owned exact excerpts, preserving real page/line locations. The model
 * selects passage IDs; it never supplies the quotation or a source URL. */
export function evidenceUnits(sources: AISource[], maximum = 24): AISource[] {
  const result: AISource[] = [];
  for (const source of sources) {
    let cursor = 0;
    for (const paragraph of source.text.split(/\n\s*\n/)) {
      const at = source.text.indexOf(paragraph, cursor);
      cursor = at + paragraph.length;
      if (
        isSourceInstruction(paragraph) ||
        paragraph.trim().length < 25 ||
        /^#{1,6}\s[^\n]+$/.test(paragraph.trim())
      )
        continue;
      for (let offset = 0; offset < paragraph.length;) {
        let end = Math.min(paragraph.length, offset + 900);
        if (end < paragraph.length) {
          const stop = paragraph.lastIndexOf('. ', end);
          if (stop > offset + 250) end = stop + 1;
          else {
            const space = paragraph.lastIndexOf(' ', end);
            if (space > offset + 250) end = space + 1;
          }
        }
        const raw = paragraph.slice(offset, end),
          trim = raw.length - raw.trimStart().length,
          text = raw.trim();
        if (text.length >= 25) {
          const start = at + offset + trim,
            lineOffset = source.text.slice(0, start).split('\n').length - 1;
          result.push({
            ...source,
            section: [
              ...source.text.slice(0, at).matchAll(/^#{1,6}\s+(.+)$/gm),
            ].at(-1)?.[1],
            id: 'S' + (result.length + 1),
            text,
            lineStart:
              source.lineStart === null ? null : source.lineStart + lineOffset,
            lineEnd:
              source.lineStart === null
                ? null
                : source.lineStart + lineOffset + text.split('\n').length - 1,
          });
          if (result.length >= maximum) return result;
        }
        offset = end;
      }
    }
  }
  return result;
}
export function unitVector(input: number[]) {
  if (input.length !== LIMITS.vectorDimensions || !input.every(Number.isFinite))
    throw new AIError('INVALID_VECTOR');
  const length = Math.hypot(...input);
  if (length < 1e-9) throw new AIError('INVALID_VECTOR');
  return Float32Array.from(input, (n) => n / length);
}
export function cosine(a: Float32Array, b: Float32Array) {
  if (a.length !== b.length) throw new AIError('INVALID_VECTOR');
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}
export function insufficient(locale: AILocale) {
  return locale === 'ar'
    ? 'هذه المعلومة غير موثقة في مصادر المشروع المتاحة.'
    : 'This information is not documented in the available project sources.';
}
export function sourcePrompt(sources: AISource[]) {
  return sources
    .map((s) =>
      JSON.stringify({
        id: s.id,
        document: s.name,
        section: s.section ?? null,
        page: s.page,
        lines: s.lineStart === null ? null : [s.lineStart, s.lineEnd],
        content: s.text,
      }),
    )
    .join('\n')
    .slice(0, LIMITS.promptCharacters);
}

/** Conservative 16K packing reserve; interleave files before admitting whole
 * original excerpts. Never slice serialized source JSON or source locators. */
export function contextCost(text: string) {
  const nonAscii = (text.match(/[^\x00-\x7f]/g) ?? []).length;
  return Math.ceil((text.length - nonAscii) / 2 + nonAscii * 1.5);
}
export function fitEvidence(sources: AISource[], budget: number): AISource[] {
  const groups = new Map<string, AISource[]>();
  for (const source of sources) {
    const key = source.file ?? 'metadata';
    const group = groups.get(key) ?? [];
    group.push(source);
    groups.set(key, group);
  }
  const admitted: AISource[] = [];
  let used = 0;
  for (let row = 0; row < sources.length; row++) {
    let present = false;
    for (const group of groups.values()) {
      const source = group[row];
      if (!source) continue;
      present = true;
      const cost = contextCost(sourcePrompt([source])) + 5;
      if (used + cost <= budget) {
        admitted.push(source);
        used += cost;
      }
    }
    if (!present) break;
  }
  return admitted;
}
