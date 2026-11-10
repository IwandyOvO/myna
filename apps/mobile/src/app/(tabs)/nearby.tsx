import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { TabHeader } from '../../components/headers';
import { PostCardView } from '../../components/post';
import { Button, Chip, ChipRow, Empty, ErrorView, Loading, Sheet, T } from '../../components/ui';
import { CITIES, cityName, locate } from '../../lib/location';
import { useNearby } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

const RADII: (number | null)[] = [1, 5, 10, null]; // null = whole city

/** §5.5 Nearby: GPS-based feed with distance, radius filter and "locate again". */
export default function Nearby() {
  const { t, locale, colors } = useSettings();
  const [coords, setCoords] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pickCity, setPickCity] = useState(false);
  const [radius, setRadius] = useState<number | null>(5);
  const q = useNearby(coords, radius);

  const run = async () => {
    setLocating(true);
    setFailed(false);
    const fix = await locate();
    setLocating(false);
    if (fix) setCoords({ lat: fix.lat, lng: fix.lng, label: fix.placeName ?? `${fix.lat.toFixed(3)}, ${fix.lng.toFixed(3)}` });
    else setFailed(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TabHeader title={t('disc_title')} />
      {!coords ? (
        <View style={{ padding: 24, gap: 12 }}>
          <Empty emoji="📍" text={failed ? t('loc_failed') : t('nearby_perm')} />
          <Button label={locating ? t('loc_locating') : t('nearby_allow')} onPress={run} loading={locating} />
          <Button variant="ghost" label={t('loc_manual')} onPress={() => setPickCity(true)} />
        </View>
      ) : (
        <FlatList
          data={q.data?.items ?? []}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PostCardView post={item} showDistance />}
          ListHeaderComponent={
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}>
                <T style={{ flex: 1, fontWeight: '700' }} numberOfLines={1}>
                  📍 {coords.label}
                </T>
                <Chip label={locating ? t('loc_locating') : t('loc_relocate')} onPress={run} />
              </View>
              <ChipRow>
                {RADII.map((r) => (
                  <Chip key={String(r)} label={r === null ? t('radius_all') : `${r}km`} on={radius === r} onPress={() => setRadius(r)} />
                ))}
              </ChipRow>
            </View>
          }
          ListEmptyComponent={q.isPending ? <Loading /> : q.isError ? <ErrorView onRetry={() => q.refetch()} /> : <Empty text={t('disc_empty')} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
      <Sheet visible={pickCity} title={t('loc_manual')} onClose={() => setPickCity(false)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }}>
          {CITIES.map((c) => (
            <Chip
              key={c.names.en}
              label={cityName(c, locale)}
              onPress={() => {
                setCoords({ lat: c.lat, lng: c.lng, label: cityName(c, locale) });
                setPickCity(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}
