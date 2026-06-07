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
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";
import { DAY_NAMES } from "@/lib/date-utils";

type MealType = "LUNCH" | "DINNER";

type MenuRecipe = {
  id: number;
  name: string;
  image: string;
};

type MenuEntry = {
  id: number;
  dayOffset: number;
  mealType: MealType;
  recipeId: number | null;
  note: string | null;
  recipe: MenuRecipe | null;
};

type WeeklyMenu = {
  id: number;
  name: string | null;
  tags: string[];
  isTemplate: boolean;
  menuEntries: MenuEntry[];
};

const QUICK_TAGS = [
  "favorit",
  "vår",
  "sommar",
  "höst",
  "vinter",
  "kyckling",
  "vegetariskt",
  "snabb",
  "budget",
  "barnvänlig",
  "italienskt",
  "asiatiskt",
] as const;

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
  const lunch = entries.find((entry) => entry.mealType === "LUNCH");
  const dinner = entries.find((entry) => entry.mealType === "DINNER");

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

export default function TemplateDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const restoredScrollKeyRef = useRef<string | null>(null);
  const params = useLocalSearchParams<{
    id?: string;
    refreshToken?: string;
    keepWeekContentOpen?: string;
    scrollY?: string;
  }>();

  const [template, setTemplate] = useState<WeeklyMenu | null>(null);
  const [name, setName] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [isWeekContentExpanded, setIsWeekContentExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const loadTemplate = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;

    const id = parseInt(String(params.id ?? ""), 10);
    if (isNaN(id)) {
      setError(STRINGS.menuTemplate.loadFailed);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await authorizedFetch(
        "/me/menus/templates",
        getTokenRef.current,
      );
      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuTemplate.loadFailed} (${response.status})`,
        );
      }

      const templates = (await response.json()) as WeeklyMenu[];
      const current = templates.find((item) => item.id === id) ?? null;

      if (!current) {
        throw new Error(STRINGS.menuTemplate.loadFailed);
      }

      setTemplate(current);
      setName(current.name ?? "");
      setSelectedTags(current.tags);
      setCustomTagInput("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : STRINGS.menuTemplate.loadFailed,
      );
      setTemplate(null);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isSignedIn, params.id]);

  useFocusEffect(
    useCallback(() => {
      loadTemplate();
    }, [loadTemplate]),
  );

  useEffect(() => {
    if (params.keepWeekContentOpen === "1") {
      setIsWeekContentExpanded(true);
    }
  }, [params.keepWeekContentOpen]);

  useEffect(() => {
    if (isLoading) return;

    const parsedScrollY = Number.parseInt(String(params.scrollY ?? ""), 10);
    if (!Number.isFinite(parsedScrollY) || parsedScrollY < 0) return;

    const restoreKey = `${String(params.refreshToken ?? "")}:${String(params.scrollY ?? "")}`;
    if (restoredScrollKeyRef.current === restoreKey) return;
    restoredScrollKeyRef.current = restoreKey;

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: parsedScrollY, animated: false });
    });
  }, [isLoading, params.refreshToken, params.scrollY]);

  function normalizeTags(tags: string[]) {
    return tags
      .map((tag) => tag.trim().toLowerCase())
      .filter(
        (tag, index, all) => tag.length > 0 && all.indexOf(tag) === index,
      );
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((item) => item !== tag);
      }
      return normalizeTags([...prev, tag]);
    });
  }

  function removeTag(tag: string) {
    setSelectedTags((prev) => prev.filter((item) => item !== tag));
  }

  function addCustomTag() {
    const trimmed = customTagInput.trim().toLowerCase();
    if (!trimmed) return;

    setSelectedTags((prev) => normalizeTags([...prev, trimmed]));
    setCustomTagInput("");
  }

  async function saveMetadata() {
    if (!template || isSavingMeta) return;

    setIsSavingMeta(true);
    setError(null);

    try {
      const response = await authorizedFetch(
        `/me/menus/${template.id}`,
        getTokenRef.current,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim() || null,
            tags: normalizeTags(selectedTags),
            isTemplate: true,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuTemplate.saveFailed} (${response.status})`,
        );
      }

      router.replace("/menu/library" as any);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : STRINGS.menuTemplate.saveFailed,
      );
    } finally {
      setIsSavingMeta(false);
    }
  }

  async function removeEntry(entry: MenuEntry) {
    if (!template) return;

    try {
      setError(null);

      const response = await authorizedFetch(
        `/me/menus/${template.id}/${entry.dayOffset}/${entry.mealType}`,
        getTokenRef.current,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuTemplate.saveFailed} (${response.status})`,
        );
      }

      setTemplate((current) => {
        if (!current) return current;

        return {
          ...current,
          menuEntries: current.menuEntries.filter(
            (currentEntry) => currentEntry.id !== entry.id,
          ),
        };
      });
    } catch {
      setError(STRINGS.menuTemplate.saveFailed);
    }
  }

  function addEntry(dayOffset: number, mealType: MealType) {
    if (!template) return;
    const keepWeekContentOpen = isWeekContentExpanded ? "1" : "0";
    const scrollY = String(Math.max(0, Math.round(scrollYRef.current)));
    router.push(
      `/menu/pick?menuId=${template.id}&dayOffset=${dayOffset}&mealType=${mealType}&returnTo=template&templateId=${template.id}&keepWeekContentOpen=${keepWeekContentOpen}&scrollY=${scrollY}` as any,
    );
  }

  function openRecipe(entry: MenuEntry) {
    if (!entry.recipe) return;
    router.push(`/recipe/${entry.recipe.id}` as any);
  }

  async function duplicateTemplate() {
    if (!template) return;

    try {
      const response = await authorizedFetch(
        `/me/menus/templates/${template.id}/duplicate`,
        getTokenRef.current,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuTemplate.saveFailed} (${response.status})`,
        );
      }

      const duplicated = (await response.json()) as WeeklyMenu;
      router.replace(`/menu/template/${duplicated.id}` as any);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : STRINGS.menuTemplate.saveFailed,
      );
    }
  }

  function openTemplateActionsMenu() {
    Alert.alert(STRINGS.menuTemplate.moreActions, undefined, [
      { text: STRINGS.menuTemplate.duplicate, onPress: duplicateTemplate },
      {
        text: STRINGS.menuTemplate.delete,
        style: "destructive",
        onPress: confirmDeleteTemplate,
      },
      { text: STRINGS.menu.cancel, style: "cancel" },
    ]);
  }

  function confirmDeleteTemplate() {
    if (!template) return;

    Alert.alert(
      STRINGS.menuTemplate.deleteConfirmTitle,
      STRINGS.menuTemplate.deleteConfirmBody,
      [
        { text: STRINGS.menu.cancel, style: "cancel" },
        {
          text: STRINGS.menuTemplate.delete,
          style: "destructive",
          onPress: async () => {
            if (!template) return;
            try {
              const response = await authorizedFetch(
                `/me/menus/${template.id}`,
                getTokenRef.current,
                { method: "DELETE" },
              );

              if (!response.ok) {
                throw new Error(
                  `${STRINGS.menuTemplate.saveFailed} (${response.status})`,
                );
              }

              router.replace("/menu/library" as any);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : STRINGS.menuTemplate.saveFailed,
              );
            }
          },
        },
      ],
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        style={{ backgroundColor: theme.background }}
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.two,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.three,
          },
        ]}
      >
        <ThemedView style={styles.inner}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => router.back()}
              style={[
                styles.backButton,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText type="small">{STRINGS.shopping.back}</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={STRINGS.menuTemplate.moreActions}
              onPress={openTemplateActionsMenu}
              style={[
                styles.overflowButton,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText style={styles.overflowIcon}>⋮</ThemedText>
            </Pressable>
          </View>

          <ThemedText type="subtitle">{STRINGS.menuTemplate.title}</ThemedText>

          {isLoading ? (
            <ActivityIndicator color={theme.text} style={styles.loader} />
          ) : !template ? (
            <ThemedText themeColor="textSecondary">
              {error || STRINGS.menuTemplate.loadFailed}
            </ThemedText>
          ) : (
            <>
              <ThemedView
                style={[styles.field, { borderColor: theme.backgroundElement }]}
              >
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {STRINGS.menuTemplate.nameLabel}
                </ThemedText>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={STRINGS.menuTemplate.namePlaceholder}
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.backgroundElement,
                      color: theme.text,
                    },
                  ]}
                />
              </ThemedView>

              <ThemedView
                style={[styles.field, { borderColor: theme.backgroundElement }]}
              >
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {STRINGS.menuTemplate.tagsLabel}
                </ThemedText>
                <TextInput
                  value={customTagInput}
                  onChangeText={setCustomTagInput}
                  placeholder={STRINGS.menuTemplate.tagsPlaceholder}
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.backgroundElement,
                      color: theme.text,
                    },
                  ]}
                />

                <View style={styles.metaActions}>
                  <Pressable
                    onPress={addCustomTag}
                    style={[
                      styles.actionButton,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <ThemedText>{STRINGS.menuTemplate.addTag}</ThemedText>
                  </Pressable>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tagsWrap}
                >
                  {QUICK_TAGS.map((tag) => {
                    const selected = selectedTags.includes(tag);
                    return (
                      <Pressable
                        key={tag}
                        onPress={() => toggleTag(tag)}
                        style={[
                          styles.tagChip,
                          {
                            borderColor: theme.backgroundElement,
                            backgroundColor: selected
                              ? theme.backgroundElement
                              : "transparent",
                          },
                        ]}
                      >
                        <ThemedText type="small">{tag}</ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={styles.selectedTagsWrap}>
                  {selectedTags.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {STRINGS.menuTemplate.noTagsSelected}
                    </ThemedText>
                  ) : (
                    selectedTags.map((tag) => (
                      <Pressable
                        key={tag}
                        onPress={() => removeTag(tag)}
                        style={[
                          styles.tagChip,
                          {
                            borderColor: theme.backgroundElement,
                            backgroundColor: theme.backgroundElement,
                          },
                        ]}
                      >
                        <ThemedText type="small">{tag} ×</ThemedText>
                      </Pressable>
                    ))
                  )}
                </View>
              </ThemedView>

              <ThemedView
                style={[styles.field, { borderColor: theme.backgroundElement }]}
              >
                <Pressable
                  onPress={() =>
                    setIsWeekContentExpanded((current) => !current)
                  }
                  style={styles.expandHeader}
                >
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {STRINGS.menuTemplate.weekContentLabel}
                  </ThemedText>
                  <View style={styles.expandHeaderRight}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {isWeekContentExpanded
                        ? STRINGS.menuTemplate.hideWeekContent
                        : STRINGS.menuTemplate.showWeekContent}
                    </ThemedText>
                    <SymbolView
                      name={{
                        ios: isWeekContentExpanded
                          ? "chevron.up"
                          : "chevron.down",
                        android: isWeekContentExpanded
                          ? "expand_less"
                          : "expand_more",
                        web: isWeekContentExpanded
                          ? "expand_less"
                          : "expand_more",
                      }}
                      size={16}
                      weight="medium"
                      tintColor={theme.textSecondary}
                    />
                  </View>
                </Pressable>
                {isWeekContentExpanded ? (
                  <View>
                    {DAY_NAMES.map((dayName, index) => (
                      <DayRow
                        key={dayName}
                        dayOffset={index}
                        dayLabel={dayName}
                        entries={template.menuEntries.filter(
                          (entry) => entry.dayOffset === index,
                        )}
                        onAdd={addEntry}
                        onRemove={removeEntry}
                        onOpenRecipe={openRecipe}
                      />
                    ))}
                  </View>
                ) : null}
              </ThemedView>

              <Pressable
                onPress={saveMetadata}
                disabled={isSavingMeta}
                style={[
                  styles.submitButton,
                  {
                    backgroundColor: isSavingMeta
                      ? theme.backgroundElement
                      : "#FF8A00",
                  },
                ]}
              >
                <ThemedText type="smallBold">
                  {isSavingMeta ? STRINGS.menu.saving : STRINGS.menu.save}
                </ThemedText>
              </Pressable>
            </>
          )}

          {error && <ThemedText themeColor="textSecondary">{error}</ThemedText>}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexDirection: "row",
    justifyContent: "center",
  },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  overflowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  overflowIcon: {
    fontSize: 18,
    lineHeight: 18,
  },
  loader: {
    marginTop: Spacing.four,
  },
  field: {
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  metaActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
  actionButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 8,
  },
  expandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  expandHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  tagsWrap: {
    gap: Spacing.one,
    paddingRight: Spacing.three,
  },
  selectedTagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
  tagChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
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
  submitButton: {
    alignItems: "center",
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
});
