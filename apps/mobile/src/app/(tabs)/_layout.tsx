import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '../../components/TabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="nearby" />
      <Tabs.Screen name="boards" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}
