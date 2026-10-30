import { AIError } from './types';
export type JSONNode = {
  pointer: string;
  start: number;
  end: number;
  value: unknown;
};
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function inspectJSON(text: string) {
  const value: unknown = JSON.parse(text),
    nodes: JSONNode[] = [];
  let at = 0,
    steps = 0;
  const ws = () => {
    while (/\s/.test(text[at] ?? '') && at < text.length) at++;
  };
  const string = () => {
    const start = at++;
    while (at < text.length) {
      const c = text[at++];
      if (c === '\\') at++;
      else if (c === '"') return JSON.parse(text.slice(start, at)) as string;
    }
    throw new AIError('INVALID_JSON', 422);
  };
  const walk = (pointer: string, depth: number, prefix?: number): unknown => {
    if (depth > 20 || ++steps > 10000) throw new AIError('FILE_LIMIT', 413);
    ws();
    const start = at;
    let result: unknown;
    if (text[at] === '{') {
      at++;
      ws();
      const object: Record<string, unknown> = Object.create(null) as Record<
        string,
        unknown
      >;
      while (text[at] !== '}') {
        ws();
        const keyStart = at,
          key = string();
        if (forbidden.has(key)) throw new AIError('UNSAFE_JSON_KEY', 422);
        ws();
        if (text[at++] !== ':') throw new AIError('INVALID_JSON', 422);
        object[key] = walk(
          pointer + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1'),
          depth + 1,
          keyStart,
        );
        ws();
        if (text[at] === ',') at++;
        else break;
      }
      if (text[at++] !== '}') throw new AIError('INVALID_JSON', 422);
      result = object;
    } else if (text[at] === '[') {
      at++;
      ws();
      const array: unknown[] = [];
      while (text[at] !== ']') {
        array.push(walk(pointer + '/' + array.length, depth + 1));
        ws();
        if (text[at] === ',') at++;
        else break;
      }
      if (text[at++] !== ']') throw new AIError('INVALID_JSON', 422);
      result = array;
    } else if (text[at] === '"') result = string();
    else {
      const m = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        text.slice(at),
      );
      if (!m) throw new AIError('INVALID_JSON', 422);
      result = JSON.parse(m[0]);
      at += m[0].length;
    }
    nodes.push({ pointer, start: prefix ?? start, end: at, value: result });
    return result;
  };
  walk('', 0);
  return { value, nodes };
}
export function jsonPointer(nodes: JSONNode[], pointer: string) {
  if (
    pointer.length > 512 ||
    (pointer !== '' && !pointer.startsWith('/')) ||
    pointer
      .split('/')
      .some((part) =>
        forbidden.has(part.replaceAll('~1', '/').replaceAll('~0', '~')),
      )
  )
    throw new AIError('INVALID_JSON_POINTER', 400);
  const found = nodes.find((node) => node.pointer === pointer);
  if (!found) throw new AIError('JSON_POINTER_NOT_FOUND', 404);
  return found;
}
