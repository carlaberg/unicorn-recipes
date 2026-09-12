import { useAuth } from "@clerk/clerk-expo";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
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
  const isDarkTheme = theme.background === "#000000";
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

  function findPreferredMenuIndexForDate(
    sortedMenus: WeeklyMenu[],
    weekStartToPrioritize: Date,
  ) {
    let candidateIndex = -1;
    let candidateStartTime = Number.NEGATIVE_INFINITY;
    let candidateId = Number.NEGATIVE_INFINITY;

    sortedMenus.forEach((menu, index) => {
      if (!menu.startDate) return;

      const parsedStartDate = new Date(menu.startDate);
      if (
        Number.isNaN(parsedStartDate.getTime()) ||
        !isDateWithinMenuPeriod(parsedStartDate, weekStartToPrioritize)
      ) {
        return;
      }

      const startTime = parsedStartDate.getTime();
      if (
        startTime > candidateStartTime ||
        (startTime === candidateStartTime && menu.id > candidateId)
      ) {
        candidateIndex = index;
        candidateStartTime = startTime;
        candidateId = menu.id;
      }
    });

    return candidateIndex;
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

        const currentWeekIndex = findPreferredMenuIndexForDate(
          sortedMenus,
          weekStartToPrioritize,
        );

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
    router.replace(
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

  function openNewRotation() {
    router.push("/menu/rotation" as any);
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

  function openActionsMenu() {
    const actions: Array<{
      text: string;
      style?: "cancel" | "destructive";
      onPress?: () => void;
    }> = [];

    if (activeMenu) {
      actions.push({
        text: STRINGS.menu.shoppingList,
        onPress: openShoppingList,
      });
    }

    if (activeRotation || latestRotation) {
      actions.push({
        text: activeRotation
          ? STRINGS.menu.manageRotation
          : STRINGS.menu.reactivateRotation,
        onPress: openRotationPlanner,
      });
    }

    actions.push({ text: STRINGS.menu.newRotation, onPress: openNewRotation });

    if (activeMenu) {
      actions.push({
        text: STRINGS.menu.delete,
        style: "destructive",
        onPress: confirmDeleteMenu,
      });
    }

    actions.push({ text: STRINGS.menu.cancel, style: "cancel" });

    Alert.alert(STRINGS.menu.moreActions, undefined, actions);
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
            paddingTop: insets.top + Spacing.four + 52,
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
                  <View style={styles.activeNameTextWrap}>
                    {!!activeMenu.name && (
                      <ThemedText
                        themeColor="textSecondary"
                        style={styles.activeMenuName}
                      >
                        {activeMenu.name}
                      </ThemedText>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={STRINGS.menu.edit}
                      onPress={() => setIsEditingName(true)}
                      style={[
                        styles.editNameIconButton,
                        {
                          backgroundColor: isDarkTheme
                            ? "rgba(255, 255, 255, 0.08)"
                            : "rgba(15, 23, 42, 0.06)",
                          borderColor: isDarkTheme
                            ? "rgba(255, 255, 255, 0.18)"
                            : "rgba(15, 23, 42, 0.2)",
                        },
                      ]}
                    >
                      <SymbolView
                        name={{
                          ios: "pencil",
                          android: "edit",
                          web: "edit",
                        }}
                        size={16}
                        weight="medium"
                        tintColor={theme.textSecondary}
                      />
                    </Pressable>
                  </View>
                </View>
              ))}
          </View>
          <View style={styles.headerSide} />
        </View>

        {/* Body */}

        {isCurrentWeekInActiveRotation && activeRotation ? (
          <View
            style={[
              styles.rotationCard,
              {
                borderColor: theme.accent,
                backgroundColor: theme.background,
              },
            ]}
          >
            {isLoadingRotation ? (
              <ActivityIndicator
                color={theme.text}
                style={styles.rotationLoader}
              />
            ) : (
              <View style={styles.rotationStatusContent}>
                <View style={styles.rotationStatusRow}>
                  <View
                    style={[
                      styles.rotationStatusBadge,
                      { backgroundColor: theme.accent },
                    ]}
                  >
                    <ThemedText
                      type="smallBold"
                      style={{ color: theme.accentText }}
                    >
                      {`Rotation: ${activeRotation?.name?.trim() || STRINGS.menu.unnamedMenu}`}
                    </ThemedText>
                  </View>
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
              </View>
            )}
          </View>
        ) : null}

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

      <View
        style={[
          styles.fixedGlassButtonGroup,
          {
            top: insets.top + Spacing.four,
            backgroundColor: isDarkTheme
              ? "rgba(42, 43, 46, 0.7)"
              : "rgba(248, 250, 252, 0.95)",
            borderColor: isDarkTheme
              ? "rgba(255, 255, 255, 0.16)"
              : "rgba(15, 23, 42, 0.2)",
          },
        ]}
      >
        <Pressable
          onPress={openCalendarView}
          accessibilityRole="button"
          accessibilityLabel={STRINGS.menu.openCalendar}
          style={styles.fixedGlassGroupButton}
        >
          <SymbolView
            name={{
              ios: "calendar",
              android: "calendar_month",
              web: "calendar_month",
            }}
            size={20}
            weight="medium"
            tintColor={isDarkTheme ? "#D0D0D0" : "#4A4A4A"}
          />
        </Pressable>

        <View style={styles.fixedGlassGroupDivider} />

        <Pressable
          onPress={openActionsMenu}
          accessibilityRole="button"
          accessibilityLabel={STRINGS.menu.moreActions}
          style={styles.fixedGlassGroupButton}
        >
          <View style={styles.fixedGlassDotsStack}>
            <View
              style={[styles.fixedGlassDot, { backgroundColor: "#4A4A4A" }]}
            />
            <View
              style={[styles.fixedGlassDot, { backgroundColor: "#4A4A4A" }]}
            />
            <View
              style={[styles.fixedGlassDot, { backgroundColor: "#4A4A4A" }]}
            />
          </View>
        </Pressable>
      </View>

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
    width: 52,
    alignItems: "flex-end",
  },
  fixedGlassButtonGroup: {
    position: "absolute",
    right: Spacing.three,
    width: 112,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    zIndex: 10,
  },
  fixedGlassGroupButton: {
    width: 50,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  fixedGlassGroupDivider: {
    width: 1,
    height: 22,
    marginHorizontal: 5,
    backgroundColor: "rgba(120, 120, 120, 0.45)",
  },
  fixedGlassDotsStack: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  fixedGlassDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  rotationCard: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    marginBottom: Spacing.three,
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
  rotationStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
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
    width: "100%",
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  activeNameTextWrap: {
    alignSelf: "center",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  editNameIconButton: {
    position: "absolute",
    right: -34,
    top: "50%",
    marginTop: -13,
    width: 26,
    height: 26,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
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
