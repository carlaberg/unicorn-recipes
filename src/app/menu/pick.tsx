import { useAuth } from "@clerk/clerk-expo";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Pressable,
    StyleSheet,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { ApiRecipe } from "@/data/mock-data";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";

export default function MenuPickScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const { menuId, dayOffset, mealType, weekStart } = useLocalSearchParams<{
    menuId: string;
    dayOffset: string;
    mealType: string;
    weekStart?: string;
  }>();

  const [recipes, setRecipes] = useState<ApiRecipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    const mealLabel = mealType === "LUNCH" ? "Lunch" : "Middag";
    navigation.setOptions({ title: `Välj recept – ${mealLabel}` });
  }, [mealType, navigation]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;

    async function fetchRecipes() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await authorizedFetch("/me/recipes", getTokenRef.current);
        if (!res.ok) throw new Error(`Kunde inte hämta recept (${res.status})`);
        const data = (await res.json()) as ApiRecipe[];
        if (!cancelled) setRecipes(data);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Något gick fel");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchRecipes();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

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
      if (!res.ok) throw new Error(`Kunde inte spara (${res.status})`);
      const weekStartParam =
        typeof weekStart === "string" && weekStart.length > 0
          ? weekStart
          : new Date().toISOString().slice(0, 10);
      router.replace(
        `/menu?weekStart=${weekStartParam}&refreshToken=${Date.now()}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
      setIsSaving(false);
    }
  }

  function handleBack() {
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
        <ThemedText type="small">← Back</ThemedText>
      </Pressable>
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
            style={[styles.card, { backgroundColor: theme.backgroundElement }]}
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
              Inga sparade recept
            </ThemedText>
          )
        }
      />
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
