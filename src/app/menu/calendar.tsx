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
  isActiveRotation: boolean;
  rotationId: number | null;
  templateMenuId: number | null;
  templateName: string | null;
};

type CalendarResponse = {
  rangeStart: string;
  activeRotationId: number | null;
  weeks: CalendarWeek[];
};

type ActiveRotationResponse = {
  id: number;
} | null;

export default function MenuCalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const params = useLocalSearchParams<{ weekStart?: string }>();
  const rotationWeekColor = "#2E9B4B";
  const manualWeekColor = theme.accent;

  const [selectedWeekStart] = useState(() => {
    const parsed = new Date(String(params.weekStart ?? ""));
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateParam(parsed);
    }
    return formatDateParam(new Date());
  });
  const [initialCalendarDate] = useState(() => {
    const parsed = new Date(selectedWeekStart);
    if (Number.isNaN(parsed.getTime())) {
      return formatDateParam(new Date());
    }

    // Focus month by end-of-week so cross-month weeks (e.g. Jun 25-Jul 1)
    // naturally open in the month users expect to plan/edit.
    const weekEnd = new Date(parsed);
    weekEnd.setDate(parsed.getDate() + 6);
    return formatDateParam(weekEnd);
  });
  const [visibleMonthKey, setVisibleMonthKey] = useState(() => {
    const parsed = new Date(initialCalendarDate);
    if (Number.isNaN(parsed.getTime())) {
      const today = new Date();
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    }
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
  });
  const [weeks, setWeeks] = useState<CalendarWeek[]>([]);
  const [activeRotationId, setActiveRotationId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setVisibleMonthFromYearMonth = useCallback(
    (year: number, month: number) => {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      setVisibleMonthKey(monthKey);
    },
    [],
  );

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const loadCalendar = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;

    setIsLoading(true);
    setError(null);

    try {
      const [calendarResponse, activeRotationResponse] = await Promise.all([
        authorizedFetch(
          `/me/menus/calendar?startDate=${selectedWeekStart}&weeks=26`,
          getTokenRef.current,
        ),
        authorizedFetch("/me/menus/rotations/active", getTokenRef.current),
      ]);

      if (!calendarResponse.ok) {
        throw new Error(
          `${STRINGS.menu.fetchMenusFailed} (${calendarResponse.status})`,
        );
      }

      const payload = (await calendarResponse.json()) as CalendarResponse;
      const activeRotation = activeRotationResponse.ok
        ? ((await activeRotationResponse.json()) as ActiveRotationResponse)
        : null;
      setActiveRotationId(
        payload.activeRotationId ?? activeRotation?.id ?? null,
      );
      setWeeks(payload.weeks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menu.genericError);
      setActiveRotationId(null);
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

  const weeksInVisibleMonth = useMemo(() => {
    const monthStart = new Date(`${visibleMonthKey}-01T00:00:00`);
    if (Number.isNaN(monthStart.getTime())) return [];

    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthStart.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    return weeks.filter((week) => {
      const weekStart = new Date(week.startDate);
      if (Number.isNaN(weekStart.getTime())) return false;

      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      return weekStart <= monthEnd && weekEnd >= monthStart;
    });
  }, [visibleMonthKey, weeks]);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    // Find the earliest start date of the active rotation (if any)
    let activeRotationStartDate: Date | null = null;
    weeks.forEach((week) => {
      if (
        week.isActiveRotation === true ||
        (week.isRotation &&
          activeRotationId !== null &&
          week.rotationId === activeRotationId)
      ) {
        const weekStart = new Date(week.startDate);
        if (Number.isNaN(weekStart.getTime())) return;
        if (!activeRotationStartDate || weekStart < activeRotationStartDate) {
          activeRotationStartDate = weekStart;
        }
      }
    });

    // Mark all days from active rotation start onwards (including gray days from prev/next month)
    if (activeRotationStartDate) {
      const monthStart = new Date(`${visibleMonthKey}-01T00:00:00`);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthStart.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);

      let currentDate = new Date(activeRotationStartDate);
      // Mark up to end of visible month + buffer for gray days from next month
      const bufferEnd = new Date(monthEnd);
      bufferEnd.setDate(bufferEnd.getDate() + 7);

      while (currentDate <= bufferEnd) {
        const dayKey = formatDateParam(currentDate);
        marks[dayKey] = {
          ...(marks[dayKey] ?? {}),
          marked: true,
          dotColor: rotationWeekColor,
        };
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    weeksInVisibleMonth.forEach((week) => {
      if (week.status === "empty") return;

      const isActiveRotationWeek =
        week.isActiveRotation === true ||
        (week.isRotation &&
          activeRotationId !== null &&
          week.rotationId === activeRotationId);

      // Skip marking if already marked by active rotation span above
      if (isActiveRotationWeek) return;

      const dotColor = manualWeekColor;
      const weekStartDate = new Date(week.startDate);
      if (Number.isNaN(weekStartDate.getTime())) return;

      for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
        const day = new Date(weekStartDate);
        day.setDate(weekStartDate.getDate() + dayOffset);

        // Keep dot rendering aligned with the visible-month week list.
        const dayMonthKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
        if (dayMonthKey !== visibleMonthKey) continue;

        const dayKey = formatDateParam(day);
        marks[dayKey] = {
          ...(marks[dayKey] ?? {}),
          marked: true,
          dotColor,
        };
      }
    });

    return marks;
  }, [
    activeRotationId,
    manualWeekColor,
    rotationWeekColor,
    visibleMonthKey,
    weeksInVisibleMonth,
    weeks,
  ]);

  async function openWeek(week: CalendarWeek) {
    if (isOpening || week.status === "empty") return;

    setIsOpening(true);
    setError(null);

    try {
      if (week.status === "rotation-virtual") {
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

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/menu" as any);
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
          onPress={handleBack}
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

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: rotationWeekColor }]}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {STRINGS.menu.calendarRotationWeek}
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: manualWeekColor }]}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {STRINGS.menu.calendarManualWeek}
            </ThemedText>
          </View>
        </View>

        <View
          style={[
            styles.calendarWrap,
            { borderColor: theme.backgroundElement },
          ]}
        >
          <Calendar
            current={initialCalendarDate}
            firstDay={1}
            markedDates={markedDates}
            enableSwipeMonths
            onMonthChange={(month) => {
              setVisibleMonthFromYearMonth(month.year, month.month);
            }}
            onVisibleMonthsChange={(months) => {
              const firstVisibleMonth = months?.[0];
              if (!firstVisibleMonth) return;
              setVisibleMonthFromYearMonth(
                firstVisibleMonth.year,
                firstVisibleMonth.month,
              );
            }}
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
            {weeksInVisibleMonth.map((week) => (
              <View
                key={week.startDate}
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
                    {week.status === "empty"
                      ? STRINGS.menu.noMenuInWeek
                      : week.status === "materialized"
                        ? week.menuName || STRINGS.menu.unnamedMenu
                        : `${STRINGS.menuRotation.templates}: ${week.templateName || STRINGS.menu.unnamedMenu}`}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => openWeek(week)}
                  disabled={isOpening || week.status === "empty"}
                  style={[
                    styles.editWeekButton,
                    {
                      backgroundColor:
                        week.status === "empty"
                          ? theme.backgroundSelected
                          : theme.background,
                      borderColor: theme.backgroundSelected,
                      opacity: isOpening || week.status === "empty" ? 0.6 : 1,
                    },
                  ]}
                >
                  <ThemedText type="small">{STRINGS.menu.editWeek}</ThemedText>
                </Pressable>
              </View>
            ))}

            {weeksInVisibleMonth.length === 0 ? (
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
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
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
  editWeekButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  emptyText: {
    textAlign: "center",
  },
});
