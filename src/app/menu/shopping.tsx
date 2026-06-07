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

function formatRangeLabel(startDate: string, endDate: string) {
  return `${startDate} → ${endDate}`;
}

function formatAmountWithUnit(amount: number, unit: string) {
  const normalizedUnit = unit.trim().toLowerCase();
  return normalizedUnit === "st" ? `${amount}` : `${amount} ${unit}`;
}

export default function ShoppingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const params = useLocalSearchParams<{ menuId?: string }>();

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [items, setItems] = useState<ApiShoppingListItem[]>([]);
  const [conflicts, setConflicts] = useState<ApiShoppingListConflict[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  async function toggleItemChecked(ingredientKey: string) {
    if (!activeMenuId) {
      return;
    }

    const currentlyChecked = checkedItems.has(ingredientKey);
    const nextChecked = !currentlyChecked;

    const optimistic = new Set(checkedItems);
    if (nextChecked) {
      optimistic.add(ingredientKey);
    } else {
      optimistic.delete(ingredientKey);
    }
    setCheckedItems(optimistic);

    try {
      const response = await authorizedFetch(
        `/me/menus/${activeMenuId}/shopping/check`,
        getTokenRef.current,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredientKey, checked: nextChecked }),
        },
      );

      if (!response.ok) {
        throw new Error(`${STRINGS.shopping.fetchFailed} (${response.status})`);
      }
    } catch {
      setCheckedItems(new Set(checkedItems));
    }
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

  async function fetchShoppingList(menuId: number) {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setCheckedItems(new Set());

    try {
      const response = await authorizedFetch(
        `/me/menus/${menuId}/shopping`,
        getTokenRef.current,
      );

      if (!response.ok) {
        throw new Error(`${STRINGS.shopping.fetchFailed} (${response.status})`);
      }

      const data = (await response.json()) as ApiShoppingListResponse;
      setActiveMenuId(menuId);
      setStartDate(data.startDate);
      setEndDate(data.endDate);
      setItems(data.items);
      setConflicts(data.conflicts);
      setCheckedItems(new Set(data.checkedIngredientKeys ?? []));
    } catch (e) {
      setStartDate("");
      setEndDate("");
      setItems([]);
      setConflicts([]);
      setError(e instanceof Error ? e.message : STRINGS.menu.genericError);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const menuId = parseInt(String(params.menuId ?? ""), 10);
    if (isNaN(menuId)) {
      setIsLoading(false);
      setError(STRINGS.shopping.missingMenuId);
      return;
    }
    fetchShoppingList(menuId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, params.menuId]);

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
            {STRINGS.shopping.menuPeriod}
          </ThemedText>
          <ThemedText style={styles.rangeSummaryText}>
            {startDate && endDate ? formatRangeLabel(startDate, endDate) : "-"}
          </ThemedText>
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
                  const key = item.ingredientKey;
                  const isChecked = checkedItems.has(key);
                  return (
                    <Pressable
                      key={key}
                      onPress={() => toggleItemChecked(item.ingredientKey)}
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
