import { useAuth } from "@clerk/clerk-expo";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
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

function formatIngredient(amount: number, unit: string, name: string) {
  return `${amount} ${unit} ${name}`;
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const [recipe, setRecipe] = useState<ApiRecipe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;

    async function fetchRecipe() {
      setIsLoading(true);
      setError(null);

      if (!isLoaded || !isSignedIn) {
        if (!cancelled) {
          setRecipe(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await authorizedFetch(
          `/me/recipes/${id}`,
          getTokenRef.current,
        );
        if (!response.ok) {
          throw new Error(`Recipe not found (${response.status})`);
        }
        const data = (await response.json()) as ApiRecipe;
        if (!cancelled) {
          setRecipe(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load recipe",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchRecipe();
    return () => {
      cancelled = true;
    };
  }, [id, isLoaded, isSignedIn]);

  const videoPlayer = useVideoPlayer(recipe?.video ?? null, (player) => {
    player.loop = false;
  });

  if (isLoading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.text} />
      </ThemedView>
    );
  }

  if (error || !recipe) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>{error ?? "Recipe not found."}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.six },
        ]}
      >
        <ThemedView style={styles.inner}>
          <Pressable
            style={[
              styles.backButton,
              { backgroundColor: theme.backgroundElement },
            ]}
            onPress={() => router.back()}
          >
            <ThemedText type="small">← Back</ThemedText>
          </Pressable>

          <ThemedText type="subtitle">{recipe.name}</ThemedText>

          <View style={styles.imageContainer}>
            <Image
              source={{ uri: getRecipeImageUrl(recipe.image) }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          </View>

          <ThemedText
            type="smallBold"
            themeColor="textSecondary"
            style={styles.sectionLabel}
          >
            Ingredients
          </ThemedText>
          {recipe.ingredients.map((item, index) => (
            <ThemedView key={index} style={styles.ingredientRow}>
              <ThemedText type="small">
                •{" "}
                {formatIngredient(item.amount, item.unit, item.ingredient.name)}
              </ThemedText>
            </ThemedView>
          ))}

          <ThemedText
            type="smallBold"
            themeColor="textSecondary"
            style={styles.sectionLabel}
          >
            Instructions
          </ThemedText>
          <ThemedText type="default">{recipe.instructions}</ThemedText>

          {recipe.video ? (
            <>
              <ThemedText
                type="smallBold"
                themeColor="textSecondary"
                style={styles.sectionLabel}
              >
                Video
              </ThemedText>
              <VideoView player={videoPlayer} style={styles.video} />
            </>
          ) : null}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flexDirection: "row",
    justifyContent: "center",
  },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    gap: Spacing.three,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    marginBottom: Spacing.two,
  },
  imageContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: Spacing.three,
    overflow: "hidden",
  },
  video: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: Spacing.three,
  },
  sectionLabel: {
    marginTop: Spacing.two,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  ingredientRow: {
    paddingLeft: Spacing.one,
  },
});
