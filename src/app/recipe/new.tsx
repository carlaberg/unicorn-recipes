import { useAuth } from "@clerk/clerk-expo";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
  Ingredient,
  IngredientUnit,
  ingredientUnits,
  normalizeIngredientUnit,
} from "@/data/mock-data";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";

type ImportSource = "upload" | "scan" | "text";

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
  const [activeImport, setActiveImport] = useState<ImportSource | null>(null);
  const [isTextImportModalVisible, setIsTextImportModalVisible] =
    useState(false);
  const [importText, setImportText] = useState("");

  const canAddIngredient =
    ingredientName.trim().length > 0 && ingredientAmount.trim().length > 0;
  const isFormValid =
    title.trim().length > 0 &&
    image.trim().length > 0 &&
    ingredients.length > 0 &&
    instructions.trim().length > 0;
  const isImporting = activeImport !== null;
  const hasExistingFormContent =
    title.trim().length > 0 ||
    instructions.trim().length > 0 ||
    ingredients.length > 0 ||
    image.trim().length > 0 ||
    video.trim().length > 0;

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

  async function handleSubmit() {
    if (!isFormValid || isSubmitting) {
      return;
    }

    if (!isSignedIn) {
      Alert.alert(
        STRINGS.recipeNew.signInRequiredTitle,
        STRINGS.recipeNew.signInRequiredBody,
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
        throw new Error(errorText || STRINGS.recipeNew.saveFailedTitle);
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
        error instanceof Error
          ? error.message
          : STRINGS.recipeNew.saveFailedTitle;
      Alert.alert(STRINGS.recipeNew.saveFailedTitle, message);
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

      const normalizedUnit =
        typeof maybeIngredient.unit === "string"
          ? normalizeIngredientUnit(maybeIngredient.unit)
          : null;

      if (
        typeof maybeIngredient.name !== "string" ||
        !normalizedUnit ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return null;
      }

      parsedIngredients.push({
        name: maybeIngredient.name.trim(),
        amount: amount * normalizedUnit.multiplier,
        unit: normalizedUnit.unit,
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

  async function confirmReplaceExistingForm() {
    if (!hasExistingFormContent) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      Alert.alert(
        STRINGS.recipeNew.importReplaceTitle,
        STRINGS.recipeNew.importReplaceBody,
        [
          {
            text: STRINGS.recipeNew.modalCancel,
            style: "cancel",
            onPress: () => resolve(false),
          },
          {
            text: STRINGS.recipeNew.importReplaceConfirm,
            style: "destructive",
            onPress: () => resolve(true),
          },
        ],
        {
          cancelable: true,
          onDismiss: () => resolve(false),
        },
      );
    });
  }

  async function importFromRawText(
    rawText: string,
    source: ImportSource,
  ): Promise<boolean> {
    if (isImporting) {
      return false;
    }

    if (!isSignedIn) {
      Alert.alert(
        STRINGS.recipeNew.signInRequiredTitle,
        STRINGS.recipeNew.importSignInBody,
      );
      return false;
    }

    const shouldReplace = await confirmReplaceExistingForm();
    if (!shouldReplace) {
      return false;
    }

    try {
      setActiveImport(source);

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
            ? STRINGS.recipeNew.parseIncompleteRecipe
            : STRINGS.recipeNew.importFailedTitle;
        const errorText = await response.text();
        throw new Error(parseApiErrorMessage(errorText, fallback));
      }

      const json = (await response.json()) as unknown;
      const parsedRecipe = parseScanRecipeResponse(json);

      if (!parsedRecipe) {
        throw new Error(STRINGS.recipeNew.importInvalidData);
      }

      setTitle(parsedRecipe.title);
      setInstructions(parsedRecipe.instructions);
      setIngredients(parsedRecipe.ingredients);

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : STRINGS.recipeNew.importFailedTitle;
      Alert.alert(STRINGS.recipeNew.importFailedTitle, message);
      return false;
    } finally {
      setActiveImport(null);
    }
  }

  async function handlePickImage() {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        STRINGS.recipeNew.permissionRequiredTitle,
        STRINGS.recipeNew.allowPhotoLibrary,
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

  async function handleTakePhoto() {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        STRINGS.recipeNew.permissionRequiredTitle,
        STRINGS.recipeNew.allowCamera,
      );
      return;
    }

    const cameraResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!cameraResult.canceled && cameraResult.assets.length > 0) {
      setImage(cameraResult.assets[0].uri);
    }
  }

  async function handleImportFromDevice() {
    if (isImporting) {
      return;
    }

    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        STRINGS.recipeNew.permissionRequiredTitle,
        STRINGS.recipeNew.allowPhotoLibrary,
      );
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
    });

    if (pickerResult.canceled || pickerResult.assets.length === 0) {
      return;
    }

    const selectedImageUri = pickerResult.assets[0].uri;
    const ocrResult = await TextRecognition.recognize(selectedImageUri);
    const rawText = ocrResult.text?.trim() ?? "";

    if (!rawText) {
      Alert.alert(
        STRINGS.recipeNew.importFailedTitle,
        STRINGS.recipeNew.noTextFound,
      );
      return;
    }

    await importFromRawText(rawText, "upload");
  }

  async function handleScanRecipe() {
    if (isImporting) {
      return;
    }

    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert(
        STRINGS.recipeNew.permissionRequiredTitle,
        STRINGS.recipeNew.allowCamera,
      );
      return;
    }

    const cameraResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
    });

    if (cameraResult.canceled || cameraResult.assets.length === 0) {
      return;
    }

    const capturedImageUri = cameraResult.assets[0].uri;

    const ocrResult = await TextRecognition.recognize(capturedImageUri);
    const rawText = ocrResult.text?.trim() ?? "";

    if (!rawText) {
      Alert.alert(
        STRINGS.recipeNew.scanFailedTitle,
        STRINGS.recipeNew.noTextFound,
      );
      return;
    }

    await importFromRawText(rawText, "scan");
  }

  function openCreateFromTextModal() {
    setIsTextImportModalVisible(true);
  }

  async function handleImportFromText() {
    Keyboard.dismiss();

    const rawText = importText.trim();

    if (!rawText) {
      Alert.alert(
        STRINGS.recipeNew.textRequiredTitle,
        STRINGS.recipeNew.textRequiredBody,
      );
      return;
    }

    const wasImported = await importFromRawText(rawText, "text");
    if (wasImported) {
      setImportText("");
      setIsTextImportModalVisible(false);
    }
  }

  const videoPlayer = useVideoPlayer(video || null, (player) => {
    player.loop = false;
  });

  async function handlePickVideo() {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        STRINGS.recipeNew.permissionRequiredTitle,
        STRINGS.recipeNew.allowPhotoLibrary,
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

  return (
    <ThemedView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={{ backgroundColor: theme.background }}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
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
              <ThemedText type="small">{STRINGS.recipeNew.back}</ThemedText>
            </Pressable>

            <ThemedText type="subtitle">{STRINGS.recipeNew.title}</ThemedText>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.recipeNew.importTitle}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {STRINGS.recipeNew.importDescription}
              </ThemedText>
              <Pressable
                style={[
                  styles.imageButton,
                  {
                    backgroundColor: theme.backgroundElement,
                    opacity: isImporting ? 0.7 : 1,
                  },
                ]}
                onPress={handleImportFromDevice}
                disabled={isImporting}
              >
                <ThemedText type="smallBold">
                  {activeImport === "upload"
                    ? STRINGS.recipeNew.uploading
                    : STRINGS.recipeNew.uploadFromDevice}
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.imageButton,
                  {
                    backgroundColor: theme.backgroundElement,
                    opacity: isImporting ? 0.7 : 1,
                  },
                ]}
                onPress={handleScanRecipe}
                disabled={isImporting}
              >
                <ThemedText type="smallBold">
                  {activeImport === "scan"
                    ? STRINGS.recipeNew.scanning
                    : STRINGS.recipeNew.scanRecipe}
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.imageButton,
                  {
                    backgroundColor: theme.backgroundElement,
                    opacity: isImporting ? 0.7 : 1,
                  },
                ]}
                onPress={openCreateFromTextModal}
                disabled={isImporting}
              >
                <ThemedText type="smallBold">
                  {STRINGS.recipeNew.createFromText}
                </ThemedText>
              </Pressable>
            </ThemedView>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.recipeNew.recipeTitle}
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder={STRINGS.recipeNew.recipeTitle}
                placeholderTextColor={theme.textSecondary}
                value={title}
                onChangeText={setTitle}
              />
            </ThemedView>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.recipeNew.recipeImage}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {STRINGS.recipeNew.imageDescription}
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
                    ? STRINGS.recipeNew.changeImage
                    : STRINGS.recipeNew.chooseImage}
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.imageButton,
                  {
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
                onPress={handleTakePhoto}
              >
                <ThemedText type="smallBold">
                  {STRINGS.recipeNew.takePhoto}
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
                {STRINGS.recipeNew.recipeVideoOptional}
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
                    ? STRINGS.recipeNew.changeVideo
                    : STRINGS.recipeNew.uploadVideo}
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
                {STRINGS.recipeNew.addIngredient}
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder={STRINGS.recipeNew.amountPlaceholder}
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
                placeholder={STRINGS.recipeNew.ingredientNamePlaceholder}
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
                  {STRINGS.recipeNew.addIngredientButton}
                </ThemedText>
              </Pressable>
            </ThemedView>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.recipeNew.ingredients}
              </ThemedText>
              <ThemedView style={styles.ingredientsList}>
                {ingredients.length === 0 ? (
                  <ThemedText themeColor="textSecondary">
                    {STRINGS.recipeNew.noIngredients}
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
                          {STRINGS.recipeNew.remove}
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
                {STRINGS.recipeNew.instructions}
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
                placeholder={STRINGS.recipeNew.instructionsPlaceholder}
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
                  ? STRINGS.recipeNew.saving
                  : STRINGS.recipeNew.save}
              </ThemedText>
            </Pressable>

            <Modal
              visible={isTextImportModalVisible}
              animationType="slide"
              transparent
              onRequestClose={() => setIsTextImportModalVisible(false)}
            >
              <ThemedView
                style={[
                  styles.modalOverlay,
                  { backgroundColor: "rgba(0, 0, 0, 0.45)" },
                ]}
              >
                <KeyboardAvoidingView
                  style={styles.modalKeyboardAvoiding}
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                >
                  <ScrollView
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode="none"
                    contentContainerStyle={styles.modalScrollContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <ThemedView
                      style={[
                        styles.modalCard,
                        {
                          backgroundColor: theme.background,
                          borderColor: theme.backgroundElement,
                        },
                      ]}
                    >
                      <ThemedText type="smallBold">
                        {STRINGS.recipeNew.modalTitle}
                      </ThemedText>
                      <ThemedText themeColor="textSecondary">
                        {STRINGS.recipeNew.modalDescription}
                      </ThemedText>
                      <TextInput
                        style={[
                          styles.input,
                          styles.importTextInput,
                          {
                            backgroundColor: theme.backgroundElement,
                            color: theme.text,
                          },
                        ]}
                        placeholder={STRINGS.recipeNew.modalPlaceholder}
                        placeholderTextColor={theme.textSecondary}
                        value={importText}
                        onChangeText={setImportText}
                        multiline
                        numberOfLines={8}
                        textAlignVertical="top"
                      />
                      <ThemedView style={styles.modalActions}>
                        <Pressable
                          style={[
                            styles.modalButton,
                            { backgroundColor: theme.backgroundElement },
                          ]}
                          onPress={() => setIsTextImportModalVisible(false)}
                          disabled={activeImport === "text"}
                        >
                          <ThemedText type="smallBold">
                            {STRINGS.recipeNew.modalCancel}
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.modalButton,
                            {
                              backgroundColor:
                                activeImport === "text"
                                  ? theme.backgroundSelected
                                  : "#FF8A00",
                            },
                          ]}
                          onPress={handleImportFromText}
                          disabled={activeImport === "text"}
                        >
                          <ThemedText type="smallBold">
                            {activeImport === "text"
                              ? STRINGS.recipeNew.modalImporting
                              : STRINGS.recipeNew.modalImport}
                          </ThemedText>
                        </Pressable>
                      </ThemedView>
                    </ThemedView>
                  </ScrollView>
                </KeyboardAvoidingView>
              </ThemedView>
            </Modal>
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
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: Spacing.four,
  },
  modalKeyboardAvoiding: {
    width: "100%",
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  importTextInput: {
    minHeight: 140,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "flex-end",
  },
  modalButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minWidth: 96,
    alignItems: "center",
  },
});
