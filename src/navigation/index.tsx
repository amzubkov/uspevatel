import React, { useMemo, useState, useCallback } from "react";
import { TouchableOpacity, Text, View, StyleSheet, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { useSettingsStore } from "../store/settingsStore";
import { useTaskStore } from "../store/taskStore";
import { useProjectStore } from "../store/projectStore";
import { useRoutineStore } from "../store/routineStore";
import { useChecklistStore } from "../store/checklistStore";
import { useSportStore } from "../store/sportStore";
import { useExerciseStore } from "../store/exerciseStore";
import { useFlightStore } from "../store/flightStore";
import { colors } from "../utils/theme";
import { analyzeFolderSync, syncWithFolder } from "../db/database";

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
import { StatsScreen } from "../screens/StatsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { SubjectTasksScreen } from "../screens/SubjectTasksScreen";
import { RoutineScreen } from "../screens/RoutineScreen";
import { AllScreen } from "../screens/AllScreen";
import { CheckScreen } from "../screens/CheckScreen";
import { SportScreen } from "../screens/SportScreen";
import { ExerciseDetailScreen } from "../screens/ExerciseDetailScreen";
import { PlannerTab } from "../screens/PlannerTab";

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabEmoji({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 18 }}>{emoji}</Text>;
}

const HeaderButtons = React.memo(function HeaderButtons() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];
  const navigation = useNavigation<any>();
  const [folderSyncing, setFolderSyncing] = useState(false);
  const loadSettings = useSettingsStore((s) => s.load);
  const loadTasks = useTaskStore((s) => s.load);
  const loadProjects = useProjectStore((s) => s.load);
  const loadRoutines = useRoutineStore((s) => s.load);
  const loadChecklist = useChecklistStore((s) => s.load);
  const loadSport = useSportStore((s) => s.load);
  const loadExercises = useExerciseStore((s) => s.load);
  const loadFlights = useFlightStore((s) => s.load);

  const reloadAllStores = useCallback(async () => {
    useSettingsStore.setState({ loaded: false });
    useTaskStore.setState({ loaded: false });
    useProjectStore.setState({ loaded: false });
    useRoutineStore.setState({ loaded: false });
    useChecklistStore.setState({ loaded: false });
    useSportStore.setState({ loaded: false });
    useExerciseStore.setState({ loaded: false });
    useFlightStore.setState({ loaded: false });

    await loadSettings();
    await Promise.all([
      loadTasks(),
      loadProjects(),
      loadRoutines(),
      loadChecklist(),
      loadSport(),
      loadExercises(),
      loadFlights(),
    ]);
  }, [
    loadChecklist,
    loadExercises,
    loadFlights,
    loadProjects,
    loadRoutines,
    loadSettings,
    loadSport,
    loadTasks,
  ]);

  const runFolderSync = useCallback(
    async (forcedAction?: "import" | "export") => {
      if (folderSyncing) return;
      setFolderSyncing(true);
      try {
        const result = await syncWithFolder(undefined as any, forcedAction);
        if (result.action === "conflict") {
          Alert.alert("Синхронизация папки", result.message, [
            { text: "Отмена", style: "cancel" },
            {
              text: "Загрузить",
              onPress: () => {
                void runFolderSync("import");
              },
            },
            {
              text: "Выгрузить",
              onPress: () => {
                void runFolderSync("export");
              },
            },
          ]);
          return;
        }
        if (result.action === "import") {
          await reloadAllStores();
        }
        Alert.alert("Синхронизация папки", result.message);
      } catch (e: any) {
        Alert.alert("Синхронизация папки", e?.message || String(e));
      } finally {
        setFolderSyncing(false);
      }
    },
    [folderSyncing, reloadAllStores],
  );

  const handleFolderSyncPress = useCallback(async () => {
    if (folderSyncing) return;
    const plan = await analyzeFolderSync();
    if (plan.action === "conflict") {
      Alert.alert("Синхронизация папки", plan.message, [
        { text: "Отмена", style: "cancel" },
        {
          text: "Загрузить",
          onPress: () => {
            void runFolderSync("import");
          },
        },
        {
          text: "Выгрузить",
          onPress: () => {
            void runFolderSync("export");
          },
        },
      ]);
      return;
    }
    void runFolderSync();
  }, [folderSyncing, runFolderSync]);

  return (
    <View style={hStyles.row}>
      <TouchableOpacity
        style={hStyles.btn}
        onPress={() => navigation.navigate("DailyRoutine")}
      >
        <Text style={hStyles.emoji}>📅</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={hStyles.btn}
        onPress={() => navigation.navigate("WeeklyRoutine")}
      >
        <Text style={hStyles.emoji}>📊</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={hStyles.btn}
        onPress={() => navigation.navigate("Sport")}
      >
        <Text style={hStyles.emoji}>💪</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={hStyles.btn}
        onPress={() => navigation.navigate("Planner")}
      >
        <Text style={hStyles.emoji}>✈️</Text>
      </TouchableOpacity>
      <TouchableOpacity style={hStyles.btn} onPress={handleFolderSyncPress}>
        <Text style={hStyles.emoji}>{folderSyncing ? "⏳" : "🔁"}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={hStyles.btn}
        onPress={() => navigation.navigate("Projects")}
      >
        <Text style={hStyles.emoji}>📂</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={hStyles.btn}
        onPress={() => navigation.navigate("Settings")}
      >
        <Text style={hStyles.emoji}>⚙️</Text>
      </TouchableOpacity>
    </View>
  );
});

const hStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 2, marginRight: 8 },
  btn: { padding: 4 },
  emoji: { fontSize: 18 },
});

const renderHeaderRight = () => <HeaderButtons />;

function CategoryTabs() {
  const theme = useSettingsStore((s) => s.theme);
  const c = colors[theme];

  const screenOptions = useMemo(
    () => ({
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      tabBarActiveTintColor: c.primary,
      tabBarInactiveTintColor: c.textSecondary,
      headerStyle: { backgroundColor: c.card },
      headerTintColor: c.text,
      tabBarLabelStyle: { fontSize: 10, fontWeight: "700" as const },
    }),
    [theme],
  );

  return (
    <Tab.Navigator screenOptions={screenOptions} initialRouteName="DAY">
      <Tab.Screen
        name="IN"
        component={InboxScreen}
        options={{
          title: "In",
          tabBarIcon: ({ color }) => <TabEmoji emoji="📥" color={color} />,
          headerRight: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="DAY"
        component={DayScreen}
        options={{
          title: "Day",
          tabBarIcon: ({ color }) => <TabEmoji emoji="☀️" color={color} />,
          headerRight: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="ROUTINE"
        component={RoutineScreen}
        options={{
          title: "Routine",
          tabBarIcon: ({ color }) => <TabEmoji emoji="🔄" color={color} />,
          headerRight: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="LATER"
        component={LaterScreen}
        options={{
          title: "Later",
          tabBarIcon: ({ color }) => <TabEmoji emoji="📋" color={color} />,
          headerRight: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="CTRL"
        component={ControlScreen}
        options={{
          title: "Control",
          tabBarIcon: ({ color }) => <TabEmoji emoji="👁" color={color} />,
          headerRight: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="MAYBE"
        component={MaybeScreen}
        options={{
          title: "MAYBE",
          tabBarIcon: ({ color }) => <TabEmoji emoji="💭" color={color} />,
          headerRight: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="CHECK"
        component={CheckScreen}
        options={{
          title: "Check",
          tabBarIcon: ({ color }) => <TabEmoji emoji="✅" color={color} />,
          headerRight: renderHeaderRight,
        }}
      />
      <Tab.Screen
        name="ALL"
        component={AllScreen}
        options={{
          title: "All",
          tabBarIcon: ({ color }) => <TabEmoji emoji="📑" color={color} />,
          headerRight: renderHeaderRight,
        }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const theme = useSettingsStore((s) => s.theme);
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
          name="Sport"
          component={SportScreen}
          options={{ title: "Спорт" }}
        />
        <Stack.Screen
          name="Planner"
          component={PlannerTab}
          options={{ title: "Планнер" }}
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
          name="Settings"
          component={SettingsScreen}
          options={{ title: "Настройки" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
