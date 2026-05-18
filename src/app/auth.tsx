import { useAuth, useSignIn, useSignUp } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { STRINGS } from "@/constants/strings";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export default function AuthScreen() {
  const theme = useTheme();
  const { isLoaded, isSignedIn } = useAuth();
  const {
    signIn,
    setActive: setSignInActive,
    isLoaded: isSignInLoaded,
  } = useSignIn();
  const {
    signUp,
    setActive: setSignUpActive,
    isLoaded: isSignUpLoaded,
  } = useSignUp();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isPendingVerification, setIsPendingVerification] = useState(false);
  const [isPendingSecondFactor, setIsPendingSecondFactor] = useState(false);
  const [secondFactorCode, setSecondFactorCode] = useState("");
  const [secondFactorStrategy, setSecondFactorStrategy] = useState<
    string | null
  >(null);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert(
        STRINGS.auth.missingFieldsTitle,
        STRINGS.auth.missingEmailPassword,
      );
      return;
    }

    if (isSignUpMode && !username.trim()) {
      Alert.alert(
        STRINGS.auth.missingFieldsTitle,
        STRINGS.auth.missingUsername,
      );
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignUpMode) {
        if (!isSignUpLoaded || !signUp) {
          throw new Error(STRINGS.auth.signUpNotReady);
        }

        const result = await signUp.create({
          emailAddress: email.trim(),
          username: username.trim(),
          password,
        });

        if (result.status !== "complete" || !result.createdSessionId) {
          await signUp.prepareEmailAddressVerification({
            strategy: "email_code",
          });
          setIsPendingVerification(true);
          Alert.alert(
            STRINGS.auth.verifyEmailTitle,
            STRINGS.auth.verifyEmailBody,
          );
          return;
        }

        await setSignUpActive?.({ session: result.createdSessionId });
      } else {
        if (!isSignInLoaded || !signIn) {
          throw new Error(STRINGS.auth.signInNotReady);
        }

        const result = await signIn.create({
          identifier: email.trim(),
          password,
        });

        if (result.status === "needs_second_factor") {
          const firstStrategy = result.supportedSecondFactors?.[0]?.strategy;
          if (firstStrategy) {
            if (firstStrategy === "email_code") {
              await signIn.prepareSecondFactor({ strategy: "email_code" });
            }
            setSecondFactorStrategy(firstStrategy);
            setIsPendingSecondFactor(true);
            Alert.alert(
              STRINGS.auth.twoFactorTitle,
              STRINGS.auth.twoFactorBody.replace("{strategy}", firstStrategy),
            );
            return;
          } else {
            throw new Error(STRINGS.auth.noSecondFactor);
          }
        }

        if (result.status !== "complete" || !result.createdSessionId) {
          const statusText = String(result.status ?? "okänd");
          throw new Error(
            STRINGS.auth.signInIncomplete.replace("{status}", statusText),
          );
        }

        await setSignInActive?.({ session: result.createdSessionId });
      }

      setPassword("");
    } catch (error) {
      let message: string = STRINGS.auth.authFailed;
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === "object" && error !== null) {
        message = (error as any).message || JSON.stringify(error);
      }
      Alert.alert(STRINGS.auth.authFailed, message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyEmailCode() {
    if (!verificationCode.trim()) {
      Alert.alert(STRINGS.auth.missingCodeTitle, STRINGS.auth.missingEmailCode);
      return;
    }

    if (!isSignUpLoaded || !signUp) {
      Alert.alert(STRINGS.auth.missingFieldsTitle, STRINGS.auth.signUpNotReady);
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode.trim(),
      });

      if (result.status !== "complete" || !result.createdSessionId) {
        throw new Error(STRINGS.auth.emailVerificationIncomplete);
      }

      await setSignUpActive?.({ session: result.createdSessionId });
      setVerificationCode("");
      setPassword("");
      setIsPendingVerification(false);
    } catch (error) {
      let message: string = STRINGS.auth.verifyFailed;
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === "object" && error !== null) {
        message = (error as any).message || JSON.stringify(error);
      }
      Alert.alert(STRINGS.auth.verifyFailed, message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifySecondFactor() {
    if (!secondFactorCode.trim()) {
      Alert.alert(
        STRINGS.auth.missingCodeTitle,
        STRINGS.auth.missingSecondFactorCode,
      );
      return;
    }

    if (!isSignInLoaded || !signIn) {
      Alert.alert(STRINGS.auth.missingFieldsTitle, STRINGS.auth.signInNotReady);
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: secondFactorStrategy as any,
        code: secondFactorCode.trim(),
      });

      if (result.status !== "complete" || !result.createdSessionId) {
        throw new Error(STRINGS.auth.secondFactorIncomplete);
      }

      await setSignInActive?.({ session: result.createdSessionId });
      setSecondFactorCode("");
      setSecondFactorStrategy(null);
      setIsPendingSecondFactor(false);
    } catch (error) {
      let message: string = STRINGS.auth.verifyFailed;
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === "object" && error !== null) {
        message = (error as any).message || JSON.stringify(error);
      }
      Alert.alert(STRINGS.auth.verifyFailed, message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isLoaded) {
    return null;
  }

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.heading}>
          {isSignUpMode ? STRINGS.auth.signUpTitle : STRINGS.auth.signInTitle}
        </ThemedText>

        <TextInput
          style={[
            styles.input,
            {
              borderColor: theme.backgroundSelected,
              color: theme.text,
              backgroundColor: theme.backgroundElement,
            },
          ]}
          placeholder={STRINGS.auth.emailPlaceholder}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        {isSignUpMode && !isPendingVerification && (
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.backgroundSelected,
                color: theme.text,
                backgroundColor: theme.backgroundElement,
              },
            ]}
            placeholder={STRINGS.auth.usernamePlaceholder}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
        )}

        {!isPendingVerification && !isPendingSecondFactor ? (
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.backgroundSelected,
                color: theme.text,
                backgroundColor: theme.backgroundElement,
              },
            ]}
            placeholder={STRINGS.auth.passwordPlaceholder}
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        ) : isPendingVerification ? (
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.backgroundSelected,
                color: theme.text,
                backgroundColor: theme.backgroundElement,
              },
            ]}
            placeholder={STRINGS.auth.verificationCodePlaceholder}
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            value={verificationCode}
            onChangeText={setVerificationCode}
          />
        ) : (
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.backgroundSelected,
                color: theme.text,
                backgroundColor: theme.backgroundElement,
              },
            ]}
            placeholder={STRINGS.auth.secondFactorCodePlaceholder.replace(
              "{strategy}",
              secondFactorStrategy ?? "",
            )}
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            value={secondFactorCode}
            onChangeText={setSecondFactorCode}
          />
        )}

        <Pressable
          style={[styles.button, { backgroundColor: theme.backgroundElement }]}
          onPress={
            isPendingSecondFactor
              ? handleVerifySecondFactor
              : isPendingVerification
                ? handleVerifyEmailCode
                : handleSubmit
          }
        >
          <ThemedText type="small">
            {isSubmitting
              ? STRINGS.auth.pleaseWait
              : isPendingSecondFactor
                ? STRINGS.auth.verify2FA
                : isPendingVerification
                  ? STRINGS.auth.verifyEmail
                  : isSignUpMode
                    ? STRINGS.auth.createAccount
                    : STRINGS.auth.logIn}
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => {
            setIsSignUpMode((value) => !value);
            setIsPendingVerification(false);
            setVerificationCode("");
            setUsername("");
            setIsPendingSecondFactor(false);
            setSecondFactorCode("");
            setSecondFactorStrategy(null);
          }}
        >
          <ThemedText type="small" themeColor="textSecondary">
            {isSignUpMode ? STRINGS.auth.hasAccount : STRINGS.auth.noAccount}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heading: {
    marginBottom: Spacing.two,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  button: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
  },
});
