import { useAuth } from "@clerk/clerk-expo";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { STRINGS } from "@/constants/strings";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { ApiRecipe } from "@/data/mock-data";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";

type EntryType = "RECIPE" | "NOTE";

export default function MenuPickScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const {
    menuId,
    dayOffset,
    mealType,
    weekStart,
    returnTo,
    templateId,
    keepWeekContentOpen,
    scrollY,
  } = useLocalSearchParams<{
    menuId: string;
    dayOffset: string;
    mealType: string;
    weekStart?: string;
    returnTo?: string;
    templateId?: string;
    keepWeekContentOpen?: string;
    scrollY?: string;
  }>();

  const [recipes, setRecipes] = useState<ApiRecipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [entryType, setEntryType] = useState<EntryType>("RECIPE");

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    const mealLabel =
      mealType === "LUNCH" ? STRINGS.menu.lunch : STRINGS.menu.dinner;
    navigation.setOptions({
      title: `${STRINGS.menuPick.titlePrefix} – ${mealLabel}`,
    });
  }, [mealType, navigation]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;

    async function fetchRecipes() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await authorizedFetch("/me/recipes", getTokenRef.current);
        if (!res.ok) {
          throw new Error(`${STRINGS.menuPick.fetchFailed} (${res.status})`);
        }
        const data = (await res.json()) as ApiRecipe[];
        if (!cancelled) setRecipes(data);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : STRINGS.menuPick.genericError,
          );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchRecipes();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  function getReturnHref() {
    if (returnTo === "template") {
      const id = typeof templateId === "string" ? templateId : menuId;
      const keepWeekContentOpenParam =
        typeof keepWeekContentOpen === "string" ? keepWeekContentOpen : "0";
      const scrollYParam = typeof scrollY === "string" ? scrollY : "0";
      return `/menu/template/${id}?refreshToken=${Date.now()}&keepWeekContentOpen=${keepWeekContentOpenParam}&scrollY=${scrollYParam}`;
    }

    const weekStartParam =
      typeof weekStart === "string" && weekStart.length > 0
        ? weekStart
        : new Date().toISOString().slice(0, 10);
    return `/menu?weekStart=${weekStartParam}&refreshToken=${Date.now()}`;
  }

  async function selectRecipe(recipeId: number) {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await authorizedFetch(
        `/me/menus/${menuId}/${dayOffset}/${mealType}`,
        getTokenRef.current,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId }),
        },
      );
      if (!res.ok) {
        throw new Error(`${STRINGS.menuPick.saveFailed} (${res.status})`);
      }
      router.replace(getReturnHref() as any);
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menuPick.genericError);
      setIsSaving(false);
    }
  }

  async function saveNote() {
    if (isSaving) return;

    const trimmedNote = noteInput.trim();
    if (!trimmedNote) {
      setError(STRINGS.menuPick.noteRequired);
      return;
    }

    setIsSaving(true);
    try {
      const res = await authorizedFetch(
        `/me/menus/${menuId}/${dayOffset}/${mealType}`,
        getTokenRef.current,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: trimmedNote }),
        },
      );
      if (!res.ok) {
        throw new Error(`${STRINGS.menuPick.saveFailed} (${res.status})`);
      }
      router.replace(getReturnHref() as any);
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menuPick.genericError);
      setIsSaving(false);
    }
  }

  function handleBack() {
    if (returnTo === "template") {
      const id = typeof templateId === "string" ? templateId : menuId;
      const keepWeekContentOpenParam =
        typeof keepWeekContentOpen === "string" ? keepWeekContentOpen : "0";
      const scrollYParam = typeof scrollY === "string" ? scrollY : "0";
      router.replace(
        `/menu/template/${id}?keepWeekContentOpen=${keepWeekContentOpenParam}&scrollY=${scrollYParam}` as any,
      );
      return;
    }

    const weekStartParam =
      typeof weekStart === "string" && weekStart.length > 0
        ? weekStart
        : new Date().toISOString().slice(0, 10);
    router.replace(`/menu?weekStart=${weekStartParam}`);
  }

  return (
    <ThemedView style={styles.container}>
      {isSaving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator color={theme.text} />
        </View>
      )}
      <Pressable
        onPress={handleBack}
        style={[
          styles.backButton,
          {
            marginTop: insets.top + Spacing.two,
            marginHorizontal: Spacing.three,
            marginBottom: Spacing.two,
            backgroundColor: theme.backgroundElement,
          },
        ]}
      >
        <ThemedText type="small">{STRINGS.menuPick.back}</ThemedText>
      </Pressable>

      <View
        style={[styles.typeSelector, { borderColor: theme.backgroundElement }]}
      >
        <Pressable
          onPress={() => setEntryType("RECIPE")}
          style={[
            styles.typeButton,
            entryType === "RECIPE" && {
              backgroundColor: theme.backgroundElement,
            },
          ]}
        >
          <ThemedText>{STRINGS.menuPick.typeRecipe}</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setEntryType("NOTE")}
          style={[
            styles.typeButton,
            entryType === "NOTE" && {
              backgroundColor: theme.backgroundElement,
            },
          ]}
        >
          <ThemedText>{STRINGS.menuPick.typeNote}</ThemedText>
        </Pressable>
      </View>

      {entryType === "NOTE" ? (
        <View
          style={[
            styles.noteSection,
            {
              paddingHorizontal: Spacing.three,
              paddingBottom: insets.bottom + BottomTabInset + Spacing.three,
            },
          ]}
        >
          <ThemedText type="small" themeColor="textSecondary">
            {STRINGS.menuPick.noteLabel}
          </ThemedText>
          <TextInput
            value={noteInput}
            onChangeText={setNoteInput}
            placeholder={STRINGS.menuPick.notePlaceholder}
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.noteInput,
              {
                borderColor: theme.backgroundElement,
                color: theme.text,
              },
            ]}
          />
          <Pressable
            style={[
              styles.noteSaveButton,
              { backgroundColor: theme.backgroundElement },
            ]}
            onPress={saveNote}
          >
            <ThemedText>{STRINGS.menuPick.saveNote}</ThemedText>
          </Pressable>
          {error ? (
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              {error}
            </ThemedText>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.list,
            {
              paddingTop: 0,
              paddingBottom: insets.bottom + BottomTabInset + Spacing.three,
            },
          ]}
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.card,
                { backgroundColor: theme.backgroundElement },
              ]}
              onPress={() => selectRecipe(item.id)}
            >
              <Image
                source={{ uri: item.image }}
                style={styles.cardImage}
                resizeMode="cover"
              />
              <ThemedText style={styles.cardName}>{item.name}</ThemedText>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator color={theme.text} style={styles.loader} />
            ) : error ? (
              <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                {error}
              </ThemedText>
            ) : (
              <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                {STRINGS.menuPick.empty}
              </ThemedText>
            )
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  list: {
    paddingHorizontal: Spacing.three,
  },
  typeSelector: {
    flexDirection: "row",
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  typeButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingVertical: Spacing.two,
  },
  noteSection: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    minHeight: 40,
  },
  noteSaveButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    overflow: "hidden",
    padding: Spacing.two,
    gap: Spacing.three,
  },
  cardImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  cardName: {
    flex: 1,
    fontSize: 16,
  },
  separator: {
    height: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  emptyText: {
    textAlign: "center",
    marginTop: Spacing.five,
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
});
