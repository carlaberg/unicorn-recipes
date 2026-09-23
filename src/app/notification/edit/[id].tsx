import { useAuth } from "@clerk/clerk-expo";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet } from "react-native";

import {
  NotificationFormScreen,
  NotificationFormValues,
} from "@/components/notification-form-screen";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { STRINGS } from "@/constants/strings";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";
import {
  ApiNotification,
  cancelScheduledAppNotification,
  getCurrentNotificationTimeZone,
  syncAppNotificationDelivery,
} from "@/lib/notifications";

export default function EditNotificationScreen() {
  const theme = useTheme();
  const { getToken } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const notificationId = Number(params.id);

  const [notification, setNotification] = useState<ApiNotification | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadNotification() {
      if (!notificationId) {
        setErrorMessage(STRINGS.notifications.loadFailed);
        setIsLoading(false);
        return;
      }

      try {
        const response = await authorizedFetch(
          `/me/notifications/${notificationId}`,
          getToken,
        );

        if (!response.ok) {
          throw new Error(`${STRINGS.notifications.loadFailed} (${response.status})`);
        }

        const payload = (await response.json()) as ApiNotification;
        if (!cancelled) {
          setNotification(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setErrorMessage(
            loadError instanceof Error
              ? loadError.message
              : STRINGS.notifications.loadFailed,
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadNotification();
    return () => {
      cancelled = true;
    };
  }, [getToken, notificationId]);

  async function handleSubmit(values: NotificationFormValues) {
    if (!notification) {
      return STRINGS.notifications.loadFailed;
    }

    try {
      const response = await authorizedFetch(
        `/me/notifications/${notification.id}`,
        getToken,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            ...values,
            timeZone: getCurrentNotificationTimeZone(),
          }),
        },
      );

      if (!response.ok) {
        return `${STRINGS.notifications.saveFailed} (${response.status})`;
      }

      const payload = (await response.json()) as ApiNotification;
      const scheduleResult = await syncAppNotificationDelivery(payload, getToken);
      if (scheduleResult.error) {
        Alert.alert(STRINGS.notifications.title, scheduleResult.error);
      }

      router.back();
      return null;
    } catch (submitError) {
      return submitError instanceof Error
        ? submitError.message
        : STRINGS.notifications.saveFailed;
    }
  }

  async function handleDelete() {
    if (!notification) {
      return STRINGS.notifications.deleteFailed;
    }

    try {
      const response = await authorizedFetch(
        `/me/notifications/${notification.id}`,
        getToken,
        { method: "DELETE" },
      );

      if (!response.ok) {
        return `${STRINGS.notifications.deleteFailed} (${response.status})`;
      }

      await cancelScheduledAppNotification(notification.id);
      router.back();
      return null;
    } catch (deleteError) {
      return deleteError instanceof Error
        ? deleteError.message
        : STRINGS.notifications.deleteFailed;
    }
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.text} />
      </ThemedView>
    );
  }

  if (!notification) {
    return (
      <ThemedView style={styles.centered}>
        {errorMessage ? (
          <ThemedText themeColor="textSecondary">{errorMessage}</ThemedText>
        ) : null}
      </ThemedView>
    );
  }

  return (
    <NotificationFormScreen
      title={STRINGS.notifications.editTitle}
      submitLabel={STRINGS.notifications.save}
      submitBusyLabel={STRINGS.notifications.saving}
      deleteBusyLabel={STRINGS.notifications.deleting}
      initialValues={{
        date: notification.date,
        time: notification.time,
        message: notification.message,
        repeatsWeekly: notification.repeatsWeekly,
        deliveryMethods: notification.deliveryMethods,
      }}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
