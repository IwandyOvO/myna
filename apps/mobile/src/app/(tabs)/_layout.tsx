import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '../../components/TabBar';
import { CrashScreen } from '../../components/CrashScreen';

export { CrashScreen as ErrorBoundary };

/** Home (one unified list) · Quick rate · (+ Post) · Daily · Me. Nearby and monthly boards are chips on Home. */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="play" />
      <Tabs.Screen name="daily" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}
