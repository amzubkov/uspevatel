import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Linking, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation';
import { QuickAddModal, QuickAddMode } from './src/components/QuickAddModal';
import { useSettingsStore } from './src/store/settingsStore';
import { useTaskStore } from './src/store/taskStore';
import { useProjectStore } from './src/store/projectStore';
import { useRoutineStore } from './src/store/routineStore';
import { useChecklistStore } from './src/store/checklistStore';
import { useSportStore } from './src/store/sportStore';
import { useExerciseStore } from './src/store/exerciseStore';
import { useFlightStore } from './src/store/flightStore';
import { useHealthStore } from './src/store/healthStore';
import { useAttachmentStore } from './src/store/attachmentStore';
import { useDoctorStore } from './src/store/doctorStore';
import { useDoctorContactStore } from './src/store/doctorContactStore';
import { useContactStore } from './src/store/contactStore';
import { usePersonStore } from './src/store/personStore';
import { useLabArchiveStore } from './src/store/labArchiveStore';
import { useTravelerStore } from './src/store/travelerStore';
import { useDocumentStore } from './src/store/documentStore';
import { useCarStore } from './src/store/carStore';
import { useNoteStore } from './src/store/noteStore';
import { useMoneyStore } from './src/store/moneyStore';
import { useDailyLogStore } from './src/store/dailyLogStore';
import { useNutritionStore } from './src/store/nutritionStore';
import { useNutritionGoalStore } from './src/store/nutritionGoalStore';
import { useNutritionPlanStore } from './src/store/nutritionPlanStore';
import { useShoppingStore } from './src/store/shoppingStore';
import { useRecurringPaymentStore } from './src/store/recurringPaymentStore';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const theme = useSettingsStore((s) => s.theme);
  const loadSettings = useSettingsStore((s) => s.load);
  const loadTasks = useTaskStore((s) => s.load);
  const loadProjects = useProjectStore((s) => s.load);
  const loadRoutines = useRoutineStore((s) => s.load);
  const loadChecklist = useChecklistStore((s) => s.load);
  const loadSport = useSportStore((s) => s.load);
  const loadExercises = useExerciseStore((s) => s.load);
  const loadFlights = useFlightStore((s) => s.load);
  const loadHealth = useHealthStore((s) => s.load);
  const loadAttachments = useAttachmentStore((s) => s.load);
  const loadDoctors = useDoctorStore((s) => s.load);
  const loadDoctorContacts = useDoctorContactStore((s) => s.load);
  const loadContacts = useContactStore((s) => s.load);
  const loadPersons = usePersonStore((s) => s.load);
  const loadLabArchive = useLabArchiveStore((s) => s.load);
  const loadTravelers = useTravelerStore((s) => s.load);
  const loadDocuments = useDocumentStore((s) => s.load);
  const loadCars = useCarStore((s) => s.load);
  const loadNotes = useNoteStore((s) => s.load);
  const loadMoney = useMoneyStore((s) => s.load);
  const loadDailyLogs = useDailyLogStore((s) => s.load);
  const loadNutrition = useNutritionStore((s) => s.load);
  const loadNutritionGoals = useNutritionGoalStore((s) => s.load);
  const loadRecurringPayments = useRecurringPaymentStore((s) => s.load);
  const loadNutritionPlan = useNutritionPlanStore((s) => s.load);
  const loadShopping = useShoppingStore((s) => s.load);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadError(null);
    (async () => {
      try {
        // Load sync folder BEFORE anything opens the DB
        await loadSyncFolder();
        // Settings first (theme needed for UI), then rest in parallel. Wait for
        // every loader so retry never races still-running startup work.
        await loadSettings();
        const results = await Promise.allSettled([
          loadTasks(),
          loadProjects(),
          loadRoutines(),
          loadChecklist(),
          loadSport(),
          loadExercises(),
          loadFlights(),
          loadHealth(),
          loadAttachments(),
          loadDoctors(),
          loadDoctorContacts(),
          loadContacts(),
          loadPersons(),
          loadLabArchive(),
          loadTravelers(),
          loadDocuments(),
          loadCars(),
          loadNotes(),
          loadMoney(),
          loadDailyLogs(),
          loadNutrition(),
          loadNutritionGoals(),
          loadRecurringPayments(),
          loadNutritionPlan(),
          loadShopping(),
        ]);
        const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failures.length > 0) {
          throw new Error(failures.map((failure) => String(failure.reason?.message || failure.reason)).join('\n'));
        }
        if (!cancelled) setReady(true);
      } catch (e: any) {
        if (!cancelled) setLoadError(String(e?.message || e || 'Неизвестная ошибка'));
      }
    })();
    return () => { cancelled = true; };
  }, [retryToken]);

  if (!ready) {
    if (loadError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: theme === 'dark' ? '#1A1A1A' : '#FFF' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme === 'dark' ? '#FFF' : '#222', marginBottom: 10 }}>Не удалось запустить приложение</Text>
          <Text style={{ fontSize: 13, textAlign: 'center', color: theme === 'dark' ? '#BBB' : '#555', marginBottom: 18 }}>{loadError}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={{ backgroundColor: '#3B82F6', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 }}
            onPress={() => setRetryToken((token) => token + 1)}
          >
            <Text style={{ color: '#FFF', fontWeight: '700' }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      );
    }
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
      <QuickAddHandler />
    </>
  );
}

function QuickAddHandler() {
  const [mode, setMode] = useState<QuickAddMode | null>(null);

  const handleUrl = (url: string | null) => {
    if (!url) return;
    if (url.includes('voice')) setMode('voice');
    else if (url.includes('text')) setMode('text');
  };

  useEffect(() => {
    // Handle cold start from deeplink
    Linking.getInitialURL().then(handleUrl);
    // Handle while app is open
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return (
    <QuickAddModal
      visible={mode !== null}
      mode={mode || 'text'}
      onClose={() => setMode(null)}
    />
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
