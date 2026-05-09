import { useAuth } from "@clerk/clerk-expo";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { ApiRecipe } from "@/data/mock-data";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";

function getRecipeImageUrl(url: string) {
  const useImageProxy = process.env.EXPO_PUBLIC_USE_IMAGE_PROXY === "true";
  if (!useImageProxy) {
    return url;
  }

  const apiBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
  const imageProxyBaseUrl =
    process.env.EXPO_PUBLIC_IMAGE_PROXY_BASE_URL ?? apiBaseUrl;
  const normalizedBaseUrl = imageProxyBaseUrl.replace(/\/$/, "");

  return `${normalizedBaseUrl}/me/recipes/assets/proxy?url=${encodeURIComponent(url)}`;
}

function RecipeCard({ recipe }: { recipe: ApiRecipe }) {
  const theme = useTheme();

  return (
    <Pressable
      style={styles.cardPressable}
      onPress={() => router.push(`/recipe/${recipe.id}`)}
    >
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.cardImageContainer}>
          <Image
            source={{ uri: getRecipeImageUrl(recipe.image) }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        </View>
        <ThemedText type="small" style={styles.cardTitle}>
          {recipe.name}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export default function RecipesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const [recipes, setRecipes] = useState<ApiRecipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function fetchRecipes() {
        setIsLoading(true);
        setError(null);

        if (!isLoaded || !isSignedIn) {
          setRecipes([]);
          setIsLoading(false);
          return;
        }

        try {
          const response = await authorizedFetch(
            "/me/recipes",
            getTokenRef.current,
          );
          if (!response.ok) {
            throw new Error(`Failed to load recipes (${response.status})`);
          }
          const data = (await response.json()) as ApiRecipe[];
          if (!cancelled) {
            setRecipes(data);
          }
        } catch (err) {
          if (!cancelled) {
            setError(
              err instanceof Error ? err.message : "Failed to load recipes",
            );
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      }

      fetchRecipes();
      return () => {
        cancelled = true;
      };
    }, [isLoaded, isSignedIn]),
  );

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={recipes}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <RecipeCard recipe={item} />}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: insets.top + Spacing.four,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.three,
          },
        ]}
        ListHeaderComponent={
          <ThemedView style={styles.header}>
            <ThemedView style={styles.headerTopRow}>
              <ThemedText type="subtitle">My Recipes</ThemedText>
              <Pressable
                style={[
                  styles.addButton,
                  { backgroundColor: theme.backgroundElement },
                ]}
                onPress={() => router.push("/recipe/new")}
              >
                <ThemedText type="small">+ Add Recipe</ThemedText>
              </Pressable>
            </ThemedView>
          </ThemedView>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={theme.text} />
          ) : error ? (
            <ThemedText themeColor="textSecondary">{error}</ThemedText>
          ) : (
            <ThemedText themeColor="textSecondary">
              No recipes yet. Add your first one!
            </ThemedText>
          )
        }
        ItemSeparatorComponent={() => <ThemedView style={styles.separator} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  list: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
  },
  cardPressable: {
    width: "100%",
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  card: {
    borderRadius: Spacing.three,
    overflow: "hidden",
  },
  cardImageContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  cardTitle: {
    padding: Spacing.three,
    fontWeight: "600",
  },
  separator: {
    height: Spacing.three,
  },
});
