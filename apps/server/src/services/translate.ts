import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import type { Locale } from '@myna/shared';
import type { Queryable } from '../db/pool';
import { HttpError } from '../lib/errors';

/** Turns text into another language. ClaudeTranslator in production; tests inject a fake. */
export interface Translator {
  translate(text: string, target: Locale): Promise<string>;
}

const LANGUAGE: Record<Locale, string> = {
  zh: 'Simplified Chinese', en: 'English', es: 'Spanish', fr: 'French', ja: 'Japanese', ko: 'Korean', it: 'Italian',
};

const SYSTEM = `You translate short user reviews and comments for a social rating app.
Translate the user's text into the requested language. Keep the tone, slang, jokes and emoji; translate
brand and product names only if they have a well-known local name. If the text is already in the target
language, return it unchanged. Reply with the translation only — no quotes, notes or explanations.`;

/** Claude-backed translator (enabled when ANTHROPIC_API_KEY is set). */
export class ClaudeTranslator implements Translator {
  private client: Anthropic;
  constructor(apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 30_000 });
  }
  async translate(text: string, target: Locale): Promise<string> {
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 4000,
      // Translation is a simple task: low effort keeps it fast and cheap without changing the model.
      output_config: { effort: 'low' },
      // If a request is declined, retry it on the fallback model the API picks for that case.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Target language: ${LANGUAGE[target]}\n\nText:\n${text}` }],
    });
    if (res.stop_reason === 'refusal') throw new HttpError(422, 'translate_failed');
    const out = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!out) throw new HttpError(502, 'translate_failed');
    return out;
  }
}

/** Cached translation: each (text, language) pair is translated once and stored. */
export async function translateCached(db: Queryable, translator: Translator, text: string, target: Locale): Promise<string> {
  const key = createHash('sha256').update(`${target}\u0000${text}`).digest('hex');
  const hit = (await db.query<{ text: string }>('SELECT text FROM translations WHERE key = $1', [key])).rows[0];
  if (hit) return hit.text;
  let out: string;
  try {
    out = await translator.translate(text, target);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, 'translate_failed');
  }
  await db.query('INSERT INTO translations (key, target, text) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING', [key, target, out]);
  return out;
}
