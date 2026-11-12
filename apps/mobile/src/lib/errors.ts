import { ApiFailure } from './api';

/** API error codes that deserve their own message; everything else is "something went wrong". */
const KNOWN: Record<string, string> = {
  content_blocked: 'content_blocked',
  account_banned: 'account_banned',
  age_confirmation_required: 'age_required',
  edit_limit_reached: 'edit_limit',
  keep_one_lang: 'keep_one_lang',
  need_title: 'need_title',
};

export function errorText(e: unknown, t: (k: string) => string): string {
  const key = e instanceof ApiFailure ? KNOWN[e.code] : undefined;
  return t(key ?? 'error_generic');
}
