import type { Locale } from '@myna/shared';
import * as Location from 'expo-location';

export interface Fix {
  lat: number;
  lng: number;
  placeName: string | null;
}

/** §5.3/§5.5: real GPS + reverse geocoding. Returns null when permission is denied or GPS fails. */
export async function locate(): Promise<Fix | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude: lat, longitude: lng } = pos.coords;
    let placeName: string | null = null;
    try {
      const [addr] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      placeName = addr ? [addr.district ?? addr.subregion, addr.city ?? addr.region].filter(Boolean).join(', ') || null : null;
    } catch {
      // Reverse geocoding is unavailable on some platforms (e.g. web without an API key); coordinates still work.
    }
    return { lat, lng, placeName };
  } catch {
    return null;
  }
}

/** Manual fallback cities (prototype list), with the coordinates used for "nearby". */
export const CITIES: { names: Partial<Record<Locale, string>> & { en: string }; lat: number; lng: number }[] = [
  { names: { zh: '纽约', en: 'New York', es: 'Nueva York', ja: 'ニューヨーク', ko: '뉴욕' }, lat: 40.7128, lng: -74.006 },
  { names: { zh: '洛杉矶', en: 'Los Angeles', ja: 'ロサンゼルス', ko: '로스앤젤레스' }, lat: 34.0522, lng: -118.2437 },
  { names: { zh: '旧金山', en: 'San Francisco', ja: 'サンフランシスコ', ko: '샌프란시스코' }, lat: 37.7749, lng: -122.4194 },
  { names: { zh: '多伦多', en: 'Toronto', ja: 'トロント', ko: '토론토' }, lat: 43.6532, lng: -79.3832 },
  { names: { zh: '温哥华', en: 'Vancouver', ja: 'バンクーバー', ko: '밴쿠버' }, lat: 49.2827, lng: -123.1207 },
  { names: { zh: '北京', en: 'Beijing', es: 'Pekín', fr: 'Pékin', it: 'Pechino', ja: '北京', ko: '베이징' }, lat: 39.9042, lng: 116.4074 },
  { names: { zh: '上海', en: 'Shanghai', es: 'Shanghái', ja: '上海', ko: '상하이' }, lat: 31.2304, lng: 121.4737 },
];

export const cityName = (c: (typeof CITIES)[number], l: Locale) => c.names[l] ?? c.names.en;
