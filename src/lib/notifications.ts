import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Linking, Platform } from "react-native";

import { STRINGS } from "@/constants/strings";
import { formatDateParam, parseDateParam } from "@/lib/date-utils";

export type NotificationDeliveryMethod = "CALENDAR" | "SMS" | "APP";

export type ApiNotification = {
  id: number;
  date: string;
  time: string;
  message: string;
  repeatsWeekly: boolean;
  deliveryMethods: NotificationDeliveryMethod[];
  createdAt: string;
  updatedAt: string;
};

type ScheduledNotificationMap = Record<string, string[]>;

const STORAGE_KEY = "scheduled-notification-map-v1";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function parseTimeParts(time: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function getStorageAdapter() {
  if (Platform.OS === "web") {
    return {
      async getItem(key: string) {
        return localStorage.getItem(key);
      },
      async setItem(key: string, value: string) {
        localStorage.setItem(key, value);
      },
    };
  }

  return {
    getItem: SecureStore.getItemAsync,
    setItem: SecureStore.setItemAsync,
  };
}

async function readScheduledNotificationMap(): Promise<ScheduledNotificationMap> {
  const rawValue = await getStorageAdapter().getItem(STORAGE_KEY);
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as ScheduledNotificationMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeScheduledNotificationMap(map: ScheduledNotificationMap) {
  await getStorageAdapter().setItem(STORAGE_KEY, JSON.stringify(map));
}

function createNotificationDateTime(notification: Pick<ApiNotification, "date" | "time">) {
  const parsedDate = parseDateParam(notification.date);
  const parsedTime = parseTimeParts(notification.time);
  if (!parsedDate || !parsedTime) {
    return null;
  }

  parsedDate.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
  return parsedDate;
}

function getUpcomingDateTime(notification: Pick<ApiNotification, "date" | "time" | "repeatsWeekly">) {
  const scheduledAt = createNotificationDateTime(notification);
  if (!scheduledAt) {
    return null;
  }

  if (!notification.repeatsWeekly) {
    return scheduledAt;
  }

  const upcoming = new Date(scheduledAt);
  while (upcoming.getTime() <= Date.now()) {
    upcoming.setDate(upcoming.getDate() + 7);
  }

  return upcoming;
}

function formatGoogleCalendarTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}${second}`;
}

async function ensureNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return (
    requested.granted ||
    requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export function formatNotificationDateLabel(notification: Pick<ApiNotification, "date" | "time">) {
  const scheduledAt = createNotificationDateTime(notification);
  if (!scheduledAt) {
    return `${notification.date} ${notification.time}`;
  }

  return `${formatDateParam(scheduledAt)} ${notification.time}`;
}

export async function cancelScheduledAppNotification(notificationId: number) {
  const map = await readScheduledNotificationMap();
  const storageKey = String(notificationId);
  const identifiers = map[storageKey] ?? [];

  await Promise.all(
    identifiers.map(async (identifier) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      } catch {
        // Ignore missing native schedule ids.
      }
    }),
  );

  if (storageKey in map) {
    delete map[storageKey];
    await writeScheduledNotificationMap(map);
  }
}

export async function syncScheduledAppNotification(notification: ApiNotification) {
  await cancelScheduledAppNotification(notification.id);

  if (!notification.deliveryMethods.includes("APP")) {
    return { scheduled: false as const };
  }

  if (Platform.OS === "web") {
    return {
      scheduled: false as const,
      error: STRINGS.notifications.appScheduleUnavailable,
    };
  }

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    return {
      scheduled: false as const,
      error: STRINGS.notifications.appPermissionDenied,
    };
  }

  const scheduledAt = notification.repeatsWeekly
    ? getUpcomingDateTime(notification)
    : createNotificationDateTime(notification);

  if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
    return {
      scheduled: false as const,
      error: STRINGS.notifications.appSchedulePast,
    };
  }

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: STRINGS.notifications.title,
      body: notification.message,
    },
    trigger: notification.repeatsWeekly
      ? {
          weekday: scheduledAt.getDay() + 1,
          hour: scheduledAt.getHours(),
          minute: scheduledAt.getMinutes(),
          repeats: true,
        }
      : scheduledAt,
  });

  const map = await readScheduledNotificationMap();
  map[String(notification.id)] = [identifier];
  await writeScheduledNotificationMap(map);

  return { scheduled: true as const };
}

export async function openCalendarForNotification(notification: ApiNotification) {
  const scheduledAt = getUpcomingDateTime(notification) ?? createNotificationDateTime(notification);
  if (!scheduledAt) {
    throw new Error(STRINGS.notifications.invalidDate);
  }

  const endAt = new Date(scheduledAt.getTime() + 30 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: STRINGS.notifications.title,
    details: notification.message,
    dates: `${formatGoogleCalendarTimestamp(scheduledAt)}/${formatGoogleCalendarTimestamp(endAt)}`,
  });

  if (notification.repeatsWeekly) {
    params.set("recur", "RRULE:FREQ=WEEKLY");
  }

  await Linking.openURL(`https://calendar.google.com/calendar/render?${params.toString()}`);
}

export async function openSmsForNotification(notification: ApiNotification) {
  const separator = Platform.OS === "ios" ? "&" : "?";
  await Linking.openURL(
    `sms:${separator}body=${encodeURIComponent(notification.message)}`,
  );
}
