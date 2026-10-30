import { AIError } from './types';
/** Incremental structural framing, independent of whitespace or model choice of
 * JSONL, commas, or a wrapping array. It never repairs or accepts a claim: each
 * complete object still goes through the evidence validator before emission. */
export class ClaimStream {
  private buffer = '';
  private depth = 0;
  private quoted = false;
  private escaped = false;
  push(text: string): string[] {
    const frames: string[] = [];
    for (const char of text) {
      if (!this.depth) {
        if (char !== '{') continue;
        this.buffer = '{';
        this.depth = 1;
        this.quoted = false;
        this.escaped = false;
        continue;
      }
      this.buffer += char;
      if (this.buffer.length > 6000) throw new AIError('INVALID_OUTPUT', 422);
      if (this.quoted) {
        if (this.escaped) this.escaped = false;
        else if (char === '\\') this.escaped = true;
        else if (char === '"') this.quoted = false;
      } else if (char === '"') this.quoted = true;
      else if (char === '{') this.depth++;
      else if (char === '}') this.depth--;
      if (this.depth > 8) throw new AIError('INVALID_OUTPUT', 422);
      if (!this.depth) {
        frames.push(this.buffer);
        this.buffer = '';
      }
    }
    return frames;
  }
  get incomplete() {
    return this.buffer;
  }
}
