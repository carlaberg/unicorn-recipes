import { useAuth } from "@clerk/clerk-expo";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { STRINGS } from "@/constants/strings";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { authorizedFetch } from "@/lib/api";
import { formatDateParam } from "@/lib/date-utils";

type WeeklyMenu = {
  id: number;
  name: string | null;
  startDate: string | null;
  isTemplate: boolean;
};

function formatRangeLabel(start: string, end: string) {
  return `${start} → ${end}`;
}

export default function MenuPlanScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const params = useLocalSearchParams<{ templateId?: string }>();

  const [templates, setTemplates] = useState<WeeklyMenu[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    null,
  );
  const [startDate, setStartDate] = useState(() => formatDateParam(new Date()));
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    const id = parseInt(String(params.templateId ?? ""), 10);
    if (!isNaN(id)) {
      setSelectedTemplateId(id);
    }
  }, [params.templateId]);

  const loadData = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;

    setIsLoading(true);
    setError(null);

    try {
      const templateRes = await authorizedFetch(
        "/me/menus/templates",
        getTokenRef.current,
      );

      if (!templateRes.ok) {
        throw new Error(
          `${STRINGS.menuPlan.createFailed} (${templateRes.status})`,
        );
      }

      const templateData = (await templateRes.json()) as WeeklyMenu[];

      setTemplates(templateData);
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menuPlan.createFailed);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isSignedIn, selectedTemplateId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  async function createPlan() {
    if (!selectedTemplateId) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await authorizedFetch(
        "/me/menus/plan",
        getTokenRef.current,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateMenuId: selectedTemplateId,
            startDate,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuPlan.createFailed} (${response.status})`,
        );
      }

      router.replace(
        `/menu?weekStart=${startDate}&refreshToken=${Date.now()}` as any,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : STRINGS.menuPlan.createFailed);
    } finally {
      setIsSaving(false);
    }
  }

  async function createEmptyMenu() {
    setIsSaving(true);
    setError(null);

    try {
      const response = await authorizedFetch("/me/menus", getTokenRef.current, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `${STRINGS.menuPlan.createEmptyFailed} (${response.status})`,
        );
      }

      router.replace(
        `/menu?weekStart=${startDate}&refreshToken=${Date.now()}` as any,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : STRINGS.menuPlan.createEmptyFailed,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave() {
    if (selectedTemplateId) {
      await createPlan();
      return;
    }

    await createEmptyMenu();
  }

  function getEndDateString(dateString: string) {
    const end = new Date(`${dateString}T00:00:00`);
    end.setDate(end.getDate() + 6);
    return formatDateParam(end);
  }

  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId,
  );

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

        <ThemedText type="subtitle">{STRINGS.menuPlan.title}</ThemedText>

        {isLoading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : (
          <>
            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.shopping.menuPeriod}
              </ThemedText>
              <ThemedText style={styles.rangeSummaryText}>
                {formatRangeLabel(startDate, getEndDateString(startDate))}
              </ThemedText>
              <Pressable
                onPress={() => setIsDatePickerVisible(true)}
                style={[
                  styles.inlineButton,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText type="small">
                  {STRINGS.menuPlan.changeStartDate}
                </ThemedText>
              </Pressable>
              {isDatePickerVisible ? (
                <Calendar
                  current={startDate}
                  markedDates={{
                    [startDate]: {
                      selected: true,
                      selectedColor: theme.backgroundElement,
                      selectedTextColor: theme.text,
                    },
                  }}
                  onDayPress={(day) => {
                    setStartDate(day.dateString);
                    setIsDatePickerVisible(false);
                  }}
                  theme={{
                    backgroundColor: theme.background,
                    calendarBackground: theme.background,
                    dayTextColor: theme.text,
                    textDisabledColor: theme.textSecondary,
                    monthTextColor: theme.text,
                    textSectionTitleColor: theme.textSecondary,
                    arrowColor: theme.text,
                    todayTextColor: "#FF8A00",
                  }}
                  enableSwipeMonths
                />
              ) : null}
            </ThemedView>

            <ThemedView
              style={[styles.field, { borderColor: theme.backgroundElement }]}
            >
              {selectedTemplate ? (
                <>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {STRINGS.menuPlan.selectedTemplate}
                  </ThemedText>
                  <View style={styles.selectedTemplateRow}>
                    <ThemedText style={styles.selectedTemplateName}>
                      {selectedTemplate.name?.trim() ||
                        STRINGS.menu.unnamedMenu}
                    </ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        STRINGS.menuPlan.clearSelectedTemplate
                      }
                      onPress={() => setSelectedTemplateId(null)}
                      style={[
                        styles.inlineIconButton,
                        { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      <SymbolView
                        name={{
                          ios: "trash",
                          android: "delete",
                          web: "delete",
                        }}
                        size={18}
                        weight="medium"
                        tintColor={theme.text}
                      />
                    </Pressable>
                  </View>
                </>
              ) : (
                <ThemedText themeColor="textSecondary">
                  {STRINGS.menuPlan.chooseTemplate}
                </ThemedText>
              )}
              <Pressable
                onPress={() => router.push("/menu/library")}
                style={[
                  styles.inlineButton,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText type="small">{STRINGS.menu.openLibrary}</ThemedText>
              </Pressable>
            </ThemedView>

            <Pressable
              onPress={handleSave}
              disabled={isSaving}
              style={[
                styles.submitButton,
                {
                  backgroundColor: isSaving
                    ? theme.backgroundElement
                    : "#FF8A00",
                },
              ]}
            >
              <ThemedText type="smallBold">
                {isSaving ? STRINGS.menuPlan.saving : STRINGS.menuPlan.save}
              </ThemedText>
            </Pressable>

            {error && (
              <ThemedText themeColor="textSecondary">{error}</ThemedText>
            )}
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
  field: {
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  rangeSummaryText: {
    fontWeight: "600",
  },
  selectedTemplateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  selectedTemplateName: {
    flex: 1,
  },
  inlineIconButton: {
    width: Spacing.five,
    height: Spacing.five,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 8,
  },
  submitButton: {
    alignItems: "center",
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
});
