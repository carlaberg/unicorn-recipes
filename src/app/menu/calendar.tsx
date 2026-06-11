import { useAuth } from "@clerk/clerk-expo";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { STRINGS } from "@/constants/strings";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";
import { formatDateParam } from "@/lib/date-utils";

type CalendarWeek = {
  startDate: string;
  status: "materialized" | "rotation-virtual" | "empty";
  menuId: number | null;
  menuName: string | null;
  isRotation: boolean;
  rotationId: number | null;
  templateMenuId: number | null;
  templateName: string | null;
};

type CalendarResponse = {
  rangeStart: string;
  weeks: CalendarWeek[];
};

export default function MenuCalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const params = useLocalSearchParams<{ weekStart?: string }>();

  const [selectedWeekStart, setSelectedWeekStart] = useState(() => {
    const parsed = new Date(String(params.weekStart ?? ""));
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateParam(parsed);
    }
    return formatDateParam(new Date());
  });
  const [weeks, setWeeks] = useState<CalendarWeek[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const loadCalendar = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await authorizedFetch(
        `/me/menus/calendar?startDate=${selectedWeekStart}&weeks=26`,
        getTokenRef.current,
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menu.fetchMenusFailed} (${response.status})`,
        );
      }

      const payload = (await response.json()) as CalendarResponse;
      setWeeks(payload.weeks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menu.genericError);
      setWeeks([]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isSignedIn, selectedWeekStart]);

  useFocusEffect(
    useCallback(() => {
      loadCalendar();
    }, [loadCalendar]),
  );

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {
      [selectedWeekStart]: {
        selected: true,
        selectedColor: theme.accent,
      },
    };

    weeks.forEach((week) => {
      if (week.status === "empty") return;

      marks[week.startDate] = {
        ...(marks[week.startDate] ?? {}),
        marked: true,
        dotColor:
          week.status === "materialized" ? theme.text : theme.textSecondary,
        selected: week.startDate === selectedWeekStart,
        selectedColor: theme.accent,
      };
    });

    return marks;
  }, [weeks, selectedWeekStart, theme.accent, theme.text, theme.textSecondary]);

  async function openWeek(week: CalendarWeek) {
    if (isOpening || week.status === "empty") return;

    setIsOpening(true);
    setError(null);

    try {
      const response = await authorizedFetch(
        "/me/menus/resolve-week",
        getTokenRef.current,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: week.startDate }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menu.fetchMenusFailed} (${response.status})`,
        );
      }

      router.replace(
        `/menu?weekStart=${week.startDate}&refreshToken=${Date.now()}` as any,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menu.genericError);
    } finally {
      setIsOpening(false);
    }
  }

  function handleDayPress(dateString: string) {
    const pressedDate = new Date(dateString);
    pressedDate.setHours(0, 0, 0, 0);

    const matchingWeek = weeks.find((item) => {
      const start = new Date(item.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return pressedDate >= start && pressedDate <= end;
    });

    const periodStart = matchingWeek?.startDate ?? formatDateParam(pressedDate);
    setSelectedWeekStart(periodStart);

    const week = weeks.find((item) => item.startDate === periodStart);
    if (week && week.status !== "empty") {
      void openWeek(week);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + Spacing.two,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.three,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={[
            styles.backButton,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          <ThemedText type="small">{STRINGS.shopping.back}</ThemedText>
        </Pressable>

        <ThemedText type="subtitle">{STRINGS.menu.calendarTitle}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.hintText}>
          {STRINGS.menu.calendarHint}
        </ThemedText>

        <View
          style={[
            styles.calendarWrap,
            { borderColor: theme.backgroundElement },
          ]}
        >
          <Calendar
            firstDay={1}
            markedDates={markedDates}
            onDayPress={(day) => handleDayPress(day.dateString)}
            enableSwipeMonths
            theme={{
              backgroundColor: theme.background,
              calendarBackground: theme.background,
              monthTextColor: theme.text,
              dayTextColor: theme.text,
              textDisabledColor: theme.textSecondary,
              selectedDayTextColor: theme.accentText,
              arrowColor: theme.text,
              todayTextColor: theme.accent,
              dotColor: theme.text,
            }}
          />
        </View>

        {isLoading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : (
          <View style={styles.weekList}>
            {weeks
              .filter((week) => week.status !== "empty")
              .slice(0, 12)
              .map((week) => (
                <Pressable
                  key={week.startDate}
                  onPress={() => openWeek(week)}
                  disabled={isOpening}
                  style={[
                    styles.weekRow,
                    {
                      borderColor: theme.backgroundElement,
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}
                >
                  <View style={styles.weekRowTextWrap}>
                    <ThemedText type="smallBold">{week.startDate}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {week.status === "materialized"
                        ? week.menuName || STRINGS.menu.unnamedMenu
                        : `${STRINGS.menuRotation.templates}: ${week.templateName || STRINGS.menu.unnamedMenu}`}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {week.status === "materialized"
                      ? STRINGS.menuRotation.generated
                      : STRINGS.menuRotation.available}
                  </ThemedText>
                </Pressable>
              ))}

            {weeks.every((week) => week.status === "empty") ? (
              <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                {STRINGS.menu.noMenuInWeek}
              </ThemedText>
            ) : null}
          </View>
        )}

        {error ? (
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            {error}
          </ThemedText>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  backButton: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  hintText: {
    marginBottom: Spacing.one,
  },
  calendarWrap: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  loader: {
    marginTop: Spacing.four,
  },
  weekList: {
    gap: Spacing.two,
  },
  weekRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.two,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  weekRowTextWrap: {
    flex: 1,
    gap: 2,
  },
  emptyText: {
    textAlign: "center",
  },
});
