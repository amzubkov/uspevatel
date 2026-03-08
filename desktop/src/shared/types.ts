export type Category = 'IN' | 'DAY' | 'LATER' | 'CONTROL' | 'MAYBE';

export interface Task {
  id: string;
  subject: string;
  action: string;
  category: Category;
  contextCategory?: string;
  project?: string;
  notes: string;
  startDate?: string;
  priority: 'high' | 'normal' | 'low';
  isRecurring: boolean;
  recurDays?: number[];
  completed: boolean;
  completedAt?: string;
  deadline?: string;
  createdAt: string;
  updatedAt: string;
  reminderAt?: string;
}

export interface Project {
  id: string;
  name: string; // UPPERCASE
  isCurrent: boolean;
  notes: string;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  IN: 'In',
  DAY: 'Day',
  LATER: 'Later',
  CONTROL: 'Control',
  MAYBE: 'MAYBE',
};

export const CATEGORY_SHORT: Record<Category, string> = {
  IN: 'IN',
  DAY: 'DAY',
  LATER: 'LATER',
  CONTROL: 'CTRL',
  MAYBE: 'MAYBE',
};
