import { useAuth } from "@clerk/clerk-expo";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { STRINGS } from "@/constants/strings";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import {
    ApiRecipe,
    Ingredient,
    IngredientUnit,
    ingredientUnits,
} from "@/data/mock-data";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";

function isIngredientUnit(value: string): value is IngredientUnit {
  return ingredientUnits.includes(value as IngredientUnit);
}

export default function EditRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);

  const [recipe, setRecipe] = useState<ApiRecipe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [image, setImage] = useState("");
  const [video, setVideo] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientName, setIngredientName] = useState("");
  const [ingredientAmount, setIngredientAmount] = useState("");
  const [ingredientUnit, setIngredientUnit] = useState<IngredientUnit>(
    ingredientUnits[0],
  );
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadRecipe() {
      setIsLoading(true);

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
            `${STRINGS.recipeEdit.fetchFailed} (${response.status})`,
          );
        }

        const loaded = (await response.json()) as ApiRecipe;
        if (cancelled) {
          return;
        }

        setRecipe(loaded);
        setTitle(loaded.name);
        setImage(loaded.image);
        setVideo(loaded.video ?? "");
        setInstructions(loaded.instructions);
        setIngredients(
          loaded.ingredients
            .map((item) => {
              if (!isIngredientUnit(item.unit)) {
                return null;
              }

              return {
                name: item.ingredient.name,
                amount: Number(item.amount),
                unit: item.unit,
              } as Ingredient;
            })
            .filter((value): value is Ingredient => value !== null),
        );
      } catch (error) {
        if (!cancelled) {
          Alert.alert(
            STRINGS.recipeEdit.loadFailedTitle,
            error instanceof Error
              ? error.message
              : STRINGS.recipeEdit.fetchFailed,
          );
          router.back();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadRecipe();

    return () => {
      cancelled = true;
    };
  }, [id, isLoaded, isSignedIn]);

  const canAddIngredient =
    ingredientName.trim().length > 0 && ingredientAmount.trim().length > 0;
  const isFormValid =
    title.trim().length > 0 &&
    image.trim().length > 0 &&
    ingredients.length > 0 &&
    instructions.trim().length > 0;

  const videoPlayer = useVideoPlayer(video || null, (player) => {
    player.loop = false;
  });

  function getFileName(uri: string, fallbackExt: string) {
    const uriParts = uri.split("/");
    const lastPart = uriParts[uriParts.length - 1];
    if (lastPart && lastPart.includes(".")) {
      return lastPart;
    }
    return `upload-${Date.now()}.${fallbackExt}`;
  }

  function getMimeType(uri: string, mediaKind: "image" | "video") {
    const lowerUri = uri.toLowerCase();
    if (mediaKind === "image") {
      if (lowerUri.endsWith(".png")) {
        return "image/png";
      }
      if (lowerUri.endsWith(".webp")) {
        return "image/webp";
      }
      return "image/jpeg";
    }

    if (lowerUri.endsWith(".mov")) {
      return "video/quicktime";
    }
    if (lowerUri.endsWith(".m4v")) {
      return "video/x-m4v";
    }
    return "video/mp4";
  }

  async function uploadToCloudinary(
    uri: string,
    resourceType: "image" | "video",
  ) {
    const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      throw new Error(STRINGS.common.cloudinaryMissingEnv);
    }

    const formData = new FormData();
    formData.append("upload_preset", uploadPreset);
    formData.append("file", {
      uri,
      type: getMimeType(uri, resourceType),
      name: getFileName(uri, resourceType === "image" ? "jpg" : "mp4"),
    } as unknown as Blob);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
      {
        method: "POST",
        body: formData,
      },
    );

    const json = (await response.json()) as {
      secure_url?: string;
      error?: any;
    };

    if (!response.ok || !json.secure_url) {
      const cloudinaryMessage =
        typeof json.error?.message === "string"
          ? json.error.message
          : STRINGS.common.cloudinaryUploadFailed;
      throw new Error(cloudinaryMessage);
    }

    return json.secure_url;
  }

  function parseApiErrorMessage(errorText: string, fallback: string) {
    if (!errorText) {
      return fallback;
    }

    try {
      const parsedError = JSON.parse(errorText) as { message?: unknown };
      if (
        typeof parsedError.message === "string" &&
        parsedError.message.trim().length > 0
      ) {
        return parsedError.message;
      }
    } catch {
      // Non-JSON error payloads should still be surfaced as text.
    }

    return errorText;
  }

  function normalizeIngredients(list: Ingredient[]) {
    return list.map((item) => ({
      name: item.name.trim(),
      amount: Number(item.amount),
      unit: item.unit,
    }));
  }

  function areIngredientsEqual(a: Ingredient[], b: Ingredient[]) {
    if (a.length !== b.length) {
      return false;
    }

    return a.every((item, index) => {
      const other = b[index];
      return (
        item.name.trim() === other.name.trim() &&
        Number(item.amount) === Number(other.amount) &&
        item.unit === other.unit
      );
    });
  }

  async function cleanupUrls(urls: string[]) {
    if (urls.length === 0) {
      return;
    }

    try {
      await authorizedFetch("/me/recipes/assets/cleanup", getTokenRef.current, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ urls }),
      });
    } catch {
      // Cleanup is best effort.
    }
  }

  async function handleSubmit() {
    if (!recipe || !isFormValid || isSubmitting) {
      return;
    }

    if (!isSignedIn) {
      Alert.alert(
        STRINGS.recipeEdit.signInRequiredTitle,
        STRINGS.recipeEdit.signInRequiredBody,
      );
      return;
    }

    const uploadedAssetUrls: string[] = [];
    const supersededAssetUrls: string[] = [];

    try {
      setIsSubmitting(true);

      const normalizedTitle = title.trim();
      const normalizedInstructions = instructions.trim();
      const normalizedIngredients = normalizeIngredients(ingredients);
      const originalIngredients = recipe.ingredients
        .map((item) => {
          if (!isIngredientUnit(item.unit)) {
            return null;
          }
          return {
            name: item.ingredient.name,
            amount: Number(item.amount),
            unit: item.unit,
          } as Ingredient;
        })
        .filter((value): value is Ingredient => value !== null);

      let nextImage = image.trim();
      if (
        !nextImage.startsWith("http://") &&
        !nextImage.startsWith("https://")
      ) {
        nextImage = await uploadToCloudinary(nextImage, "image");
        uploadedAssetUrls.push(nextImage);
      }

      let nextVideo: string | null = video.trim() || null;
      if (
        nextVideo &&
        !nextVideo.startsWith("http://") &&
        !nextVideo.startsWith("https://")
      ) {
        nextVideo = await uploadToCloudinary(nextVideo, "video");
        uploadedAssetUrls.push(nextVideo);
      }

      const payload: Record<string, unknown> = {};

      if (normalizedTitle !== recipe.name) {
        payload.name = normalizedTitle;
      }

      if (nextImage !== recipe.image) {
        payload.image = nextImage;
        supersededAssetUrls.push(recipe.image);
      }

      const originalVideo = recipe.video ?? null;
      if (nextVideo !== originalVideo) {
        payload.video = nextVideo;
        if (originalVideo) {
          supersededAssetUrls.push(originalVideo);
        }
      }

      if (normalizedInstructions !== recipe.instructions) {
        payload.instructions = normalizedInstructions;
      }

      if (!areIngredientsEqual(normalizedIngredients, originalIngredients)) {
        payload.ingredients = normalizedIngredients;
      }

      if (Object.keys(payload).length === 0) {
        Alert.alert(
          STRINGS.recipeEdit.noChangesTitle,
          STRINGS.recipeEdit.noChangesBody,
        );
        return;
      }

      const response = await authorizedFetch(
        `/me/recipes/${recipe.id}`,
        getTokenRef.current,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const fallback = STRINGS.recipeEdit.updateFailed;
        const errorText = await response.text();
        throw new Error(parseApiErrorMessage(errorText, fallback));
      }

      await cleanupUrls(supersededAssetUrls);
      router.replace(`/recipe/${recipe.id}`);
    } catch (error) {
      await cleanupUrls(uploadedAssetUrls);
      const message =
        error instanceof Error
          ? error.message
          : STRINGS.recipeEdit.updateFailed;
      Alert.alert(STRINGS.recipeEdit.updateFailedTitle, message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleAddIngredient() {
    const parsedAmount = Number.parseFloat(ingredientAmount);

    if (!ingredientName.trim() || Number.isNaN(parsedAmount)) {
      return;
    }

    setIngredients((currentIngredients) => [
      ...currentIngredients,
      {
        name: ingredientName.trim(),
        amount: parsedAmount,
        unit: ingredientUnit,
      },
    ]);
    setIngredientName("");
    setIngredientAmount("");
    setIngredientUnit(ingredientUnits[0]);
  }

  function handleRemoveIngredient(indexToRemove: number) {
    setIngredients((currentIngredients) =>
      currentIngredients.filter((_, index) => index !== indexToRemove),
    );
  }

  async function handlePickImage() {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        STRINGS.recipeEdit.permissionRequiredTitle,
        STRINGS.recipeEdit.allowPhotoLibrary,
      );
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!pickerResult.canceled && pickerResult.assets.length > 0) {
      setImage(pickerResult.assets[0].uri);
    }
  }

  async function handlePickVideo() {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        STRINGS.recipeEdit.permissionRequiredTitle,
        STRINGS.recipeEdit.allowPhotoLibrary,
      );
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      quality: 1,
    });

    if (!pickerResult.canceled && pickerResult.assets.length > 0) {
      setVideo(pickerResult.assets[0].uri);
    }
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.text} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
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
              <ThemedText type="small">{STRINGS.recipeEdit.back}</ThemedText>
            </Pressable>

            <ThemedText type="subtitle">{STRINGS.recipeEdit.title}</ThemedText>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.recipeEdit.recipeTitle}
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder={STRINGS.recipeEdit.recipeTitlePlaceholder}
                placeholderTextColor={theme.textSecondary}
                value={title}
                onChangeText={setTitle}
              />
            </ThemedView>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.recipeEdit.recipeImage}
              </ThemedText>
              <Pressable
                style={[
                  styles.imageButton,
                  {
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
                onPress={handlePickImage}
              >
                <ThemedText type="smallBold">
                  {image
                    ? STRINGS.recipeEdit.changeImage
                    : STRINGS.recipeEdit.chooseImage}
                </ThemedText>
              </Pressable>
              {image ? (
                <Image
                  source={{ uri: image }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                />
              ) : null}
            </ThemedView>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.recipeEdit.recipeVideoOptional}
              </ThemedText>
              <Pressable
                style={[
                  styles.imageButton,
                  {
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
                onPress={handlePickVideo}
              >
                <ThemedText type="smallBold">
                  {video
                    ? STRINGS.recipeEdit.changeVideo
                    : STRINGS.recipeEdit.uploadVideo}
                </ThemedText>
              </Pressable>
              {video ? (
                <Pressable
                  style={[
                    styles.removeVideoButton,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                  onPress={() => setVideo("")}
                >
                  <ThemedText type="smallBold">
                    {STRINGS.recipeEdit.removeVideo}
                  </ThemedText>
                </Pressable>
              ) : null}
              {video ? (
                <VideoView player={videoPlayer} style={styles.videoPreview} />
              ) : null}
            </ThemedView>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.recipeEdit.addIngredient}
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder={STRINGS.recipeEdit.amountPlaceholder}
                placeholderTextColor={theme.textSecondary}
                value={ingredientAmount}
                onChangeText={setIngredientAmount}
                keyboardType="decimal-pad"
              />
              <ThemedView
                style={[
                  styles.unitPickerContainer,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <Picker
                  selectedValue={ingredientUnit}
                  onValueChange={(value) =>
                    setIngredientUnit(value as IngredientUnit)
                  }
                  dropdownIconColor={theme.text}
                  style={[styles.unitPicker, { color: theme.text }]}
                >
                  {ingredientUnits.map((unit) => (
                    <Picker.Item key={unit} label={unit} value={unit} />
                  ))}
                </Picker>
              </ThemedView>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder={STRINGS.recipeEdit.ingredientNamePlaceholder}
                placeholderTextColor={theme.textSecondary}
                value={ingredientName}
                onChangeText={setIngredientName}
              />
              <Pressable
                style={[
                  styles.addIngredientButton,
                  {
                    backgroundColor: canAddIngredient
                      ? theme.backgroundElement
                      : theme.backgroundSelected,
                  },
                ]}
                disabled={!canAddIngredient}
                onPress={handleAddIngredient}
              >
                <ThemedText type="smallBold">
                  {STRINGS.recipeEdit.addIngredientButton}
                </ThemedText>
              </Pressable>
            </ThemedView>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.recipeEdit.ingredients}
              </ThemedText>
              <ThemedView style={styles.ingredientsList}>
                {ingredients.length === 0 ? (
                  <ThemedText themeColor="textSecondary">
                    {STRINGS.recipeEdit.noIngredients}
                  </ThemedText>
                ) : (
                  ingredients.map((ingredient, index) => (
                    <ThemedView
                      key={`${ingredient.name}-${index}`}
                      style={styles.ingredientRow}
                    >
                      <ThemedText type="small" style={styles.ingredientText}>
                        • {ingredient.amount} {ingredient.unit}{" "}
                        {ingredient.name}
                      </ThemedText>
                      <Pressable
                        style={[
                          styles.removeButton,
                          { backgroundColor: theme.backgroundElement },
                        ]}
                        onPress={() => handleRemoveIngredient(index)}
                      >
                        <ThemedText type="smallBold">
                          {STRINGS.recipeEdit.remove}
                        </ThemedText>
                      </Pressable>
                    </ThemedView>
                  ))
                )}
              </ThemedView>
            </ThemedView>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.recipeEdit.instructions}
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  styles.multilineInput,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder={STRINGS.recipeEdit.instructionsPlaceholder}
                placeholderTextColor={theme.textSecondary}
                value={instructions}
                onChangeText={setInstructions}
                multiline
                numberOfLines={6}
              />
            </ThemedView>

            <Pressable
              style={[
                styles.submitButton,
                {
                  backgroundColor: isFormValid
                    ? "#FF8A00"
                    : theme.backgroundElement,
                },
              ]}
              disabled={!isFormValid || isSubmitting}
              onPress={handleSubmit}
            >
              <ThemedText type="smallBold">
                {isSubmitting
                  ? STRINGS.recipeEdit.saving
                  : STRINGS.recipeEdit.saveChanges}
              </ThemedText>
            </Pressable>
          </ThemedView>
        </ScrollView>
      </KeyboardAvoidingView>
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
  flex: {
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
    paddingTop: Spacing.six,
    gap: Spacing.four,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
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
    fontSize: 16,
  },
  imageButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  imagePreview: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: Spacing.two,
  },
  videoPreview: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: Spacing.two,
  },
  removeVideoButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: "center",
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  unitPickerContainer: {
    borderRadius: Spacing.two,
    overflow: "hidden",
  },
  unitPicker: {
    marginVertical: -Spacing.one,
  },
  addIngredientButton: {
    alignItems: "center",
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  ingredientsList: {
    gap: Spacing.one,
    paddingTop: Spacing.one,
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  ingredientText: {
    flex: 1,
    paddingLeft: Spacing.one,
  },
  removeButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  submitButton: {
    alignItems: "center",
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
});
