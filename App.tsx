import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation';
import { useSettingsStore } from './src/store/settingsStore';
import { useTaskStore } from './src/store/taskStore';
import { useProjectStore } from './src/store/projectStore';
import { useRoutineStore } from './src/store/routineStore';
import { useChecklistStore } from './src/store/checklistStore';
import { useSportStore } from './src/store/sportStore';
import { useExerciseStore } from './src/store/exerciseStore';
import { useFlightStore } from './src/store/flightStore';
import { loadSyncFolder } from './src/db/database';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: 'red', marginBottom: 10 }}>Ошибка!</Text>
          <Text style={{ fontSize: 14, color: '#333' }}>{this.state.error.message}</Text>
          <Text style={{ fontSize: 11, color: '#666', marginTop: 10 }}>{this.state.error.stack?.slice(0, 500)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function AppLoader() {
  const [ready, setReady] = useState(false);
  const theme = useSettingsStore((s) => s.theme);
  const loadSettings = useSettingsStore((s) => s.load);
  const loadTasks = useTaskStore((s) => s.load);
  const loadProjects = useProjectStore((s) => s.load);
  const loadRoutines = useRoutineStore((s) => s.load);
  const loadChecklist = useChecklistStore((s) => s.load);
  const loadSport = useSportStore((s) => s.load);
  const loadExercises = useExerciseStore((s) => s.load);
  const loadFlights = useFlightStore((s) => s.load);

  useEffect(() => {
    (async () => {
      // Load sync folder BEFORE anything opens the DB
      await loadSyncFolder();
      // Settings first (theme needed for UI), then rest in parallel
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
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme === 'dark' ? '#1A1A1A' : '#FFF' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <AppNavigator />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppLoader />
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
