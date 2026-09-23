import { useAuth } from "@clerk/clerk-expo";
import React, { useEffect } from "react";

import {
  cancelAllScheduledAppNotifications,
  registerRemotePushToken,
} from "@/lib/notifications";

export function PushNotificationBootstrap() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    let cancelled = false;

    async function bootstrapPushNotifications() {
      if (!isLoaded || !isSignedIn) {
        return;
      }

      const result = await registerRemotePushToken(getToken);
      if (!cancelled && result.mode === "remote") {
        await cancelAllScheduledAppNotifications();
      }
    }

    bootstrapPushNotifications();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  return null;
}
