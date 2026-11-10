import { boardCategoryName, BOARD_CATEGORIES, type BoardCategory } from './categories';
import type { Locale } from './locales';
import type { Notification } from './api';
import { translate } from './i18n';

/** Title/body for a notification, used by both the push message (server) and the in-app inbox (app). */
export function notificationText(
  locale: Locale,
  type: Notification['type'],
  actorName: string | null,
  data: Record<string, unknown>,
): { title: string; body: string } {
  const d = data as Record<string, string | number>;
  const board = (BOARD_CATEGORIES as readonly string[]).includes(String(d.category)) ? boardCategoryName(d.category as BoardCategory, locale) : '';
  const v = { ...d, name: actorName ?? 'Myna', board };
  switch (type) {
    case 'reply':
      return { title: translate(locale, 'notif_reply_t', v), body: String(d.text ?? '') };
    case 'like':
      return { title: translate(locale, 'notif_like_t', v), body: String(d.text ?? '') };
    case 'follow':
      return { title: translate(locale, 'notif_follow_t', v), body: '' };
    case 'badge':
      return { title: translate(locale, 'notif_badge_t', v), body: `${d.icon ?? ''} ${d.badge ?? ''}`.trim() };
    case 'season':
      return { title: translate(locale, 'notif_season_t', v), body: translate(locale, 'notif_season_b', v) };
  }
}
