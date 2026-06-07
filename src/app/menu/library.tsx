import { useAuth } from "@clerk/clerk-expo";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
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

type MenuRecipe = {
  id: number;
  name: string;
  image: string;
};

type MenuEntry = {
  id: number;
  dayOffset: number;
  mealType: "LUNCH" | "DINNER";
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

const TAG_FILTERS = [
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

export default function MenuLibraryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);

  const [templates, setTemplates] = useState<WeeklyMenu[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const loadTemplates = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;

    setIsLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (selectedTag) query.set("tag", selectedTag);

      const suffix = query.toString() ? `?${query.toString()}` : "";
      const response = await authorizedFetch(
        `/me/menus/templates${suffix}`,
        getTokenRef.current,
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuLibrary.loadFailed} (${response.status})`,
        );
      }

      const data = (await response.json()) as WeeklyMenu[];
      setTemplates(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menuLibrary.loadFailed);
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isSignedIn, search, selectedTag]);

  useFocusEffect(
    useCallback(() => {
      loadTemplates();
    }, [loadTemplates]),
  );

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  async function createTemplate() {
    try {
      const response = await authorizedFetch(
        "/me/menus/templates",
        getTokenRef.current,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Ny mall ${new Date().toISOString().slice(0, 10)}`,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuLibrary.loadFailed} (${response.status})`,
        );
      }

      const created = (await response.json()) as WeeklyMenu;
      router.push(`/menu/template/${created.id}` as any);
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menuLibrary.loadFailed);
    }
  }

  async function duplicateTemplate(menuId: number) {
    try {
      const response = await authorizedFetch(
        `/me/menus/templates/${menuId}/duplicate`,
        getTokenRef.current,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuLibrary.loadFailed} (${response.status})`,
        );
      }

      await loadTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menuLibrary.loadFailed);
    }
  }

  function isPinned(template: WeeklyMenu) {
    return template.tags.includes("favorit");
  }

  const sortedTemplates = [...templates].sort((a, b) => {
    const aPinned = isPinned(a) ? 1 : 0;
    const bPinned = isPinned(b) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;

    const aName = a.name?.trim() || STRINGS.menu.unnamedMenu;
    const bName = b.name?.trim() || STRINGS.menu.unnamedMenu;
    return aName.localeCompare(bName, "sv");
  });

  async function togglePinned(template: WeeklyMenu) {
    const nextTags = template.tags.includes("favorit")
      ? template.tags.filter((tag) => tag !== "favorit")
      : ["favorit", ...template.tags];

    try {
      const response = await authorizedFetch(
        `/me/menus/${template.id}`,
        getTokenRef.current,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tags: [...new Set(nextTags)],
            isTemplate: true,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuLibrary.loadFailed} (${response.status})`,
        );
      }

      await loadTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menuLibrary.loadFailed);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + Spacing.two,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.six,
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

        <ThemedText type="subtitle">{STRINGS.menuLibrary.title}</ThemedText>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={STRINGS.menuLibrary.searchPlaceholder}
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.searchInput,
            { borderColor: theme.backgroundElement, color: theme.text },
          ]}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Pressable
            onPress={() => setSelectedTag(null)}
            style={[
              styles.chip,
              {
                backgroundColor: !selectedTag
                  ? theme.backgroundElement
                  : "transparent",
                borderColor: theme.backgroundElement,
              },
            ]}
          >
            <ThemedText type="small">
              {STRINGS.menuLibrary.filterAll}
            </ThemedText>
          </Pressable>
          {TAG_FILTERS.map((tag) => (
            <Pressable
              key={tag}
              onPress={() =>
                setSelectedTag((prev) => (prev === tag ? null : tag))
              }
              style={[
                styles.chip,
                {
                  backgroundColor:
                    selectedTag === tag
                      ? theme.backgroundElement
                      : "transparent",
                  borderColor: theme.backgroundElement,
                },
              ]}
            >
              <ThemedText type="small">{tag}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>

        {isLoading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : error ? (
          <ThemedText themeColor="textSecondary">{error}</ThemedText>
        ) : templates.length === 0 ? (
          <ThemedText themeColor="textSecondary">
            {STRINGS.menuLibrary.empty}
          </ThemedText>
        ) : (
          <View style={styles.templateList}>
            {sortedTemplates.map((template) => (
              <View
                key={template.id}
                style={[
                  styles.card,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText style={styles.cardTitle}>
                  {template.name?.trim() || STRINGS.menu.unnamedMenu}
                </ThemedText>
                {isPinned(template) && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {STRINGS.menuLibrary.pinnedLabel}
                  </ThemedText>
                )}
                <ThemedText type="small" themeColor="textSecondary">
                  {template.menuEntries.length} slotar
                </ThemedText>
                {template.tags.length > 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {template.tags.join(", ")}
                  </ThemedText>
                )}

                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() =>
                      router.push(`/menu/plan?templateId=${template.id}` as any)
                    }
                    style={styles.cardAction}
                  >
                    <ThemedText type="small">
                      {STRINGS.menuLibrary.useTemplate}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      router.push(`/menu/template/${template.id}` as any)
                    }
                    style={styles.cardAction}
                  >
                    <ThemedText type="small">
                      {STRINGS.menuLibrary.editTemplate}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => togglePinned(template)}
                    style={styles.cardAction}
                  >
                    <ThemedText type="small">
                      {isPinned(template)
                        ? STRINGS.menuLibrary.unpinTemplate
                        : STRINGS.menuLibrary.pinTemplate}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => duplicateTemplate(template.id)}
                    style={styles.cardAction}
                  >
                    <ThemedText type="small">
                      {STRINGS.menuLibrary.duplicateTemplate}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
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
        onPress={createTemplate}
        accessibilityRole="button"
        accessibilityLabel={STRINGS.menuLibrary.createTemplate}
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
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  chips: {
    gap: Spacing.one,
    paddingRight: Spacing.three,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
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
  loader: {
    marginTop: Spacing.four,
  },
  templateList: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: 10,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  cardTitle: {
    fontWeight: "600",
  },
  cardActions: {
    marginTop: Spacing.one,
    flexDirection: "row",
    gap: Spacing.two,
    flexWrap: "wrap",
  },
  cardAction: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
