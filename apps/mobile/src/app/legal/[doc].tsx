import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { PageHeader } from '../../components/headers';
import { T } from '../../components/ui';
import { legalDoc } from '../../lib/legal';
import { useSettings } from '../../lib/settings';

export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { colors, locale } = useSettings();
  const d = legalDoc(doc === 'privacy' ? 'privacy' : 'terms', locale);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={d.title} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 16 }}>
        <T muted style={{ fontSize: 12 }}>{d.updated}</T>
        {d.sections.map((s) => (
          <View key={s.h} style={{ gap: 6 }}>
            <T style={{ fontSize: 16, fontWeight: '800' }}>{s.h}</T>
            <T style={{ fontSize: 14, lineHeight: 22, color: colors.body }}>{s.p}</T>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
