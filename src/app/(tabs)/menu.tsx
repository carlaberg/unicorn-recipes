import { useAuth } from "@clerk/clerk-expo";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  formatDateParam,
  formatWeekRange,
  getDayNamesFromStartDate,
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
  recipeId: number | null;
  note: string | null;
  recipe: MenuRecipe | null;
};

type WeeklyMenu = {
  id: number;
  userId: number;
  name: string | null;
  isTemplate?: boolean;
  tags?: string[];
  startDate: string | null;
  rotationId?: number | null;
  rotationWeekIndex?: number | null;
  createdAt?: string;
  updatedAt?: string;
  menuEntries: MenuEntry[];
};

type RotationTemplateRef = {
  id: number;
  templateMenuId: number;
  orderIndex: number;
  templateMenu: {
    id: number;
    name: string | null;
  };
};

type ActiveRotation = {
  id: number;
  name: string | null;
  startDate: string;
  isActive: boolean;
  templates: RotationTemplateRef[];
};

// ─── Slot component ───────────────────────────────────────────────────────────

function MealSlot({
  label,
  entry,
  onAdd,
  onRemove,
  onOpenRecipe,
}: {
  label: string;
  entry: MenuEntry | undefined;
  onAdd: () => void;
  onRemove: () => void;
  onOpenRecipe: (entry: MenuEntry) => void;
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
          {entry.recipe ? (
            <Pressable
              style={styles.slotContentButton}
              onPress={() => onOpenRecipe(entry)}
            >
              <Image
                source={{ uri: entry.recipe.image }}
                style={styles.slotImage}
                resizeMode="cover"
              />
              <ThemedText
                type="small"
                style={styles.slotName}
                numberOfLines={1}
              >
                {entry.recipe.name}
              </ThemedText>
            </Pressable>
          ) : (
            <ThemedText type="small" style={styles.slotName} numberOfLines={2}>
              {entry.note || STRINGS.menu.noteFallback}
            </ThemedText>
          )}
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
  onAdd,
  onRemove,
  onOpenRecipe,
}: {
  dayOffset: number;
  dayLabel: string;
  entries: MenuEntry[];
  onAdd: (dayOffset: number, mealType: MealType) => void;
  onRemove: (entry: MenuEntry) => void;
  onOpenRecipe: (entry: MenuEntry) => void;
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
          onOpenRecipe={onOpenRecipe}
        />
        <MealSlot
          label={STRINGS.menu.dinner}
          entry={dinner}
          onAdd={() => onAdd(dayOffset, "DINNER")}
          onRemove={() => dinner && onRemove(dinner)}
          onOpenRecipe={onOpenRecipe}
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

  const [preferredWeekStart, setPreferredWeekStart] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [menusInDateOrder, setMenusInDateOrder] = useState<WeeklyMenu[]>([]);
  const [activeMenuIndex, setActiveMenuIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedMenuName, setEditedMenuName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [isDeletingMenu, setIsDeletingMenu] = useState(false);
  const [activeRotation, setActiveRotation] = useState<ActiveRotation | null>(
    null,
  );
  const [latestRotation, setLatestRotation] = useState<ActiveRotation | null>(
    null,
  );
  const [isLoadingRotation, setIsLoadingRotation] = useState(false);
  const [hasLoadedRotationContext, setHasLoadedRotationContext] =
    useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!weekStart || Array.isArray(weekStart)) return;

    const parsed = new Date(weekStart);
    if (Number.isNaN(parsed.getTime())) return;

    parsed.setHours(0, 0, 0, 0);
    setPreferredWeekStart((prev) => (isSameDay(prev, parsed) ? prev : parsed));
  }, [weekStart]);

  const activeMenu =
    activeMenuIndex >= 0 && activeMenuIndex < menusInDateOrder.length
      ? menusInDateOrder[activeMenuIndex]
      : null;

  function sortMenusInDateOrder(menus: WeeklyMenu[]) {
    return [...menus].sort((a, b) => {
      if (!a.startDate && !b.startDate) return a.id - b.id;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;

      const byDate =
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      if (byDate !== 0) return byDate;
      return a.id - b.id;
    });
  }

  function isDateWithinMenuPeriod(menuStartDate: Date, referenceDate: Date) {
    const periodStart = new Date(menuStartDate);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 6);

    const normalizedReference = new Date(referenceDate);
    normalizedReference.setHours(0, 0, 0, 0);

    return (
      normalizedReference.getTime() >= periodStart.getTime() &&
      normalizedReference.getTime() <= periodEnd.getTime()
    );
  }

  const fetchMenus = useCallback(
    async (weekStartToPrioritize: Date) => {
      if (!isLoaded || !isSignedIn) return;

      setIsLoading(true);
      setError(null);

      try {
        // Lazy materialization: ensure a menu exists for this week if an active rotation covers it.
        await authorizedFetch("/me/menus/resolve-week", getTokenRef.current, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startDate: formatDateParam(weekStartToPrioritize),
          }),
        });

        const res = await authorizedFetch(
          "/me/menus/planned",
          getTokenRef.current,
        );
        if (!res.ok) {
          throw new Error(`${STRINGS.menu.fetchMenusFailed} (${res.status})`);
        }

        const menus = (await res.json()) as WeeklyMenu[];
        const sortedMenus = sortMenusInDateOrder(menus);
        setMenusInDateOrder(sortedMenus);

        if (sortedMenus.length === 0) {
          setActiveMenuIndex(-1);
          return;
        }

        const currentWeekIndex = sortedMenus.findIndex((m) => {
          if (!m.startDate) return false;
          return isDateWithinMenuPeriod(
            new Date(m.startDate),
            weekStartToPrioritize,
          );
        });

        setActiveMenuIndex(currentWeekIndex >= 0 ? currentWeekIndex : -1);
      } catch (e) {
        setError(e instanceof Error ? e.message : STRINGS.menu.genericError);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoaded, isSignedIn],
  );

  const fetchRotationContext = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;

    setHasLoadedRotationContext(false);
    setIsLoadingRotation(true);
    setActiveRotation(null);
    setLatestRotation(null);
    try {
      const [activeRes, rotationsRes] = await Promise.all([
        authorizedFetch("/me/menus/rotations/active", getTokenRef.current),
        authorizedFetch("/me/menus/rotations", getTokenRef.current),
      ]);

      if (!activeRes.ok) {
        throw new Error(
          `${STRINGS.menuRotation.loadFailed} (${activeRes.status})`,
        );
      }

      if (!rotationsRes.ok) {
        throw new Error(
          `${STRINGS.menuRotation.loadFailed} (${rotationsRes.status})`,
        );
      }

      const active = (await activeRes.json()) as ActiveRotation | null;
      const rotations = (await rotationsRes.json()) as ActiveRotation[];
      setActiveRotation(active);
      setLatestRotation(rotations[0] ?? null);
    } catch {
      setActiveRotation(null);
      setLatestRotation(null);
    } finally {
      setIsLoadingRotation(false);
      setHasLoadedRotationContext(true);
    }
  }, [isLoaded, isSignedIn]);

  useFocusEffect(
    useCallback(() => {
      fetchMenus(preferredWeekStart);
      fetchRotationContext();
    }, [fetchMenus, preferredWeekStart, fetchRotationContext]),
  );

  useEffect(() => {
    if (!refreshToken || Array.isArray(refreshToken)) return;
    fetchMenus(preferredWeekStart);
    fetchRotationContext();
  }, [refreshToken, preferredWeekStart, fetchMenus, fetchRotationContext]);

  useEffect(() => {
    setEditedMenuName(activeMenu?.name?.trim() ?? "");
    setIsEditingName(false);
  }, [activeMenu?.id, activeMenu?.name]);

  function openShoppingList() {
    if (!activeMenu) return;
    router.push(`/menu/shopping?menuId=${activeMenu.id}` as any);
  }

  function openCalendarView() {
    router.push(
      `/menu/calendar?weekStart=${formatDateParam(currentDisplayWeekStart)}` as any,
    );
  }

  function openPlanFlow() {
    const weekStartForPlan = activeMenu?.startDate
      ? new Date(activeMenu.startDate)
      : preferredWeekStart;
    router.push(
      `/menu/plan?weekStart=${formatDateParam(weekStartForPlan)}` as any,
    );
  }

  function openRotationPlanner() {
    if (isLoadingRotation || !hasLoadedRotationContext) return;

    const rotationId = activeRotation?.id ?? latestRotation?.id;
    if (rotationId) {
      router.push(`/menu/rotation?rotationId=${rotationId}` as any);
      return;
    }
    router.push("/menu/rotation" as any);
  }

  async function removeEntry(entry: MenuEntry) {
    if (!activeMenu) return;
    try {
      await authorizedFetch(
        `/me/menus/${activeMenu.id}/${entry.dayOffset}/${entry.mealType}`,
        getTokenRef.current,
        { method: "DELETE" },
      );
      setMenusInDateOrder((prev) =>
        prev.map((menu) =>
          menu.id === activeMenu.id
            ? {
                ...menu,
                menuEntries: menu.menuEntries.filter(
                  (menuEntry) => menuEntry.id !== entry.id,
                ),
              }
            : menu,
        ),
      );
    } catch {
      // silent — re-fetch will reconcile
      await fetchMenus(preferredWeekStart);
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
      setMenusInDateOrder((prev) => {
        const updated = prev.map((menu) =>
          menu.id === updatedMenu.id ? updatedMenu : menu,
        );
        return sortMenusInDateOrder(updated);
      });
      setEditedMenuName(updatedMenu.name ?? "");
      setIsEditingName(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menu.genericError);
    } finally {
      setIsSavingName(false);
    }
  }

  function confirmDeleteMenu() {
    if (!activeMenu || isDeletingMenu) {
      return;
    }

    Alert.alert(
      STRINGS.menu.deleteConfirmTitle,
      STRINGS.menu.deleteConfirmBody,
      [
        {
          text: STRINGS.menu.cancel,
          style: "cancel",
        },
        {
          text: STRINGS.menu.delete,
          style: "destructive",
          onPress: handleDeleteMenu,
        },
      ],
    );
  }

  async function handleDeleteMenu() {
    if (!activeMenu || isDeletingMenu) {
      return;
    }

    setIsDeletingMenu(true);
    setError(null);

    try {
      const res = await authorizedFetch(
        `/me/menus/${activeMenu.id}`,
        getTokenRef.current,
        {
          method: "DELETE",
        },
      );

      if (!res.ok) {
        throw new Error(`${STRINGS.menu.deleteMenuFailed} (${res.status})`);
      }

      await fetchMenus(preferredWeekStart);
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menu.deleteMenuFailed);
    } finally {
      setIsDeletingMenu(false);
    }
  }

  function handleAdd(dayOffset: number, mealType: MealType) {
    if (!activeMenu) return;
    router.push(
      `/menu/pick?menuId=${activeMenu.id}&dayOffset=${dayOffset}&mealType=${mealType}&weekStart=${formatDateParam(activeMenu.startDate ? new Date(activeMenu.startDate) : preferredWeekStart)}`,
    );
  }

  const currentDisplayWeekStart = activeMenu?.startDate
    ? new Date(activeMenu.startDate)
    : preferredWeekStart;
  const currentDayLabels = getDayNamesFromStartDate(currentDisplayWeekStart);
  const isDisplayedPeriodOnOrAfterActiveRotationStart = (() => {
    if (!activeRotation) return false;

    const displayedStart = new Date(currentDisplayWeekStart);
    displayedStart.setHours(0, 0, 0, 0);

    const rotationStart = new Date(activeRotation.startDate);
    rotationStart.setHours(0, 0, 0, 0);

    return displayedStart.getTime() >= rotationStart.getTime();
  })();

  const isCurrentWeekInActiveRotation =
    !!activeRotation &&
    ((!!activeMenu &&
      activeMenu.rotationId != null &&
      activeMenu.rotationId === activeRotation.id) ||
      isDisplayedPeriodOnOrAfterActiveRotationStart);

  function handleOpenRecipe(entry: MenuEntry) {
    if (!entry.recipe) return;
    router.push(`/recipe/${entry.recipe.id}` as any);
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
          <View style={styles.headerSide} />
          <View style={styles.weekLabelWrap}>
            <ThemedText type="subtitle" style={styles.weekLabel}>
              {formatWeekRange(currentDisplayWeekStart)}
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
          <View style={styles.headerSide}>
            <Pressable
              onPress={openCalendarView}
              style={[
                styles.calendarButton,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText type="small">{STRINGS.menu.openCalendar}</ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Body */}

        <View
          style={[
            styles.rotationCard,
            {
              borderColor: isCurrentWeekInActiveRotation
                ? theme.accent
                : theme.backgroundElement,
              backgroundColor: theme.background,
            },
          ]}
        >
          <View style={styles.rotationHeader}>
            <ThemedText
              type="smallBold"
              themeColor={
                isCurrentWeekInActiveRotation ? "text" : "textSecondary"
              }
            >
              {STRINGS.menuRotation.currentWeekStatusTitle}
            </ThemedText>
            <Pressable
              onPress={openRotationPlanner}
              disabled={isLoadingRotation || !hasLoadedRotationContext}
              style={[
                styles.rotationActionButton,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText type="small">
                {hasLoadedRotationContext &&
                !isLoadingRotation &&
                (activeRotation || latestRotation)
                  ? STRINGS.menuRotation.manage
                  : STRINGS.menuRotation.create}
              </ThemedText>
            </Pressable>
          </View>

          {isLoadingRotation ? (
            <ActivityIndicator
              color={theme.text}
              style={styles.rotationLoader}
            />
          ) : activeRotation ? (
            <View style={styles.rotationStatusContent}>
              <View
                style={[
                  styles.rotationStatusBadge,
                  {
                    backgroundColor: isCurrentWeekInActiveRotation
                      ? theme.accent
                      : theme.backgroundElement,
                  },
                ]}
              >
                <ThemedText
                  type="smallBold"
                  style={{
                    color: isCurrentWeekInActiveRotation
                      ? theme.accentText
                      : theme.textSecondary,
                  }}
                >
                  {isCurrentWeekInActiveRotation
                    ? STRINGS.menuRotation.inRotationThisWeek
                    : STRINGS.menuRotation.notInRotationThisWeek}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {STRINGS.menuRotation.activeRotationLabel}
              </ThemedText>
              <ThemedText type="default" style={styles.rotationName}>
                {activeRotation.name?.trim() || STRINGS.menu.unnamedMenu}
              </ThemedText>
            </View>
          ) : latestRotation ? (
            <View style={styles.rotationStatusContent}>
              <View
                style={[
                  styles.rotationStatusBadge,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {STRINGS.menuRotation.inactiveRotationStatus}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {STRINGS.menuRotation.lastRotationLabel}
              </ThemedText>
              <ThemedText type="default" style={styles.rotationName}>
                {latestRotation.name?.trim() || STRINGS.menu.unnamedMenu}
              </ThemedText>
            </View>
          ) : (
            <ThemedText themeColor="textSecondary">
              {STRINGS.menuRotation.noActive}
            </ThemedText>
          )}
        </View>

        {!!activeMenu && (
          <Pressable
            style={[
              styles.shoppingButton,
              { backgroundColor: theme.backgroundElement },
            ]}
            onPress={openShoppingList}
          >
            <ThemedText>{STRINGS.menu.shoppingList}</ThemedText>
          </Pressable>
        )}
        {!!activeMenu && (
          <Pressable
            style={[
              styles.deleteMenuButton,
              {
                backgroundColor: theme.backgroundElement,
                opacity: isDeletingMenu ? 0.7 : 1,
              },
            ]}
            onPress={confirmDeleteMenu}
            disabled={isDeletingMenu}
          >
            <ThemedText>
              {isDeletingMenu ? STRINGS.menu.deleting : STRINGS.menu.delete}
            </ThemedText>
          </Pressable>
        )}

        {isLoading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : error ? (
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            {error}
          </ThemedText>
        ) : !activeMenu ? (
          <View style={styles.emptyState}>
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              {STRINGS.menu.noPlannedMenuForWeek}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              {STRINGS.menu.noPlannedMenuHelp}
            </ThemedText>
            <Pressable
              onPress={openPlanFlow}
              style={[
                styles.createButton,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText>{STRINGS.menu.planWeek}</ThemedText>
            </Pressable>
          </View>
        ) : (
          currentDayLabels.map((name, index) => (
            <DayRow
              key={index}
              dayOffset={index}
              dayLabel={name}
              entries={activeMenu.menuEntries.filter(
                (e) => e.dayOffset === index,
              )}
              onAdd={handleAdd}
              onRemove={removeEntry}
              onOpenRecipe={handleOpenRecipe}
            />
          ))
        )}
      </ScrollView>

      <Pressable
        style={[
          styles.fab,
          {
            backgroundColor: theme.accent,
            bottom: insets.bottom + BottomTabInset + Spacing.three,
          },
        ]}
        onPress={openPlanFlow}
        accessibilityRole="button"
        accessibilityLabel={STRINGS.menu.createMenuFromDate}
      >
        <ThemedText style={[styles.fabLabel, { color: theme.accentText }]}>
          +
        </ThemedText>
      </Pressable>
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
  headerSide: {
    width: 96,
  },
  rotationCard: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  rotationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  rotationActionButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 8,
  },
  rotationLoader: {
    marginVertical: Spacing.one,
  },
  rotationStatusContent: {
    gap: Spacing.one,
  },
  rotationStatusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  rotationName: {
    fontWeight: "600",
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
  calendarButton: {
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    alignItems: "center",
  },
  loader: {
    marginTop: Spacing.five,
  },
  shoppingButton: {
    alignSelf: "center",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
    marginBottom: Spacing.two,
  },
  deleteMenuButton: {
    alignSelf: "center",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
    marginBottom: Spacing.three,
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
  startDateButton: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  calendarWrap: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
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
  slotContentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
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
