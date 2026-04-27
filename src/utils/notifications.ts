import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleDailyReminder(hour: number, minute: number) {
  await Notifications.cancelScheduledNotificationAsync('daily-routine');
  await Notifications.scheduleNotificationAsync({
    identifier: 'daily-routine',
    content: {
      title: 'Ежедневный регламент',
      body: 'Время обработать входящие и спланировать день!',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function scheduleWeeklyReminder(weekday: number, hour: number, minute: number) {
  await Notifications.cancelScheduledNotificationAsync('weekly-routine');
  await Notifications.scheduleNotificationAsync({
    identifier: 'weekly-routine',
    content: {
      title: 'Еженедельный обзор',
      body: 'Время для еженедельного обзора проектов и статистики!',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday,
      hour,
      minute,
    },
  });
}

export async function scheduleTaskReminder(taskId: string, taskAction: string, date: Date): Promise<string | null> {
  const granted = await requestPermissions();
  if (!granted) return null;

  const id = await Notifications.scheduleNotificationAsync({
    identifier: `task-${taskId}`,
    content: {
      title: '🔔 Напоминание',
      body: taskAction,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
    },
  });
  return id;
}

export async function cancelTaskReminder(taskId: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(`task-${taskId}`);
  } catch {}
}

export async function scheduleFlightReminder(
  flightId: string,
  title: string,
  departDate: string,
  departTime?: string,
): Promise<string | null> {
  if (!departTime) return null;

  const departure = new Date(`${departDate}T${departTime}`);
  if (isNaN(departure.getTime())) return null;

  const reminderDate = new Date(departure.getTime() - 3 * 60 * 60 * 1000);
  if (reminderDate.getTime() <= Date.now()) return null;

  const granted = await requestPermissions();
  if (!granted) return null;

  const id = await Notifications.scheduleNotificationAsync({
    identifier: `flight-${flightId}`,
    content: {
      title: '✈️ Вылет через 3 часа',
      body: title,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderDate,
    },
  });
  return id;
}

export async function cancelFlightReminder(flightId: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(`flight-${flightId}`);
  } catch {}
}
