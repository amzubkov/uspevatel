import { useSettingsStore } from '../store/settingsStore';
import { useTaskStore } from '../store/taskStore';
import { useProjectStore } from '../store/projectStore';
import { useRoutineStore } from '../store/routineStore';
import { useChecklistStore } from '../store/checklistStore';
import { useSportStore } from '../store/sportStore';
import { useExerciseStore } from '../store/exerciseStore';
import { useFlightStore } from '../store/flightStore';
import { useHealthStore } from '../store/healthStore';
import { useAttachmentStore } from '../store/attachmentStore';
import { useDoctorStore } from '../store/doctorStore';
import { useDoctorContactStore } from '../store/doctorContactStore';
import { useContactStore } from '../store/contactStore';
import { usePersonStore } from '../store/personStore';
import { useLabArchiveStore } from '../store/labArchiveStore';
import { useTravelerStore } from '../store/travelerStore';
import { useDocumentStore } from '../store/documentStore';
import { useCarStore } from '../store/carStore';
import { useNoteStore } from '../store/noteStore';
import { useMoneyStore } from '../store/moneyStore';
import { useDailyLogStore } from '../store/dailyLogStore';
import { useNutritionStore } from '../store/nutritionStore';
import { useNutritionGoalStore } from '../store/nutritionGoalStore';
import { useNutritionPlanStore } from '../store/nutritionPlanStore';
import { useShoppingStore } from '../store/shoppingStore';
import { useRecurringPaymentStore } from '../store/recurringPaymentStore';

type LoadableStore = {
  getState: () => { load: () => Promise<void> };
  setState: (partial: { loaded: boolean }) => void;
};

const dataStores: LoadableStore[] = [
  useTaskStore,
  useProjectStore,
  useRoutineStore,
  useChecklistStore,
  useSportStore,
  useExerciseStore,
  useFlightStore,
  useHealthStore,
  useAttachmentStore,
  useDoctorStore,
  useDoctorContactStore,
  useContactStore,
  usePersonStore,
  useLabArchiveStore,
  useTravelerStore,
  useDocumentStore,
  useCarStore,
  useNoteStore,
  useMoneyStore,
  useDailyLogStore,
  useNutritionStore,
  useNutritionGoalStore,
  useRecurringPaymentStore,
  useNutritionPlanStore,
  useShoppingStore,
] as LoadableStore[];

/** Reload all in-memory Zustand snapshots after replacing or deleting SQLite. */
export async function reloadDatabaseStores(): Promise<void> {
  useSettingsStore.setState({ loaded: false });
  for (const store of dataStores) store.setState({ loaded: false });

  // Settings first: components may immediately read theme/font values.
  await useSettingsStore.getState().load();
  await Promise.all(dataStores.map((store) => store.getState().load()));
}

