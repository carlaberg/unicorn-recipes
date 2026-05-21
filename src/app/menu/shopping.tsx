import { useAuth } from "@clerk/clerk-expo";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import {
    ApiShoppingListConflict,
    ApiShoppingListItem,
    ApiShoppingListResponse,
} from "@/data/mock-data";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";
import { formatDateParam, getWeekStart } from "@/lib/date-utils";

function getDefaultRange() {
  const start = getWeekStart(new Date());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    startDate: formatDateParam(start),
    endDate: formatDateParam(end),
  };
}

function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDateParam(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRangeLabel(startDate: string, endDate: string) {
  return `${startDate} → ${endDate}`;
}

function formatAmountWithUnit(amount: number, unit: string) {
  const normalizedUnit = unit.trim().toLowerCase();
  return normalizedUnit === "st" ? `${amount}` : `${amount} ${unit}`;
}

function normalizeDateForRange(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function buildRangeMarkedDates(
  startDateValue: Date,
  endDateValue: Date,
  rangeColor: string,
  textColor: string,
) {
  const startKey = formatDateParam(startDateValue);
  const endKey = formatDateParam(endDateValue);
  const markedDates: Record<string, any> = {};

  const current = new Date(startDateValue);
  while (current <= endDateValue) {
    const key = formatDateParam(current);
    markedDates[key] = {
      color: rangeColor,
      textColor,
      startingDay: key === startKey,
      endingDay: key === endKey,
    };
    current.setDate(current.getDate() + 1);
  }

  return markedDates;
}

export default function ShoppingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const params = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
  }>();

  const defaults = getDefaultRange();
  const [startDate, setStartDate] = useState(
    typeof params.startDate === "string"
      ? params.startDate
      : defaults.startDate,
  );
  const [endDate, setEndDate] = useState(
    typeof params.endDate === "string" ? params.endDate : defaults.endDate,
  );
  const [items, setItems] = useState<ApiShoppingListItem[]>([]);
  const [conflicts, setConflicts] = useState<ApiShoppingListConflict[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [startDateValue, setStartDateValue] = useState<Date>(() =>
    normalizeDateForRange(parseDateParam(startDate) ?? new Date()),
  );
  const [endDateValue, setEndDateValue] = useState<Date>(() =>
    normalizeDateForRange(parseDateParam(endDate) ?? addDays(new Date(), 6)),
  );
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [selectionPhase, setSelectionPhase] = useState<"start" | "end">(
    "start",
  );

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  async function applyRangeValues(nextStart: Date, nextEnd: Date) {
    const nextStartDate = formatDateParam(nextStart);
    const nextEndDate = formatDateParam(nextEnd);

    if (nextStartDate > nextEndDate) {
      setError(STRINGS.shopping.invalidDateRange);
      return;
    }

    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    setIsCalendarVisible(false);
    setSelectionPhase("start");
    await fetchShoppingList(nextStartDate, nextEndDate);
  }

  function toggleCalendar() {
    setIsCalendarVisible((currentVisible) => {
      const nextVisible = !currentVisible;
      if (nextVisible) {
        setSelectionPhase("start");
      }
      return nextVisible;
    });
  }

  function handleCalendarDayPress(dateString: string) {
    const selectedDate = normalizeDateForRange(new Date(dateString));
    if (selectionPhase === "start") {
      setStartDateValue(selectedDate);
      setEndDateValue(selectedDate);
      setSelectionPhase("end");
      return;
    }

    if (selectedDate < startDateValue) {
      const nextStart = selectedDate;
      const nextEnd = normalizeDateForRange(startDateValue);
      setStartDateValue(nextStart);
      setEndDateValue(nextEnd);
      setSelectionPhase("start");
      void applyRangeValues(nextStart, nextEnd);
    } else {
      const nextStart = normalizeDateForRange(startDateValue);
      const nextEnd = selectedDate;
      setEndDateValue(nextEnd);
      setSelectionPhase("start");
      void applyRangeValues(nextStart, nextEnd);
    }
  }

  function toggleItemChecked(ingredientName: string, unit: string) {
    const key = `${ingredientName}-${unit}`;
    const newChecked = new Set(checkedItems);
    if (newChecked.has(key)) {
      newChecked.delete(key);
    } else {
      newChecked.add(key);
    }
    setCheckedItems(newChecked);
  }

  function groupByIngredient() {
    const grouped = new Map<string, ApiShoppingListItem[]>();
    for (const item of items) {
      if (!grouped.has(item.ingredientName)) {
        grouped.set(item.ingredientName, []);
      }
      grouped.get(item.ingredientName)!.push(item);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }

  async function fetchShoppingList(nextStartDate: string, nextEndDate: string) {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    if (!isValidDateInput(nextStartDate) || !isValidDateInput(nextEndDate)) {
      setError(STRINGS.shopping.invalidDateRange);
      return;
    }

    if (nextStartDate > nextEndDate) {
      setError(STRINGS.shopping.invalidDateRange);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCheckedItems(new Set());

    try {
      const response = await authorizedFetch(
        `/me/menus/shopping?startDate=${nextStartDate}&endDate=${nextEndDate}`,
        getTokenRef.current,
      );

      if (!response.ok) {
        throw new Error(`${STRINGS.shopping.fetchFailed} (${response.status})`);
      }

      const data = (await response.json()) as ApiShoppingListResponse;
      setItems(data.items);
      setConflicts(data.conflicts);
    } catch (e) {
      setItems([]);
      setConflicts([]);
      setError(e instanceof Error ? e.message : STRINGS.menu.genericError);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchShoppingList(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

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

        <ThemedText type="subtitle" style={styles.title}>
          {STRINGS.shopping.title}
        </ThemedText>

        <View style={styles.rangeSummaryWrap}>
          <ThemedText type="small" themeColor="textSecondary">
            {STRINGS.shopping.dateRange}
          </ThemedText>
          <ThemedText style={styles.rangeSummaryText}>
            {formatRangeLabel(startDate, endDate)}
          </ThemedText>
          <Pressable
            onPress={toggleCalendar}
            style={[
              styles.datePickerButton,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <ThemedText>
              {isCalendarVisible
                ? STRINGS.shopping.hideRange
                : STRINGS.shopping.changeRange}
            </ThemedText>
          </Pressable>

          {isCalendarVisible ? (
            <View style={styles.calendarWrap}>
              <Calendar
                current={formatDateParam(startDateValue)}
                markingType="period"
                markedDates={buildRangeMarkedDates(
                  startDateValue,
                  endDateValue,
                  theme.backgroundElement,
                  theme.text,
                )}
                onDayPress={(day) => handleCalendarDayPress(day.dateString)}
                theme={{
                  backgroundColor: theme.background,
                  calendarBackground: theme.background,
                  dayTextColor: theme.text,
                  textDisabledColor: theme.textSecondary,
                  monthTextColor: theme.text,
                  textSectionTitleColor: theme.textSecondary,
                  arrowColor: theme.text,
                  todayTextColor: "#FF8A00",
                }}
                enableSwipeMonths
              />
            </View>
          ) : null}
        </View>

        {isLoading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : error ? (
          <ThemedText themeColor="textSecondary" style={styles.message}>
            {error}
          </ThemedText>
        ) : items.length === 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.message}>
            {STRINGS.shopping.empty}
          </ThemedText>
        ) : (
          <View style={styles.listWrap}>
            {groupByIngredient().map(([ingredientName, ingredientItems]) => (
              <View key={ingredientName} style={styles.ingredientGroup}>
                <ThemedText style={styles.ingredientName}>
                  {ingredientName}
                </ThemedText>
                {ingredientItems.map((item) => {
                  const key = `${item.ingredientName}-${item.unit}`;
                  const isChecked = checkedItems.has(key);
                  return (
                    <Pressable
                      key={key}
                      onPress={() =>
                        toggleItemChecked(ingredientName, item.unit)
                      }
                      style={[
                        styles.itemRow,
                        {
                          borderBottomColor: theme.backgroundElement,
                          backgroundColor: isChecked
                            ? theme.backgroundElement
                            : "transparent",
                        },
                      ]}
                    >
                      <View
                        style={[styles.checkbox, { borderColor: theme.text }]}
                      >
                        {isChecked && (
                          <ThemedText style={styles.checkmark}>✓</ThemedText>
                        )}
                      </View>
                      <View style={styles.itemDetails}>
                        <ThemedText
                          style={[
                            styles.itemUnit,
                            isChecked && { textDecorationLine: "line-through" },
                          ]}
                        >
                          {formatAmountWithUnit(item.totalAmount, item.unit)}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {item.recipeCount} recipe
                          {item.recipeCount === 1 ? "" : "s"}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {conflicts.length > 0 && (
          <View style={styles.conflictsWrap}>
            <ThemedText type="small" themeColor="textSecondary">
              {STRINGS.shopping.conflictsTitle}
            </ThemedText>
            {conflicts.map((conflict) => (
              <ThemedText
                key={conflict.ingredientName}
                themeColor="textSecondary"
              >
                {conflict.ingredientName}: {conflict.units.join(", ")}
              </ThemedText>
            ))}
          </View>
        )}
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  title: {
    marginTop: Spacing.one,
  },
  rangeSummaryWrap: {
    gap: Spacing.one,
  },
  rangeSummaryText: {
    fontWeight: "600",
  },
  datePickerButton: {
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignSelf: "flex-start",
  },
  calendarWrap: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: Spacing.one,
  },
  loader: {
    marginTop: Spacing.four,
  },
  message: {
    marginTop: Spacing.three,
    textAlign: "center",
  },
  listWrap: {
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  ingredientGroup: {
    gap: Spacing.one,
  },
  ingredientName: {
    fontWeight: "600",
    textTransform: "capitalize",
    marginBottom: Spacing.one,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: 6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmark: {
    fontSize: 14,
    fontWeight: "600",
  },
  itemDetails: {
    flex: 1,
  },
  itemUnit: {
    fontWeight: "500",
  },
  conflictsWrap: {
    marginTop: Spacing.three,
    gap: Spacing.one,
  },
});
