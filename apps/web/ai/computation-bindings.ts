/** A bounded, inert Python data-flow aid, not execution or a general parser.
 * Ambiguous assignments/calls are omitted rather than treated as proof. */
export function computationBindings(text: string) {
  const assignments = new Map<string, string[]>();
  for (const match of text
    .slice(0, 80000)
    .matchAll(/^[\t ]*([a-z_]\w*)[\t ]*=[\t ]*([^\n]+)$/gim)) {
    const values = assignments.get(match[1]!) ?? [];
    if (values.length < 2) values.push(match[2]!.slice(0, 4000));
    assignments.set(match[1]!, values);
  }
  const trace = (
    expression: string,
    seen: Set<string>,
    depth: number,
    budget: { remaining: number },
  ): string[] => {
    if (depth > 5 || budget.remaining-- <= 0) return [];
    const result = [expression];
    for (const name of [
      ...new Set(expression.match(/[a-z_]\w*/gi) ?? []),
    ].slice(0, 24)) {
      const values = assignments.get(name);
      if (seen.has(name) || values?.length !== 1) continue;
      result.push(
        ...trace(values[0]!, new Set([...seen, name]), depth + 1, budget),
      );
    }
    return result;
  };
  const rows = [
    ...text
      .slice(0, 80000)
      .matchAll(/['"]([a-z_]\w*)['"]\s*:\s*([^,\n}]{1,500})/gi),
  ]
    .filter((match) => {
      const expression = match[2]!.trim();
      if (/^['"]/.test(expression)) return false;
      return (
        (expression.match(/\(/g)?.length ?? 0) ===
          (expression.match(/\)/g)?.length ?? 0) &&
        (expression.match(/\[/g)?.length ?? 0) ===
          (expression.match(/\]/g)?.length ?? 0) &&
        !expression.includes('{')
      );
    })
    .slice(0, 40)
    .map((match) => ({
      field: match[1]!,
      expressions: trace(match[2]!, new Set(), 0, { remaining: 64 }),
    }));
  return rows.filter((row) => row.expressions.length > 1).slice(0, 40);
}

export function methodOutputBindings(subject: string, evidence: string) {
  const bindings = computationBindings(evidence),
    normalizedSubject = subject
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/persistence/g, 'persistent');
  const candidates = [
    ...new Set(
      bindings.flatMap(
        (binding) => binding.expressions[0]?.match(/[a-z_]\w*/gi) ?? [],
      ),
    ),
  ]
    .filter(
      (name) =>
        name.length >= 4 &&
        normalizedSubject.includes(name.toLowerCase().replace(/_/g, '')),
    )
    .sort((a, b) => b.length - a.length);
  const variable = candidates[0];
  if (!variable || (candidates[1] && candidates[1].length === variable.length))
    return [];
  return bindings.filter((binding) =>
    new RegExp('\\b' + variable + '\\b').test(binding.expressions[0]!),
  );
}

export function methodOutputSupport(
  subject: string,
  answer: string,
  evidence: string,
) {
  const owned = methodOutputBindings(subject, evidence);
  if (!owned.length) return true;
  const own = new Set(owned.map((binding) => binding.field));
  for (const binding of computationBindings(evidence)) {
    if (own.has(binding.field)) continue;
    for (const mention of answer.matchAll(
      new RegExp('\\b' + binding.field + '\\b', 'g'),
    )) {
      const before = answer.slice(0, mention.index);
      if (
        /(?:not\s+(?:(?:compute|computed|return|returned|report|reported)\s+)?|لا يحسب\s+|ليس\s+|ليست\s+)$/iu.test(
          before,
        )
      )
        continue;
      const sentence = answer
        .slice(before.lastIndexOf('.') + 1)
        .split(/[.!؟]/u)[0]!;
      if (
        /unlike|whereas|belongs to|بخلاف|بينما|خاص بالطريقة الأخرى/iu.test(
          sentence,
        )
      )
        continue;
      return false;
    }
  }
  return true;
}

/** Detect only the explicit recursive-list enumeration shape present in the
 * inspected code. Names/headings alone never establish the computation. */
export function enumeratedReturnedFields(text: string) {
  const functions = new Set<string>(),
    lines = text.slice(0, 80000).split('\n');
  let inspected = 0;
  for (const [index, line] of lines.entries()) {
    const definition = /^([\t ]*)def\s+([a-z_]\w*)\([^\n]*\):\s*$/i.exec(line);
    if (!definition) continue;
    if (++inspected > 64) break;
    const indent = definition[1]!.length,
      name = definition[2]!;
    const body: string[] = [];
    for (const next of lines.slice(index + 1)) {
      if (next.trim() && (next.match(/^[\t ]*/)?.[0].length ?? 0) <= indent)
        break;
      body.push(next);
    }
    const code = body.join('\n');
    if (
      /return\s*\[[\s\S]*\bfor\b/.test(code) &&
      new RegExp('\\b' + name + '\\s*\\(').test(code) &&
      !/heapq|heappop|heappush|priority.?queue/i.test(code)
    )
      functions.add(name);
  }
  return computationBindings(text)
    .filter(
      (binding) =>
        binding.expressions.some((expression) =>
          /\bmin\s*\(/.test(expression),
        ) &&
        binding.expressions.some((expression) =>
          [...functions].some((name) =>
            new RegExp('\\b' + name + '\\s*\\(').test(expression),
          ),
        ),
    )
    .map((binding) => binding.field);
}

export function methodComputationSupport(
  subject: string,
  description: string,
  evidence: string,
) {
  if (
    !/baseline|distance[ -]only|reference|المسافة فقط|الأساسي|الاساسي|المرجعي/iu.test(
      subject,
    )
  )
    return true;
  const fields = enumeratedReturnedFields(evidence);
  if (!fields.some((field) => /baseline|reference/i.test(field))) return true;
  // A negated statement about a heap is legitimate; do not reject its denial.
  return !description
    .split(/(?<!\d)[.!?؛](?!\d)|\n/u)
    .some((sentence) =>
      [
        ...sentence.matchAll(
          /dijkstra|heap[ -]based|priority[ -]queue|ديكسترا|طابور.{0,12}أولوية/giu,
        ),
      ].some(
        (mention) =>
          !/(?:\bnot\s+(?:(?:use|uses|using|implemented with|based on)\s+)?|\bno\s+|rather than\s+|instead of\s+|ليس\s+|ليست\s+|لا يستخدم\s+|دون استخدام\s+)(?:(?:a|an|the|standard|separate|independent)\s+){0,3}$/iu.test(
            sentence.slice(0, mention.index),
          ),
      ),
    );
}
