import { useAuth } from "@clerk/clerk-expo";
import { router } from "expo-router";
import React from "react";
import { Alert } from "react-native";

import {
  NotificationFormScreen,
  NotificationFormValues,
} from "@/components/notification-form-screen";
import { STRINGS } from "@/constants/strings";
import { authorizedFetch } from "@/lib/api";
import { formatDateParam } from "@/lib/date-utils";
import { ApiNotification, syncScheduledAppNotification } from "@/lib/notifications";

function getDefaultTime() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export default function NewNotificationScreen() {
  const { getToken } = useAuth();

  async function handleSubmit(values: NotificationFormValues) {
    try {
      const response = await authorizedFetch("/me/notifications", getToken, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        return `${STRINGS.notifications.saveFailed} (${response.status})`;
      }

      const notification = (await response.json()) as ApiNotification;
      const scheduleResult = await syncScheduledAppNotification(notification);
      if (scheduleResult.error) {
        Alert.alert(STRINGS.notifications.title, scheduleResult.error);
      }

      router.back();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : STRINGS.notifications.saveFailed;
    }
  }

  return (
    <NotificationFormScreen
      title={STRINGS.notifications.newTitle}
      submitLabel={STRINGS.notifications.save}
      submitBusyLabel={STRINGS.notifications.saving}
      initialValues={{
        date: formatDateParam(new Date()),
        time: getDefaultTime(),
        message: "",
        repeatsWeekly: false,
        deliveryMethods: ["APP"],
      }}
      onSubmit={handleSubmit}
    />
  );
}
