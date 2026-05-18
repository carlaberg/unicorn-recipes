import { useAuth } from "@clerk/clerk-expo";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { STRINGS } from "@/constants/strings";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";
import {
  DAY_NAMES,
  formatDateParam,
  formatWeekRange,
  getWeekStart,
  isSameDay,
} from "@/lib/date-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type MealType = "LUNCH" | "DINNER";

type MenuRecipe = {
  id: number;
  name: string;
  image: string;
};

type MenuEntry = {
  id: number;
  weeklyMenuId: number;
  dayOffset: number;
  mealType: MealType;
  recipeId: number;
  recipe: MenuRecipe;
};

type WeeklyMenu = {
  id: number;
  userId: number;
  name: string | null;
  startDate: string | null;
  createdAt?: string;
  updatedAt?: string;
  menuEntries: MenuEntry[];
};

// ─── Slot component ───────────────────────────────────────────────────────────

function MealSlot({
  label,
  entry,
  onAdd,
  onRemove,
}: {
  label: string;
  entry: MenuEntry | undefined;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.slot}>
      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={styles.slotLabel}
      >
        {label}
      </ThemedText>
      {entry ? (
        <View
          style={[
            styles.slotFilled,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          <Image
            source={{ uri: entry.recipe.image }}
            style={styles.slotImage}
            resizeMode="cover"
          />
          <ThemedText type="small" style={styles.slotName} numberOfLines={1}>
            {entry.recipe.name}
          </ThemedText>
          <Pressable onPress={onRemove} hitSlop={8} style={styles.removeButton}>
            <ThemedText type="small" themeColor="textSecondary">
              ×
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={[styles.slotEmpty, { borderColor: theme.backgroundElement }]}
          onPress={onAdd}
        >
          <ThemedText themeColor="textSecondary" style={styles.slotPlus}>
            +
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

// ─── Day row ──────────────────────────────────────────────────────────────────

function DayRow({
  dayOffset,
  dayLabel,
  entries,
  menuId,
  onAdd,
  onRemove,
}: {
  dayOffset: number;
  dayLabel: string;
  entries: MenuEntry[];
  menuId: number;
  onAdd: (dayOffset: number, mealType: MealType) => void;
  onRemove: (entry: MenuEntry) => void;
}) {
  const theme = useTheme();
  const lunch = entries.find((e) => e.mealType === "LUNCH");
  const dinner = entries.find((e) => e.mealType === "DINNER");

  return (
    <View
      style={[styles.dayRow, { borderBottomColor: theme.backgroundElement }]}
    >
      <ThemedText style={styles.dayLabel}>{dayLabel}</ThemedText>
      <View style={styles.slots}>
        <MealSlot
          label={STRINGS.menu.lunch}
          entry={lunch}
          onAdd={() => onAdd(dayOffset, "LUNCH")}
          onRemove={() => lunch && onRemove(lunch)}
        />
        <MealSlot
          label={STRINGS.menu.dinner}
          entry={dinner}
          onAdd={() => onAdd(dayOffset, "DINNER")}
          onRemove={() => dinner && onRemove(dinner)}
        />
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MenuScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const { refreshToken, weekStart } = useLocalSearchParams<{
    refreshToken?: string;
    weekStart?: string;
  }>();

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    getWeekStart(new Date()),
  );
  const [allMenus, setAllMenus] = useState<WeeklyMenu[]>([]);
  const [activeMenu, setActiveMenu] = useState<WeeklyMenu | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isReusingMenuId, setIsReusingMenuId] = useState<number | null>(null);
  const [menuNameInput, setMenuNameInput] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedMenuName, setEditedMenuName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!weekStart || Array.isArray(weekStart)) return;

    const parsed = new Date(weekStart);
    if (Number.isNaN(parsed.getTime())) return;

    const nextWeekStart = getWeekStart(parsed);
    setCurrentWeekStart((prev) =>
      isSameDay(prev, nextWeekStart) ? prev : nextWeekStart,
    );
  }, [weekStart]);

  const fetchMenus = useCallback(
    async (weekStart: Date) => {
      if (!isLoaded || !isSignedIn) return;

      setIsLoading(true);
      setError(null);

      try {
        const res = await authorizedFetch("/me/menus", getTokenRef.current);
        if (!res.ok) {
          throw new Error(`${STRINGS.menu.fetchMenusFailed} (${res.status})`);
        }

        const menus = (await res.json()) as WeeklyMenu[];
        setAllMenus(menus);

        const match =
          menus.find((m) => {
            if (!m.startDate) return false;
            return isSameDay(new Date(m.startDate), weekStart);
          }) ?? null;

        setActiveMenu(match);
      } catch (e) {
        setError(e instanceof Error ? e.message : STRINGS.menu.genericError);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoaded, isSignedIn],
  );

  useFocusEffect(
    useCallback(() => {
      fetchMenus(currentWeekStart);
    }, [fetchMenus, currentWeekStart]),
  );

  useEffect(() => {
    if (!refreshToken || Array.isArray(refreshToken)) return;
    fetchMenus(currentWeekStart);
  }, [refreshToken, currentWeekStart, fetchMenus]);

  useEffect(() => {
    setEditedMenuName(activeMenu?.name?.trim() ?? "");
    setIsEditingName(false);
  }, [activeMenu?.id, activeMenu?.name]);

  function navigateWeek(delta: number) {
    setCurrentWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta * 7);
      return next;
    });
  }

  async function createMenu(sourceMenu?: WeeklyMenu) {
    if (sourceMenu) {
      setIsReusingMenuId(sourceMenu.id);
    } else {
      setIsCreating(true);
    }

    try {
      const typedName = menuNameInput.trim();
      const menuName = typedName || sourceMenu?.name || undefined;

      const res = await authorizedFetch("/me/menus", getTokenRef.current, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: formatDateParam(currentWeekStart),
          ...(menuName && { name: menuName }),
        }),
      });
      if (!res.ok) {
        throw new Error(`${STRINGS.menu.createMenuFailed} (${res.status})`);
      }

      const createdMenu = (await res.json()) as WeeklyMenu;

      if (sourceMenu) {
        for (const entry of sourceMenu.menuEntries) {
          const copyRes = await authorizedFetch(
            `/me/menus/${createdMenu.id}/${entry.dayOffset}/${entry.mealType}`,
            getTokenRef.current,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ recipeId: entry.recipeId }),
            },
          );

          if (!copyRes.ok) {
            throw new Error(
              `${STRINGS.menu.copyMenuFailed} (${copyRes.status})`,
            );
          }
        }
      }

      setMenuNameInput("");
      await fetchMenus(currentWeekStart);
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menu.genericError);
    } finally {
      setIsCreating(false);
      setIsReusingMenuId(null);
    }
  }

  async function removeEntry(entry: MenuEntry) {
    if (!activeMenu) return;
    try {
      await authorizedFetch(
        `/me/menus/${activeMenu.id}/${entry.dayOffset}/${entry.mealType}`,
        getTokenRef.current,
        { method: "DELETE" },
      );
      setActiveMenu((prev) =>
        prev
          ? {
              ...prev,
              menuEntries: prev.menuEntries.filter((e) => e.id !== entry.id),
            }
          : prev,
      );
    } catch {
      // silent — re-fetch will reconcile
      await fetchMenus(currentWeekStart);
    }
  }

  async function saveMenuName() {
    if (!activeMenu || isSavingName) return;

    const trimmedName = editedMenuName.trim();
    if (!trimmedName) {
      setError(STRINGS.menu.menuNameRequired);
      return;
    }

    setIsSavingName(true);
    setError(null);

    try {
      const res = await authorizedFetch(
        `/me/menus/${activeMenu.id}`,
        getTokenRef.current,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmedName }),
        },
      );

      if (!res.ok) {
        throw new Error(`${STRINGS.menu.updateMenuFailed} (${res.status})`);
      }

      const updatedMenu = (await res.json()) as WeeklyMenu;
      setActiveMenu(updatedMenu);
      setAllMenus((prev) =>
        prev.map((menu) => (menu.id === updatedMenu.id ? updatedMenu : menu)),
      );
      setEditedMenuName(updatedMenu.name ?? "");
      setIsEditingName(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menu.genericError);
    } finally {
      setIsSavingName(false);
    }
  }

  function handleAdd(dayOffset: number, mealType: MealType) {
    if (!activeMenu) return;
    router.push(
      `/menu/pick?menuId=${activeMenu.id}&dayOffset=${dayOffset}&mealType=${mealType}&weekStart=${formatDateParam(currentWeekStart)}`,
    );
  }

  const reusableMenus = allMenus.filter((menu) => {
    if (menu.menuEntries.length === 0) return false;
    if (!menu.startDate) return true;
    return !isSameDay(new Date(menu.startDate), currentWeekStart);
  });

  function getMenuDisplayName(menu: WeeklyMenu) {
    const baseName = menu.name?.trim() || STRINGS.menu.unnamedMenu;
    if (!menu.startDate) return baseName;
    const start = getWeekStart(new Date(menu.startDate));
    return `${baseName} - ${formatWeekRange(start)}`;
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + Spacing.four,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.three,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => navigateWeek(-1)}
            hitSlop={12}
            style={styles.navArrow}
          >
            <ThemedText style={styles.arrowText}>‹</ThemedText>
          </Pressable>
          <View style={styles.weekLabelWrap}>
            <ThemedText type="subtitle" style={styles.weekLabel}>
              {formatWeekRange(currentWeekStart)}
            </ThemedText>
            {!!activeMenu &&
              (isEditingName ? (
                <View style={styles.editNameWrap}>
                  <TextInput
                    value={editedMenuName}
                    onChangeText={setEditedMenuName}
                    placeholder={STRINGS.menu.menuNamePlaceholder}
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.editNameInput,
                      {
                        borderColor: theme.backgroundElement,
                        color: theme.text,
                      },
                    ]}
                  />
                  <View style={styles.editNameActions}>
                    <Pressable
                      onPress={() => {
                        setEditedMenuName(activeMenu.name?.trim() ?? "");
                        setIsEditingName(false);
                      }}
                      disabled={isSavingName}
                    >
                      <ThemedText themeColor="textSecondary">
                        {STRINGS.menu.cancel}
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={saveMenuName} disabled={isSavingName}>
                      <ThemedText>
                        {isSavingName ? STRINGS.menu.saving : STRINGS.menu.save}
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.activeNameWrap}>
                  {!!activeMenu.name && (
                    <ThemedText
                      themeColor="textSecondary"
                      style={styles.activeMenuName}
                    >
                      {activeMenu.name}
                    </ThemedText>
                  )}
                  <Pressable onPress={() => setIsEditingName(true)}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {STRINGS.menu.edit}
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
          </View>
          <Pressable
            onPress={() => navigateWeek(1)}
            hitSlop={12}
            style={styles.navArrow}
          >
            <ThemedText style={styles.arrowText}>›</ThemedText>
          </Pressable>
        </View>

        {/* Body */}
        {isLoading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : error ? (
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            {error}
          </ThemedText>
        ) : !activeMenu ? (
          <View style={styles.emptyState}>
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              {STRINGS.menu.noMenuForWeek}
            </ThemedText>
            <TextInput
              value={menuNameInput}
              onChangeText={setMenuNameInput}
              placeholder={STRINGS.menu.menuNameOptionalPlaceholder}
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.nameInput,
                {
                  borderColor: theme.backgroundElement,
                  color: theme.text,
                },
              ]}
            />
            <Pressable
              style={[
                styles.createButton,
                { backgroundColor: theme.backgroundElement },
              ]}
              onPress={() => createMenu()}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <ThemedText>{STRINGS.menu.createMenu}</ThemedText>
              )}
            </Pressable>

            {reusableMenus.length > 0 && (
              <View style={styles.reuseSection}>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  style={styles.reuseTitle}
                >
                  {STRINGS.menu.reusePrevious}
                </ThemedText>
                {reusableMenus.map((menu) => (
                  <Pressable
                    key={menu.id}
                    style={[
                      styles.reuseButton,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                    onPress={() => createMenu(menu)}
                    disabled={isReusingMenuId === menu.id}
                  >
                    {isReusingMenuId === menu.id ? (
                      <ActivityIndicator color={theme.text} />
                    ) : (
                      <ThemedText style={styles.reuseButtonText}>
                        {getMenuDisplayName(menu)}
                      </ThemedText>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : (
          DAY_NAMES.map((name, index) => (
            <DayRow
              key={index}
              dayOffset={index}
              dayLabel={name}
              entries={activeMenu.menuEntries.filter(
                (e) => e.dayOffset === index,
              )}
              menuId={activeMenu.id}
              onAdd={handleAdd}
              onRemove={removeEntry}
            />
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: Spacing.three,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.three,
  },
  weekLabel: {
    textAlign: "center",
  },
  weekLabelWrap: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  activeMenuName: {
    textAlign: "center",
  },
  activeNameWrap: {
    alignItems: "center",
    gap: 2,
  },
  editNameWrap: {
    width: "100%",
    alignItems: "center",
    gap: Spacing.one,
  },
  editNameInput: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    minHeight: 36,
  },
  editNameActions: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  navArrow: {
    width: 36,
    alignItems: "center",
  },
  arrowText: {
    fontSize: 28,
    lineHeight: 32,
  },
  loader: {
    marginTop: Spacing.five,
  },
  emptyState: {
    alignItems: "center",
    marginTop: Spacing.five,
    width: "100%",
    gap: Spacing.three,
  },
  emptyText: {
    textAlign: "center",
  },
  nameInput: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  createButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
  },
  reuseSection: {
    width: "100%",
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  reuseTitle: {
    textAlign: "left",
  },
  reuseButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  reuseButtonText: {
    fontWeight: "500",
  },
  dayRow: {
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  dayLabel: {
    fontWeight: "600",
    marginBottom: Spacing.one,
  },
  slots: {
    gap: Spacing.two,
  },
  slot: {
    gap: Spacing.one,
  },
  slotLabel: {
    marginBottom: 2,
  },
  slotFilled: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  slotImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  slotName: {
    flex: 1,
  },
  removeButton: {
    paddingHorizontal: Spacing.one,
  },
  slotEmpty: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  slotPlus: {
    fontSize: 20,
    lineHeight: 24,
  },
});
