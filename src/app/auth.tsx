import { useAuth, useSignIn, useSignUp } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
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
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing fields", "Please provide email and password.");
      return;
    }

    if (isSignUpMode && !username.trim()) {
      Alert.alert("Missing fields", "Please provide a username.");
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignUpMode) {
        if (!isSignUpLoaded || !signUp) {
          throw new Error("Sign up is not ready yet.");
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
            "Verify your email",
            "We sent a verification code to your email address.",
          );
          return;
        }

        await setSignUpActive?.({ session: result.createdSessionId });
      } else {
        if (!isSignInLoaded || !signIn) {
          throw new Error("Sign in is not ready yet.");
        }

        const result = await signIn.create({
          identifier: email.trim(),
          password,
        });

        if (result.status !== "complete" || !result.createdSessionId) {
          throw new Error("Sign-in could not be completed.");
        }

        await setSignInActive?.({ session: result.createdSessionId });
      }

      setPassword("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authentication failed";
      Alert.alert("Authentication failed", message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyEmailCode() {
    if (!verificationCode.trim()) {
      Alert.alert("Missing code", "Please enter the verification code.");
      return;
    }

    if (!isSignUpLoaded || !signUp) {
      Alert.alert("Not ready", "Sign up is not ready yet.");
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
        throw new Error("Email verification was not completed.");
      }

      await setSignUpActive?.({ session: result.createdSessionId });
      setVerificationCode("");
      setPassword("");
      setIsPendingVerification(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Verification failed";
      Alert.alert("Verification failed", message);
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
          {isSignUpMode ? "Create your account" : "Sign in"}
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
          placeholder="Email"
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
            placeholder="Username"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
        )}

        {!isPendingVerification ? (
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.backgroundSelected,
                color: theme.text,
                backgroundColor: theme.backgroundElement,
              },
            ]}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
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
            placeholder="Verification code"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            value={verificationCode}
            onChangeText={setVerificationCode}
          />
        )}

        <Pressable
          style={[styles.button, { backgroundColor: theme.backgroundElement }]}
          onPress={isPendingVerification ? handleVerifyEmailCode : handleSubmit}
        >
          <ThemedText type="small">
            {isSubmitting
              ? "Please wait..."
              : isPendingVerification
                ? "Verify Email"
                : isSignUpMode
                  ? "Create Account"
                  : "Log In"}
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => {
            setIsSignUpMode((value) => !value);
            setIsPendingVerification(false);
            setVerificationCode("");
            setUsername("");
          }}
        >
          <ThemedText type="small" themeColor="textSecondary">
            {isSignUpMode
              ? "Already have an account? Log In"
              : "Don't have an account? Create one"}
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
