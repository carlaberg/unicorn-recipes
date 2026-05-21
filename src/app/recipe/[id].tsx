import { useAuth } from "@clerk/clerk-expo";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { STRINGS } from "@/constants/strings";
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
  const normalizedUnit = unit.trim().toLowerCase();
  if (normalizedUnit === "st") {
    return `${amount} ${name}`;
  }
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useFocusEffect(
    useCallback(() => {
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
            throw new Error(
              `${STRINGS.recipeDetail.fetchFailed} (${response.status})`,
            );
          }
          const data = (await response.json()) as ApiRecipe;
          if (!cancelled) {
            setRecipe(data);
          }
        } catch (err) {
          if (!cancelled) {
            setError(
              err instanceof Error
                ? err.message
                : STRINGS.recipeDetail.fetchFailed,
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
    }, [id, isLoaded, isSignedIn]),
  );

  const videoPlayer = useVideoPlayer(recipe?.video ?? null, (player) => {
    player.loop = false;
  });

  function confirmDeleteRecipe() {
    if (!recipe || isDeleting) {
      return;
    }

    Alert.alert(
      STRINGS.recipeDetail.deleteConfirmTitle,
      STRINGS.recipeDetail.deleteConfirmBody,
      [
        {
          text: STRINGS.recipeDetail.cancel,
          style: "cancel",
        },
        {
          text: STRINGS.recipeDetail.delete,
          style: "destructive",
          onPress: handleDeleteRecipe,
        },
      ],
    );
  }

  async function handleDeleteRecipe() {
    if (!recipe || isDeleting) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await authorizedFetch(
        `/me/recipes/${recipe.id}`,
        getTokenRef.current,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.recipeDetail.deleteFailed} (${response.status})`,
        );
      }

      router.replace("/recipes");
    } catch (err) {
      Alert.alert(
        STRINGS.recipeDetail.deleteFailedTitle,
        err instanceof Error ? err.message : STRINGS.recipeDetail.deleteFailed,
      );
    } finally {
      setIsDeleting(false);
    }
  }

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
        <ThemedText>{error ?? STRINGS.recipeDetail.notFound}</ThemedText>
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
          <View style={styles.headerRow}>
            <Pressable
              style={[
                styles.backButton,
                { backgroundColor: theme.backgroundElement },
              ]}
              onPress={() => router.back()}
            >
              <ThemedText type="small">{STRINGS.recipeDetail.back}</ThemedText>
            </Pressable>
            <View style={styles.headerActions}>
              <Pressable
                style={[
                  styles.editButton,
                  { backgroundColor: theme.backgroundElement },
                ]}
                onPress={() => router.push(`/recipe/edit/${recipe.id}`)}
              >
                <ThemedText type="small">
                  {STRINGS.recipeDetail.edit}
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.deleteButton,
                  {
                    backgroundColor: theme.backgroundElement,
                    opacity: isDeleting ? 0.7 : 1,
                  },
                ]}
                onPress={confirmDeleteRecipe}
                disabled={isDeleting}
              >
                <ThemedText type="small">
                  {isDeleting
                    ? STRINGS.recipeDetail.deleting
                    : STRINGS.recipeDetail.delete}
                </ThemedText>
              </Pressable>
            </View>
          </View>

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
            {STRINGS.recipeDetail.ingredients}
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
            {STRINGS.recipeDetail.instructions}
          </ThemedText>
          <ThemedText type="default">{recipe.instructions}</ThemedText>

          {recipe.video ? (
            <>
              <ThemedText
                type="smallBold"
                themeColor="textSecondary"
                style={styles.sectionLabel}
              >
                {STRINGS.recipeDetail.video}
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  editButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.two,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  deleteButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
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
