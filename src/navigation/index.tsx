import React, { useMemo, useCallback, useState, useEffect } from "react";
import { TouchableOpacity, Text, View, ScrollView, StyleSheet, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { useSettingsStore } from "../store/settingsStore";
import { colors } from "../utils/theme";
// import { getSyncFolder } from "../db/database";

import { InboxScreen } from "../screens/InboxScreen";
import { DayScreen } from "../screens/DayScreen";
import { LaterScreen } from "../screens/LaterScreen";
import { ControlScreen } from "../screens/ControlScreen";
import { MaybeScreen } from "../screens/MaybeScreen";
import { AddTaskScreen } from "../screens/AddTaskScreen";
import { TaskDetailScreen } from "../screens/TaskDetailScreen";
import { ProjectsScreen } from "../screens/ProjectsScreen";
import { ProjectDetailScreen } from "../screens/ProjectDetailScreen";
import { DailyRoutineScreen } from "../screens/DailyRoutineScreen";
import { WeeklyRoutineScreen } from "../screens/WeeklyRoutineScreen";
import { MoneyScreen, triggerAddAccount } from "../screens/MoneyScreen";
import { StatsScreen } from "../screens/StatsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { SubjectTasksScreen } from "../screens/SubjectTasksScreen";
import { RoutineScreen } from "../screens/RoutineScreen";
import { AllScreen } from "../screens/AllScreen";
import { CheckScreen } from "../screens/CheckScreen";
import { SportScreen } from "../screens/SportScreen";
import { ExerciseDetailScreen } from "../screens/ExerciseDetailScreen";
import { PlannerTab } from "../screens/PlannerTab";
import { HealthScreen } from "../screens/HealthScreen";
import { DocumentsScreen } from "../screens/DocumentsScreen";
import { TelegramSyncScreen } from "../screens/TelegramSyncScreen";
import { DayReviewScreen } from "../screens/DayReviewScreen";
import { ContactsScreen } from "../screens/ContactsScreen";
import { ContactDetailScreen } from "../screens/ContactDetailScreen";

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabEmoji({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 18 }}>{emoji}</Text>;
}

