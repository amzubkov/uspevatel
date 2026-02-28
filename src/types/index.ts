export type Category = 'IN' | 'DAY' | 'LATER' | 'CONTROL' | 'MAYBE';

export interface Task {
  id: string;
  subject: string;
  action: string;
  category: Category;
  contextCategory?: string;
  project?: string;
  notes: string;
  startDate?: string; // ISO string
  priority: 'high' | 'normal' | 'low';
  isRecurring: boolean;
  recurDays?: number[]; // [1,3,5] = Mon,Wed,Fri
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  reminderAt?: string; // ISO string for scheduled notification
}

export interface SyncConflict {
  localTask: Task;
  remoteTask: Task;
  diffFields: string[];
}

export interface SyncResult {
  toExport: Task[];
  toImport: Task[];
  toDeleteFromSheet: string[];
  conflicts: SyncConflict[];
}

export interface Project {
  id: string;
  name: string; // UPPERCASE
  isCurrent: boolean;
  notes: string;
}

export interface WeekStats {
  weekStart: string;
  totalCompleted: number;
  projectCompleted: number;
  ratio: number;
  diaryEntry: string;
}

export interface Settings {
  contextCategories: string[];
  dailyReminderTime: string; // "HH:mm"
  weeklyReminderTime: string;
  weeklyReminderDay: number; // 0=Sun
  theme: 'light' | 'dark';
  fontSize: number; // 12-20, default 15
  syncUrl: string;
  lastSyncAt: string | null;
  knownSyncIds: string[];
}

export const CATEGORY_LABELS: Record<Category, string> = {
  IN: '***IN',
  DAY: '**DAY',
  LATER: '**LATER',
  CONTROL: '*CONTROL',
  MAYBE: '>>MAYBE',
};

export const CATEGORY_SHORT: Record<Category, string> = {
  IN: 'IN',
  DAY: 'DAY',
  LATER: 'LATER',
  CONTROL: 'CTRL',
  MAYBE: 'MAYBE',
};
