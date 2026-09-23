import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { STRINGS } from "@/constants/strings";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { NotificationDeliveryMethod } from "@/lib/notifications";
import { parseDateParam } from "@/lib/date-utils";

export type NotificationFormValues = {
  date: string;
  time: string;
  message: string;
  repeatsWeekly: boolean;
  deliveryMethods: NotificationDeliveryMethod[];
};

type NotificationFormScreenProps = {
  title: string;
  submitLabel: string;
  submitBusyLabel: string;
  initialValues: NotificationFormValues;
  onSubmit: (values: NotificationFormValues) => Promise<string | null | void>;
  onDelete?: () => Promise<string | null | void>;
  deleteBusyLabel?: string;
};

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const deliveryMethodOptions: Array<{
  value: NotificationDeliveryMethod;
  label: string;
}> = [
  { value: "APP", label: STRINGS.notifications.methodApp },
  { value: "SMS", label: STRINGS.notifications.methodSms },
  { value: "CALENDAR", label: STRINGS.notifications.methodCalendar },
];

export function NotificationFormScreen({
  title,
  submitLabel,
  submitBusyLabel,
  initialValues,
  onSubmit,
  onDelete,
  deleteBusyLabel,
}: NotificationFormScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [date, setDate] = useState(initialValues.date);
  const [time, setTime] = useState(initialValues.time);
  const [message, setMessage] = useState(initialValues.message);
  const [repeatsWeekly, setRepeatsWeekly] = useState(initialValues.repeatsWeekly);
  const [deliveryMethods, setDeliveryMethods] = useState<NotificationDeliveryMethod[]>(
    initialValues.deliveryMethods,
  );
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDate = useMemo(() => parseDateParam(date), [date]);

  function toggleDeliveryMethod(method: NotificationDeliveryMethod) {
    setDeliveryMethods((current) =>
      current.includes(method)
        ? current.filter((entry) => entry !== method)
        : [...current, method],
    );
  }

  function validateForm() {
    if (!message.trim()) {
      return STRINGS.notifications.requiredMessage;
    }

    if (!parseDateParam(date)) {
      return STRINGS.notifications.invalidDate;
    }

    if (!timePattern.test(time)) {
      return STRINGS.notifications.invalidTime;
    }

    if (deliveryMethods.length === 0) {
      return STRINGS.notifications.requiredDeliveryMethod;
    }

    return null;
  }

  async function handleSubmit() {
    const validationError = validateForm();
    if (validationError || isSubmitting || isDeleting) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await onSubmit({
      date,
      time,
      message: message.trim(),
      repeatsWeekly,
      deliveryMethods: Array.from(new Set(deliveryMethods)),
    });

    if (typeof result === "string" && result.length > 0) {
      setError(result);
    }

    setIsSubmitting(false);
  }

  function confirmDelete() {
    if (!onDelete || isDeleting || isSubmitting) {
      return;
    }

    Alert.alert(
      STRINGS.notifications.deleteConfirmTitle,
      STRINGS.notifications.deleteConfirmBody,
      [
        { text: STRINGS.menu.cancel, style: "cancel" },
        {
          text: STRINGS.notifications.delete,
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            setError(null);
            const result = await onDelete();
            if (typeof result === "string" && result.length > 0) {
              setError(result);
            }
            setIsDeleting(false);
          },
        },
      ],
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + Spacing.two,
              paddingBottom: insets.bottom + Spacing.four,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedView style={styles.inner}>
            <Pressable
              onPress={() => router.back()}
              style={[
                styles.backButton,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText type="small">{STRINGS.notifications.back}</ThemedText>
            </Pressable>

            <ThemedText type="subtitle">{title}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {STRINGS.notifications.formHint}
            </ThemedText>

            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.notifications.messageLabel}
              </ThemedText>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder={STRINGS.notifications.messagePlaceholder}
                placeholderTextColor={theme.textSecondary}
                multiline
                style={[
                  styles.messageInput,
                  {
                    color: theme.text,
                    borderColor: theme.backgroundElement,
                  },
                ]}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.rowField]}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {STRINGS.notifications.dateLabel}
                </ThemedText>
                <Pressable
                  onPress={() => setIsDatePickerVisible(true)}
                  style={[
                    styles.inputButton,
                    { borderColor: theme.backgroundElement },
                  ]}
                >
                  <ThemedText>{date}</ThemedText>
                </Pressable>
              </View>

              <View style={[styles.field, styles.rowField]}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {STRINGS.notifications.timeLabel}
                </ThemedText>
                <TextInput
                  value={time}
                  onChangeText={setTime}
                  placeholder="18:00"
                  keyboardType="numbers-and-punctuation"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.textInput,
                    {
                      color: theme.text,
                      borderColor: theme.backgroundElement,
                    },
                  ]}
                />
              </View>
            </View>

            <ThemedView
              type="backgroundElement"
              style={styles.toggleCard}
            >
              <View style={styles.toggleRow}>
                <View style={styles.toggleLabelWrap}>
                  <ThemedText type="smallBold">
                    {STRINGS.notifications.repeatsWeekly}
                  </ThemedText>
                </View>
                <Switch
                  value={repeatsWeekly}
                  onValueChange={setRepeatsWeekly}
                  trackColor={{
                    false: theme.backgroundSelected,
                    true: theme.accent,
                  }}
                  thumbColor={theme.accentText}
                />
              </View>
            </ThemedView>

            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {STRINGS.notifications.deliveryMethodsLabel}
              </ThemedText>
              <View style={styles.chips}>
                {deliveryMethodOptions.map((option) => {
                  const isSelected = deliveryMethods.includes(option.value);

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => toggleDeliveryMethod(option.value)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected
                            ? theme.accent
                            : theme.backgroundElement,
                        },
                      ]}
                    >
                      <ThemedText
                        type="small"
                        style={{
                          color: isSelected ? theme.accentText : theme.text,
                        }}
                      >
                        {option.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error ? (
              <ThemedText themeColor="textSecondary">{error}</ThemedText>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              style={[styles.primaryButton, { backgroundColor: theme.accent }]}
            >
              <ThemedText style={{ color: theme.accentText }}>
                {isSubmitting ? submitBusyLabel : submitLabel}
              </ThemedText>
            </Pressable>

            {onDelete ? (
              <Pressable
                onPress={confirmDelete}
                style={[
                  styles.secondaryButton,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText>
                  {isDeleting
                    ? deleteBusyLabel ?? STRINGS.notifications.deleting
                    : STRINGS.notifications.delete}
                </ThemedText>
              </Pressable>
            ) : null}
          </ThemedView>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        transparent
        animationType="slide"
        visible={isDatePickerVisible}
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <ThemedView style={styles.modalBackdrop}>
          <ThemedView
            type="background"
            style={[styles.modalSheet, { borderColor: theme.backgroundElement }]}
          >
            <ThemedText type="smallBold" style={styles.modalTitle}>
              {STRINGS.notifications.chooseDate}
            </ThemedText>

            <Calendar
              current={date}
              onDayPress={({ dateString }) => {
                setDate(dateString);
                setIsDatePickerVisible(false);
              }}
              markedDates={{
                [date]: {
                  selected: true,
                  selectedColor: theme.accent,
                },
              }}
              theme={{
                calendarBackground: theme.background,
                dayTextColor: theme.text,
                monthTextColor: theme.text,
                textDisabledColor: theme.textSecondary,
                todayTextColor: theme.accent,
                arrowColor: theme.accent,
              }}
            />

            <Pressable
              onPress={() => setIsDatePickerVisible(false)}
              style={[
                styles.secondaryButton,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText>{STRINGS.menu.cancel}</ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  keyboard: {
    flex: 1,
    width: "100%",
  },
  scroll: {
    alignItems: "center",
    paddingHorizontal: Spacing.three,
  },
  inner: {
    width: "100%",
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  rowField: {
    flex: 1,
  },
  field: {
    gap: Spacing.two,
  },
  messageInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    textAlignVertical: "top",
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  inputButton: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  toggleCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  toggleLabelWrap: {
    flex: 1,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    padding: Spacing.three,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalSheet: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.three,
    borderWidth: 1,
  },
  modalTitle: {
    textAlign: "center",
  },
});