const HeaderButtons = React.memo(function HeaderButtons() {
  const navigation = useNavigation<any>();

  const items: { emoji: string; screen: string }[] = [
    { emoji: '👥', screen: 'Contacts' },
    { emoji: '📅', screen: 'DailyRoutine' },
    { emoji: '📊', screen: 'DayReview' },
    { emoji: '💰', screen: 'Money' },
    { emoji: '💪', screen: 'Sport' },
    { emoji: '🏥', screen: 'Health' },
    { emoji: '✈️', screen: 'Planner' },
    { emoji: '📄', screen: 'Documents' },
    { emoji: '📂', screen: 'Projects' },
    { emoji: '🤖', screen: 'TelegramSync' },
    { emoji: '⚙️', screen: 'Settings' },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={hStyles.scroll} contentContainerStyle={hStyles.row}>
      {items.map((item) => (
        <TouchableOpacity key={item.screen} style={hStyles.btn} onPress={() => navigation.navigate(item.screen)}>
          <Text style={hStyles.emoji}>{item.emoji}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
});

const hStyles = StyleSheet.create({
  scroll: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", paddingRight: 8 },
  btn: { paddingHorizontal: 5, paddingVertical: 4 },
  emoji: { fontSize: 17 },
});

const renderHeaderRight = () => <HeaderButtons />;

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function PlannerDateTime() {
  const [now, setNow] = useState(new Date());
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = MONTHS_SHORT[now.getMonth()];
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return <Text style={{ color: c.textSecondary, fontSize: 14, marginRight: 14 }}>{dd} {mm} {hh}:{mi}</Text>;
}

function CategoryTabs() {
  const theme = useSettingsStore((s) => s.theme);
  const navBarPadding = useSettingsStore((s) => s.navBarPadding);
  const c = colors[theme];

  const screenOptions = useMemo(
    () => ({
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      tabBarActiveTintColor: c.primary,
      tabBarInactiveTintColor: c.textSecondary,
      headerStyle: { backgroundColor: c.card },
      headerTintColor: c.text,
      headerTitle: "",
      headerTitleAlign: "left" as const,
      headerTitleContainerStyle: { left: 0, right: 0, marginHorizontal: 0, paddingHorizontal: 8 },
      tabBarLabelStyle: { fontSize: 10, fontWeight: "700" as const },
    }),
    [theme, navBarPadding],
  );

  return (
    <Tab.Navigator screenOptions={screenOptions} initialRouteName="DAY">
      <Tab.Screen
        name="IN"
        component={InboxScreen}
        options={{
          title: "In",
          tabBarIcon: ({ color }) => <TabEmoji emoji="📥" color={color} />,
          headerTitle: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="DAY"
        component={DayScreen}
        options={{
          title: "Day",
          tabBarIcon: ({ color }) => <TabEmoji emoji="☀️" color={color} />,
          headerTitle: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="ROUTINE"
        component={RoutineScreen}
        options={{
          title: "Routine",
          tabBarIcon: ({ color }) => <TabEmoji emoji="🔄" color={color} />,
          headerTitle: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="LATER"
        component={LaterScreen}
        options={{
          title: "Later",
          tabBarIcon: ({ color }) => <TabEmoji emoji="📋" color={color} />,
          headerTitle: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="CTRL"
        component={ControlScreen}
        options={{
          title: "Control",
          tabBarIcon: ({ color }) => <TabEmoji emoji="👁" color={color} />,
          headerTitle: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="MAYBE"
        component={MaybeScreen}
        options={{
          title: "MAYBE",
          tabBarIcon: ({ color }) => <TabEmoji emoji="💭" color={color} />,
          headerTitle: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="CHECK"
        component={CheckScreen}
        options={{
          title: "Check",
          tabBarIcon: ({ color }) => <TabEmoji emoji="✅" color={color} />,
          headerTitle: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="ALL"
        component={AllScreen}
        options={{
          title: "All",
          tabBarIcon: ({ color }) => <TabEmoji emoji="📑" color={color} />,
          headerTitle: renderHeaderRight,
        }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const theme = useSettingsStore((s) => s.theme);
  const navBarPad = useSettingsStore((s) => s.navBarPadding);
  const c = colors[theme];

  const navTheme = useMemo(() => {
    const base = theme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: c.background,
        card: c.card,
        text: c.text,
        border: c.border,
        primary: c.primary,
        notification: c.danger,
      },
    };
  }, [theme]);

  const stackScreenOptions = useMemo(
    () => ({
      headerStyle: { backgroundColor: c.card },
      headerTintColor: c.text,
    }),
    [theme],
  );

  return (
    <View style={{ flex: 1, marginBottom: navBarPad ? 28 : 0, backgroundColor: c.background }}>
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen
          name="Home"
          component={CategoryTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AddTask"
          component={AddTaskScreen}
          options={{ title: "Новая задача" }}
        />
        <Stack.Screen
          name="TaskDetail"
          component={TaskDetailScreen}
          options={{ title: "Задача" }}
        />
        <Stack.Screen
          name="Projects"
          component={ProjectsScreen}
          options={{ title: "Проекты" }}
        />
        <Stack.Screen
          name="ProjectDetail"
          component={ProjectDetailScreen}
          options={{ title: "Проект" }}
        />
        <Stack.Screen
          name="SubjectTasks"
          component={SubjectTasksScreen}
          options={{ title: "Задачи человека" }}
        />
        <Stack.Screen
          name="DailyRoutine"
          component={DailyRoutineScreen}
          options={{ title: "Ежедневный регламент" }}
        />
        <Stack.Screen
          name="WeeklyRoutine"
          component={WeeklyRoutineScreen}
          options={{ title: "Еженедельный обзор" }}
        />
        <Stack.Screen
          name="DayReview"
          component={DayReviewScreen}
          options={{ title: "Обзор дня" }}
        />
        <Stack.Screen
          name="Money"
          component={MoneyScreen}
          options={{
            title: "Деньги",
            headerRight: () => (
              <TouchableOpacity style={{ marginRight: 16, paddingHorizontal: 8, paddingVertical: 4 }} onPress={triggerAddAccount}>
                <Text style={{ fontSize: 20, fontWeight: '600' }}>+</Text>
              </TouchableOpacity>
            ),
          }}
        />
        <Stack.Screen
          name="Sport"
          component={SportScreen}
          options={{ title: "Спорт" }}
        />
        <Stack.Screen
          name="Planner"
          component={PlannerTab}
          options={{ title: "Планнер", headerRight: () => <PlannerDateTime /> }}
        />
        <Stack.Screen
          name="Health"
          component={HealthScreen}
          options={{ title: "Здоровье" }}
        />
        <Stack.Screen
          name="Documents"
          component={DocumentsScreen}
          options={{ title: "Документы" }}
        />
        <Stack.Screen
          name="ExerciseDetail"
          component={ExerciseDetailScreen}
          options={{ title: "Упражнение" }}
        />
        <Stack.Screen
          name="Stats"
          component={StatsScreen}
          options={{ title: "Статистика" }}
        />
        <Stack.Screen
          name="TelegramSync"
          component={TelegramSyncScreen}
          options={{ title: "Telegram Sync" }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: "Настройки" }}
        />
        <Stack.Screen
          name="Contacts"
          component={ContactsScreen}
          options={{ title: "Контакты" }}
        />
        <Stack.Screen
          name="ContactDetail"
          component={ContactDetailScreen}
          options={{ title: "Контакт" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
    </View>
  );
}
