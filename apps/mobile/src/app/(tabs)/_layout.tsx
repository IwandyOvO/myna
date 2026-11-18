import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '../../components/TabBar';
import { CrashScreen } from '../../components/CrashScreen';

export { CrashScreen as ErrorBoundary };

/** Home (one unified list) · 开评 (full-screen swipe feed) · (+ Post) · Search · Me. Nearby and boards are chips on Home. */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="play" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}
