import { useAuth } from "@clerk/clerk-expo";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { STRINGS } from "@/constants/strings";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";
import {
  ApiNotification,
  formatNotificationDateLabel,
  openCalendarForNotification,
  openSmsForNotification,
} from "@/lib/notifications";

const deliveryMethodLabels = {
  APP: STRINGS.notifications.methodApp,
  SMS: STRINGS.notifications.methodSms,
  CALENDAR: STRINGS.notifications.methodCalendar,
} as const;

function NotificationCard({ notification }: { notification: ApiNotification }) {
  const theme = useTheme();

  async function handleOpenCalendar() {
    try {
      await openCalendarForNotification(notification);
    } catch {
      Alert.alert(STRINGS.notifications.title, STRINGS.notifications.calendarFailed);
    }
  }

  async function handleOpenSms() {
    try {
      await openSmsForNotification(notification);
    } catch {
      Alert.alert(STRINGS.notifications.title, STRINGS.notifications.smsFailed);
    }
  }

  return (
    <Pressable
      onPress={() => router.push(`/notification/edit/${notification.id}`)}
      style={styles.cardPressable}
    >
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText type="smallBold">{formatNotificationDateLabel(notification)}</ThemedText>
          <ThemedView
            type="backgroundSelected"
            style={styles.badge}
          >
            <ThemedText type="small">
              {notification.repeatsWeekly
                ? STRINGS.notifications.weeklyBadge
                : STRINGS.notifications.onceBadge}
            </ThemedText>
          </ThemedView>
        </View>

        <ThemedText>{notification.message}</ThemedText>

        <View style={styles.methodWrap}>
          {notification.deliveryMethods.map((method) => (
            <ThemedView
              key={method}
              type="backgroundSelected"
              style={styles.methodBadge}
            >
              <ThemedText type="small">{deliveryMethodLabels[method]}</ThemedText>
            </ThemedView>
          ))}
        </View>

        <View style={styles.actions}>
          {notification.deliveryMethods.includes("CALENDAR") ? (
            <Pressable
              onPress={handleOpenCalendar}
              style={[
                styles.actionButton,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <ThemedText type="small">
                {STRINGS.notifications.openCalendar}
              </ThemedText>
            </Pressable>
          ) : null}

          {notification.deliveryMethods.includes("SMS") ? (
            <Pressable
              onPress={handleOpenSms}
              style={[
                styles.actionButton,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <ThemedText type="small">{STRINGS.notifications.openSms}</ThemedText>
            </Pressable>
          ) : null}
        </View>

        {notification.deliveryMethods.includes("APP") ? (
          <ThemedText type="small" themeColor="textSecondary">
            {STRINGS.notifications.scheduledInApp}
          </ThemedText>
        ) : null}
      </ThemedView>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadNotifications() {
        setIsLoading(true);
        setError(null);

        if (!isLoaded || !isSignedIn) {
          setNotifications([]);
          setIsLoading(false);
          return;
        }

        try {
          const response = await authorizedFetch(
            "/me/notifications",
            getTokenRef.current,
          );

          if (!response.ok) {
            throw new Error(
              `${STRINGS.notifications.fetchFailed} (${response.status})`,
            );
          }

          const payload = (await response.json()) as ApiNotification[];
          if (!cancelled) {
            setNotifications(payload);
          }
        } catch (loadError) {
          if (!cancelled) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : STRINGS.notifications.fetchFailed,
            );
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      }

      loadNotifications();
      return () => {
        cancelled = true;
      };
    }, [isLoaded, isSignedIn]),
  );

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <NotificationCard notification={item} />}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: insets.top + Spacing.four,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.six,
          },
        ]}
        ListHeaderComponent={
          <ThemedView style={styles.header}>
            <ThemedText type="subtitle">{STRINGS.notifications.title}</ThemedText>
          </ThemedView>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={theme.text} />
          ) : error ? (
            <ThemedText themeColor="textSecondary">{error}</ThemedText>
          ) : (
            <ThemedText themeColor="textSecondary">
              {STRINGS.notifications.empty}
            </ThemedText>
          )
        }
      />

      <Pressable
        onPress={() => router.push("/notification/new")}
        style={[
          styles.fab,
          {
            backgroundColor: theme.accent,
            bottom: insets.bottom + BottomTabInset + Spacing.three,
          },
        ]}
      >
        <ThemedText style={[styles.fabLabel, { color: theme.accentText }]}>
          +
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  list: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
  },
  header: {
    marginBottom: Spacing.four,
  },
  cardPressable: {
    width: "100%",
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  methodWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  methodBadge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  actionButton: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  separator: {
    height: Spacing.three,
  },
  fab: {
    position: "absolute",
    right: Spacing.three,
    borderRadius: 999,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabLabel: {
    fontSize: 34,
    lineHeight: 34,
    fontWeight: "500",
  },
});
