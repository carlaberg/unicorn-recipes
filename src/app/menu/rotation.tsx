import { useAuth } from "@clerk/clerk-expo";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import DraggableFlatList, {
    RenderItemParams,
} from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { STRINGS } from "@/constants/strings";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";
import { formatDateParam } from "@/lib/date-utils";

type TemplateSummary = {
  id: number;
  name: string | null;
  tags?: string[];
};

type RotationTemplateRef = {
  id: number;
  templateMenuId: number;
  orderIndex: number;
  templateMenu: TemplateSummary;
};

type Rotation = {
  id: number;
  name: string | null;
  description: string | null;
  startDate: string;
  isActive: boolean;
  maxCycles: number | null;
  templates: RotationTemplateRef[];
};

export default function RotationPlannerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const params = useLocalSearchParams<{ rotationId?: string }>();

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [rotation, setRotation] = useState<Rotation | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(() => formatDateParam(new Date()));
  const [activateNow, setActivateNow] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderSaved, setOrderSaved] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const selectedTemplates = useMemo(
    () =>
      selectedTemplateIds
        .map((id) => templates.find((template) => template.id === id))
        .filter((template): template is TemplateSummary => !!template),
    [selectedTemplateIds, templates],
  );

  const loadData = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;

    const rotationId = parseInt(String(params.rotationId ?? ""), 10);

    setIsLoading(true);
    setError(null);
    setRotation(null);
    setName("");
    setDescription("");
    setStartDate(formatDateParam(new Date()));
    setActivateNow(true);
    setSelectedTemplateIds([]);

    try {
      const [templatesRes, activeRes] = await Promise.all([
        authorizedFetch("/me/menus/templates", getTokenRef.current),
        isNaN(rotationId)
          ? authorizedFetch("/me/menus/rotations/active", getTokenRef.current)
          : Promise.resolve(null),
      ]);

      if (!templatesRes.ok) {
        throw new Error(
          `${STRINGS.menuRotation.loadFailed} (${templatesRes.status})`,
        );
      }

      const templatesData = (await templatesRes.json()) as TemplateSummary[];
      setTemplates(templatesData);

      let resolvedRotationId = rotationId;
      if (isNaN(resolvedRotationId) && activeRes && activeRes.ok) {
        const activeRotation = (await activeRes.json()) as Rotation | null;
        if (activeRotation?.id) {
          resolvedRotationId = activeRotation.id;
        }
      }

      if (!isNaN(resolvedRotationId)) {
        const rotationRes = await authorizedFetch(
          `/me/menus/rotations/${resolvedRotationId}`,
          getTokenRef.current,
        );

        if (rotationRes.status === 404) {
          router.replace(`/menu?refreshToken=${Date.now()}` as any);
          return;
        }

        if (!rotationRes.ok) {
          throw new Error(
            `${STRINGS.menuRotation.loadFailed} (${rotationRes.status})`,
          );
        }

        const loadedRotation = (await rotationRes.json()) as Rotation;

        setRotation(loadedRotation);
        setName(loadedRotation.name ?? "");
        setDescription(loadedRotation.description ?? "");
        setStartDate(String(loadedRotation.startDate).slice(0, 10));
        setActivateNow(loadedRotation.isActive);
        setSelectedTemplateIds(
          [...loadedRotation.templates]
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((item) => item.templateMenuId),
        );
      } else {
        setRotation(null);
      }
    } catch (e) {
      setRotation(null);
      setSelectedTemplateIds([]);
      setError(
        e instanceof Error ? e.message : STRINGS.menuRotation.loadFailed,
      );
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isSignedIn, params.rotationId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  function toggleTemplate(templateId: number) {
    setSelectedTemplateIds((current) => {
      if (current.includes(templateId)) {
        return current.filter((id) => id !== templateId);
      }
      return [...current, templateId];
    });
  }

  async function createRotation() {
    if (isSaving) return;
    if (selectedTemplateIds.length === 0) {
      setError(STRINGS.menuRotation.selectTemplates);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await authorizedFetch(
        "/me/menus/rotations",
        getTokenRef.current,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim() || undefined,
            description: description.trim() || undefined,
            startDate,
            templateMenuIds: selectedTemplateIds,
            activateNow,
            preGenerateWeeks: 0,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuRotation.createFailed} (${response.status})`,
        );
      }

      const payload = (await response.json()) as { rotation?: Rotation | null };
      const createdRotation = payload.rotation;
      if (createdRotation?.id) {
        const menuStartDate = String(createdRotation.startDate).slice(0, 10);
        router.replace(
          `/menu?weekStart=${menuStartDate}&refreshToken=${Date.now()}` as any,
        );
      } else {
        await loadData();
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : STRINGS.menuRotation.createFailed,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveOrder(ids: number[]) {
    if (!rotation || ids.length === 0) return;

    try {
      const response = await authorizedFetch(
        `/me/menus/rotations/${rotation.id}/order`,
        getTokenRef.current,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateMenuIds: ids }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuRotation.updateOrderFailed} (${response.status})`,
        );
      }

      setOrderSaved(true);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => setOrderSaved(false), 2000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : STRINGS.menuRotation.updateOrderFailed,
      );
    }
  }

  async function updateRotation() {
    if (!rotation || isSaving) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await authorizedFetch(
        `/me/menus/rotations/${rotation.id}`,
        getTokenRef.current,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim() || undefined,
            description: description.trim() || undefined,
            startDate,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuRotation.updateFailed} (${response.status})`,
        );
      }

      await loadData();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : STRINGS.menuRotation.updateFailed,
      );
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDeactivate() {
    if (!rotation || isSaving) return;

    Alert.alert(
      STRINGS.menuRotation.deactivatePromptTitle,
      STRINGS.menuRotation.deactivatePromptBody,
      [
        {
          text: STRINGS.menuRotation.keepGenerated,
          onPress: () => deactivateRotation("keep-generated"),
        },
        {
          text: STRINGS.menuRotation.deleteFutureGenerated,
          style: "destructive",
          onPress: () => deactivateRotation("delete-future-generated"),
        },
        { text: STRINGS.menu.cancel, style: "cancel" },
      ],
    );
  }

  function confirmDeleteRotation() {
    if (!rotation || isSaving) return;

    Alert.alert(
      STRINGS.menuRotation.deletePromptTitle,
      STRINGS.menuRotation.deletePromptBody,
      [
        { text: STRINGS.menu.cancel, style: "cancel" },
        {
          text: STRINGS.menuRotation.deleteConfirm,
          style: "destructive",
          onPress: deleteRotation,
        },
      ],
    );
  }

  async function deactivateRotation(
    mode: "keep-generated" | "delete-future-generated",
  ) {
    if (!rotation || isSaving) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await authorizedFetch(
        `/me/menus/rotations/${rotation.id}/deactivate`,
        getTokenRef.current,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuRotation.deactivateFailed} (${response.status})`,
        );
      }

      await loadData();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : STRINGS.menuRotation.deactivateFailed,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function activateRotation() {
    if (!rotation || isSaving || rotation.isActive) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await authorizedFetch(
        `/me/menus/rotations/${rotation.id}/activate`,
        getTokenRef.current,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preGenerateWeeks: 0 }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuRotation.activateFailed} (${response.status})`,
        );
      }

      await loadData();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : STRINGS.menuRotation.activateFailed,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRotation() {
    if (!rotation || isSaving) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await authorizedFetch(
        `/me/menus/rotations/${rotation.id}`,
        getTokenRef.current,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuRotation.deleteFailed} (${response.status})`,
        );
      }

      router.replace(`/menu?refreshToken=${Date.now()}` as any);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : STRINGS.menuRotation.deleteFailed,
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + Spacing.two,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.three,
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

        <ThemedText type="subtitle">
          {STRINGS.menuRotation.plannerTitle}
        </ThemedText>

        {isLoading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : (
          <>
            <View
              style={[styles.section, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.menuRotation.title}
              </ThemedText>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={STRINGS.menuRotation.namePlaceholder}
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={STRINGS.menuRotation.descriptionPlaceholder}
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
              />
              <TextInput
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
              />
              <Pressable
                onPress={() => setActivateNow((value) => !value)}
                style={[
                  styles.pillButton,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText type="small">{`${STRINGS.menuRotation.activateNow}: ${
                  activateNow ? "Ja" : "Nej"
                }`}</ThemedText>
              </Pressable>
            </View>

            <View
              style={[styles.section, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.menuRotation.templates}
              </ThemedText>
              <View style={styles.wrap}>
                {templates.map((template) => {
                  const selected = selectedTemplateIds.includes(template.id);
                  return (
                    <Pressable
                      key={template.id}
                      onPress={() => toggleTemplate(template.id)}
                      style={[
                        styles.templateChip,
                        {
                          borderColor: theme.backgroundElement,
                          backgroundColor: selected
                            ? theme.backgroundElement
                            : "transparent",
                        },
                      ]}
                    >
                      <ThemedText type="small">
                        {template.name || STRINGS.menu.unnamedMenu}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View
              style={[styles.section, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.menuRotation.selectedOrder}
              </ThemedText>
              {selectedTemplates.length === 0 ? (
                <ThemedText themeColor="textSecondary">
                  {STRINGS.menuRotation.selectTemplates}
                </ThemedText>
              ) : (
                <DraggableFlatList
                  data={selectedTemplates}
                  keyExtractor={(item) => String(item.id)}
                  scrollEnabled={false}
                  onDragEnd={({ data }) => {
                    const newIds = data.map((item) => item.id);
                    setSelectedTemplateIds(newIds);
                    if (rotation) {
                      saveOrder(newIds);
                    }
                  }}
                  renderItem={({
                    item,
                    getIndex,
                    drag,
                    isActive,
                  }: RenderItemParams<TemplateSummary>) => (
                    <Pressable
                      onLongPress={drag}
                      style={[
                        styles.dragRow,
                        {
                          backgroundColor: theme.backgroundElement,
                          opacity: isActive ? 0.7 : 1,
                        },
                      ]}
                    >
                      <ThemedText
                        style={styles.orderTitle}
                      >{`${(getIndex?.() ?? 0) + 1}. ${
                        item.name || STRINGS.menu.unnamedMenu
                      }`}</ThemedText>
                      <ThemedText
                        themeColor="textSecondary"
                        style={styles.dragHandle}
                      >
                        ≡
                      </ThemedText>
                    </Pressable>
                  )}
                  ItemSeparatorComponent={() => (
                    <View style={styles.dragSeparator} />
                  )}
                />
              )}
              {rotation && orderSaved ? (
                <ThemedText
                  themeColor="textSecondary"
                  style={styles.centerText}
                >
                  {STRINGS.menu.saved}
                </ThemedText>
              ) : null}
            </View>

            {rotation ? (
              <View style={styles.actionsStack}>
                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={updateRotation}
                    disabled={isSaving}
                    style={[
                      styles.primaryButton,
                      styles.actionButton,
                      { backgroundColor: theme.accent },
                    ]}
                  >
                    <ThemedText style={{ color: theme.accentText }}>
                      {isSaving
                        ? STRINGS.menuRotation.saving
                        : STRINGS.menu.save}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={
                      rotation.isActive ? confirmDeactivate : activateRotation
                    }
                    disabled={isSaving}
                    style={[
                      styles.primaryButton,
                      styles.actionButton,
                      {
                        backgroundColor: theme.backgroundElement,
                        opacity: isSaving ? 0.6 : 1,
                      },
                    ]}
                  >
                    <ThemedText>
                      {rotation.isActive
                        ? STRINGS.menuRotation.deactivate
                        : STRINGS.menuRotation.activate}
                    </ThemedText>
                  </Pressable>
                </View>
                <Pressable
                  onPress={confirmDeleteRotation}
                  disabled={isSaving}
                  style={[
                    styles.primaryButton,
                    {
                      backgroundColor: theme.backgroundElement,
                      opacity: isSaving ? 0.6 : 1,
                    },
                  ]}
                >
                  <ThemedText style={{ color: "#B42318" }}>
                    {isSaving
                      ? STRINGS.menuRotation.deleting
                      : STRINGS.menuRotation.delete}
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={createRotation}
                disabled={isSaving}
                style={[
                  styles.submitButton,
                  {
                    backgroundColor: isSaving
                      ? theme.backgroundElement
                      : theme.accent,
                  },
                ]}
              >
                <ThemedText
                  style={{ color: isSaving ? theme.text : theme.accentText }}
                >
                  {isSaving
                    ? STRINGS.menuRotation.generating
                    : activateNow
                      ? STRINGS.menuRotation.startRotation
                      : STRINGS.menuRotation.saveDraft}
                </ThemedText>
              </Pressable>
            )}

            {error ? (
              <ThemedText themeColor="textSecondary">{error}</ThemedText>
            ) : null}
          </>
        )}
      </ScrollView>
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
  loader: {
    marginTop: Spacing.four,
  },
  section: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pillButton: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
  templateChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  dragRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  dragSeparator: {
    height: Spacing.one,
  },
  orderTitle: {
    flex: 1,
  },
  dragHandle: {
    fontSize: 18,
    lineHeight: 18,
  },
  centerText: {
    textAlign: "center",
    marginTop: Spacing.one,
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  actionsStack: {
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
  },
  singleActionButton: {
    flex: 1,
  },
  primaryButton: {
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
});
