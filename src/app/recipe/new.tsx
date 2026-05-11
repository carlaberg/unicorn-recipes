import { useAuth } from "@clerk/clerk-expo";
import { Picker } from "@react-native-picker/picker";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useState } from "react";
import {
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
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { Ingredient, IngredientUnit, ingredientUnits } from "@/data/mock-data";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";

export default function NewRecipeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isSignedIn } = useAuth();

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const canAddIngredient =
    ingredientName.trim().length > 0 && ingredientAmount.trim().length > 0;
  const isFormValid =
    title.trim().length > 0 &&
    image.trim().length > 0 &&
    ingredients.length > 0 &&
    instructions.trim().length > 0;

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
      throw new Error(
        "Missing Cloudinary env vars: EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET",
      );
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
          : "Cloudinary upload failed";
      throw new Error(cloudinaryMessage);
    }

    return json.secure_url;
  }

  async function handleSubmit() {
    if (!isFormValid || isSubmitting) {
      return;
    }

    if (!isSignedIn) {
      Alert.alert(
        "Sign in required",
        "Please sign in before creating a recipe.",
      );
      return;
    }

    const uploadedAssetUrls: string[] = [];
    let recipeCreated = false;

    try {
      setIsSubmitting(true);

      const imageUrl = await uploadToCloudinary(image, "image");
      uploadedAssetUrls.push(imageUrl);

      const videoUrl = video.trim()
        ? await uploadToCloudinary(video, "video")
        : undefined;
      if (videoUrl) {
        uploadedAssetUrls.push(videoUrl);
      }

      const response = await authorizedFetch("/me/recipes/create", getToken, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          image: imageUrl,
          ...(videoUrl ? { video: videoUrl } : {}),
          instructions: instructions.trim(),
          ingredients,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to create recipe");
      }

      recipeCreated = true;

      router.back();
    } catch (error) {
      if (!recipeCreated && uploadedAssetUrls.length > 0) {
        try {
          await authorizedFetch("/me/recipes/assets/cleanup", getToken, {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ urls: uploadedAssetUrls }),
          });
        } catch {
          // Cleanup is best-effort; keep the original create error surfaced to the user.
        }
      }

      const message =
        error instanceof Error ? error.message : "Failed to save recipe";
      Alert.alert("Save failed", message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function parseScanRecipeResponse(value: unknown): {
    title: string;
    instructions: string;
    ingredients: Ingredient[];
  } | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const maybeRecipe = value as {
      title?: unknown;
      instructions?: unknown;
      ingredients?: unknown;
    };

    if (
      typeof maybeRecipe.title !== "string" ||
      typeof maybeRecipe.instructions !== "string" ||
      !Array.isArray(maybeRecipe.ingredients)
    ) {
      return null;
    }

    const parsedIngredients: Ingredient[] = [];
    for (const ingredient of maybeRecipe.ingredients) {
      if (!ingredient || typeof ingredient !== "object") {
        return null;
      }

      const maybeIngredient = ingredient as {
        name?: unknown;
        amount?: unknown;
        unit?: unknown;
      };

      const amount =
        typeof maybeIngredient.amount === "number"
          ? maybeIngredient.amount
          : Number(maybeIngredient.amount);

      if (
        typeof maybeIngredient.name !== "string" ||
        typeof maybeIngredient.unit !== "string" ||
        !ingredientUnits.includes(maybeIngredient.unit as IngredientUnit) ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return null;
      }

      parsedIngredients.push({
        name: maybeIngredient.name.trim(),
        amount,
        unit: maybeIngredient.unit as IngredientUnit,
      });
    }

    return {
      title: maybeRecipe.title.trim(),
      instructions: maybeRecipe.instructions.trim(),
      ingredients: parsedIngredients,
    };
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
      Alert.alert("Permission required", "Please allow photo library access.");
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

  async function handleScanRecipe() {
    if (isScanning) {
      return;
    }

    if (!isSignedIn) {
      Alert.alert(
        "Sign in required",
        "Please sign in before scanning a recipe.",
      );
      return;
    }

    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission required", "Please allow camera access.");
      return;
    }

    const cameraResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });

    if (cameraResult.canceled || cameraResult.assets.length === 0) {
      return;
    }

    const capturedImageUri = cameraResult.assets[0].uri;

    try {
      setIsScanning(true);

      const ocrResult = await TextRecognition.recognize(capturedImageUri);
      const rawText = ocrResult.text?.trim() ?? "";

      if (!rawText) {
        Alert.alert("Scan failed", "No readable text was found in the photo.");
        return;
      }

      const response = await authorizedFetch("/me/recipes/scan", getToken, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ rawText }),
      });

      if (!response.ok) {
        const fallback =
          response.status === 422
            ? "Could not parse a complete recipe. Try a clearer photo."
            : "Recipe scan failed";
        const errorText = await response.text();
        throw new Error(errorText || fallback);
      }

      const json = (await response.json()) as unknown;
      const parsedRecipe = parseScanRecipeResponse(json);

      if (!parsedRecipe) {
        throw new Error("Received invalid scan data from the server.");
      }

      setTitle(parsedRecipe.title);
      setInstructions(parsedRecipe.instructions);
      setIngredients(parsedRecipe.ingredients);
      setImage(capturedImageUri);
      setVideo("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to scan recipe";
      Alert.alert("Scan failed", message);
    } finally {
      setIsScanning(false);
    }
  }

  const videoPlayer = useVideoPlayer(video || null, (player) => {
    player.loop = false;
  });

  async function handlePickVideo() {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert("Permission required", "Please allow photo library access.");
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
              <ThemedText type="small">← Back</ThemedText>
            </Pressable>

            <ThemedText type="subtitle">New Recipe</ThemedText>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                Title
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder="Recipe title"
                placeholderTextColor={theme.textSecondary}
                value={title}
                onChangeText={setTitle}
              />
            </ThemedView>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                Recipe Image
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
                  {image ? "Change Image" : "Upload From Device"}
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.imageButton,
                  {
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
                onPress={handleScanRecipe}
                disabled={isScanning}
              >
                <ThemedText type="smallBold">
                  {isScanning ? "Scanning..." : "Scan Recipe"}
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
                Recipe Video (Optional)
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
                  {video ? "Change Video" : "Upload Video From Device"}
                </ThemedText>
              </Pressable>
              {video ? (
                <VideoView player={videoPlayer} style={styles.videoPreview} />
              ) : null}
            </ThemedView>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                Add Ingredient
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder="Amount"
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
                placeholder="Ingredient name"
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
                <ThemedText type="smallBold">Add Ingredient</ThemedText>
              </Pressable>
            </ThemedView>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                Ingredients
              </ThemedText>
              <ThemedView style={styles.ingredientsList}>
                {ingredients.length === 0 ? (
                  <ThemedText themeColor="textSecondary">
                    No ingredients added yet.
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
                        <ThemedText type="smallBold">Remove</ThemedText>
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
                Instructions
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
                placeholder="Describe the steps..."
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
                {isSubmitting ? "Saving..." : "Save Recipe"}
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
