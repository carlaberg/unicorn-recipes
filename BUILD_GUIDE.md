# Build & Testing Guide

This guide explains how to register test devices and create standalone builds for testing on real iOS devices.

## Table of Contents

1. [Registering Test Devices](#registering-test-devices)
2. [Creating an EAS Build](#creating-an-eas-build)
3. [Installing on Your Device](#installing-on-your-device)
4. [Troubleshooting](#troubleshooting)

---

## Registering Test Devices

Before you can install the app on a real iOS device, you need to register that device with Apple. This requires:

- The device's UDID (Unique Device Identifier)
- Apple Developer account access

### Step 1: Get Your Device's UDID

#### Using Xcode:

1. Open Xcode
2. Go to **Window** → **Devices and Simulators**
3. Connect your iOS device via USB
4. Select your device from the left sidebar
5. Copy the **Identifier** (this is your UDID)

#### Using iTunes/Finder:

1. Connect your iOS device
2. Open Finder (macOS Catalina+) or iTunes (older versions)
3. Select your device
4. Click the serial number to cycle through displays—one will show the UDID
5. Copy it

#### Using Command Line:

```bash
# Connect device, then run:
instruments -s devices
```

Look for your device in the output and copy the UDID in brackets.

### Step 2: Register Device with Apple Developer

1. Visit [Apple Developer](https://developer.apple.com/account)
2. Log in with your Apple account
3. Go to **Certificates, Identifiers & Profiles** → **Devices**
4. Click the **+** button to add a new device
5. Select **Register a single device**
6. Enter:
   - **Device Name**: A memorable name (e.g., "Carla's iPhone")
   - **Device ID (UDID)**: Paste the UDID from Step 1
7. Click **Continue** → **Register** → **Done**

### Step 3: Update Provisioning Profiles

After registering a new device, you need to regenerate provisioning profiles:

1. In Apple Developer portal, go to **Certificates, Identifiers & Profiles** → **Profiles**
2. Select the profile for this app (if it exists)
3. Click **Edit** and make sure your new device is included
4. Click **Save** and download the updated profile
5. Or let EAS handle this automatically (see next section)

---

## Creating an EAS Build

EAS (Expo Application Services) handles building your app in the cloud with proper signing.

### Prerequisites

- [Expo CLI](https://docs.expo.dev/get-started/installation/) installed (`npm install -g eas-cli`)
- [Logged in to Expo](https://docs.expo.dev/build/setup/) (`eas login`)
- [Logged in to Apple Developer account](https://docs.expo.dev/build/how-eas-build-works/#ios-credentials)

### Step 1: Ensure Your Devices Are Registered

Make sure all test devices are registered in your Apple Developer account (see previous section).

### Step 2: Create the Build

Run the following command to create a preview build for device testing:

```bash
eas build --platform ios --profile preview
```

#### What happens:

- EAS will check your `eas.json` configuration
- You'll be prompted for Apple credentials (one-time setup)
- EAS will generate or use existing signing certificates
- The build will compile in the cloud
- A progress URL will be displayed in the terminal

### Step 3: Monitor the Build

The build typically takes 10–15 minutes. You can:

- **Watch in terminal**: Follow the link provided in the console output
- **Check EAS Dashboard**: Visit [dash.expo.dev](https://dash.expo.dev) and select your project
- **View logs**: Click on the build to see full compilation logs

### Step 4: Download the Build

Once complete, EAS will provide a download link (.ipa file) and options to:

- **Copy link**: Share with testers
- **Send to device**: Use Xcode or Apple Configurator
- **Email**: Get a link sent via email

---

## Installing on Your Device

### Option A: Using Xcode (Recommended)

1. Download the `.ipa` file from EAS or copy the link
2. Open Xcode: `open -a Xcode`
3. Go to **Window** → **Devices and Simulators**
4. Select your device
5. Drag the `.ipa` file onto the window or use **+** → select the `.ipa` file
6. Wait for installation to complete

### Option B: Using Apple Configurator

1. Download Apple Configurator 2 from the Mac App Store
2. Connect your iOS device
3. In Configurator, click your device
4. Click **Add** → select the `.ipa` file
5. Follow the prompts to install

### Option C: Using Command Line

```bash
# Install using xcodebuild
xcode-select --install  # if needed

# Copy the .ipa and run:
xcrun simctl install booted path/to/app.ipa
```

---

## Troubleshooting

### Build Failed: "No provisioning profile"

- Ensure all test devices are registered in Apple Developer
- Run build again and let EAS regenerate profiles

### Device Not Recognized in Xcode

- Reconnect the device
- Trust the computer when prompted on device
- Restart Xcode if needed

### Build Status Stuck

- Check the build logs on [dash.expo.dev](https://dash.expo.dev)
- Common issues:
  - Out of storage on build server (unlikely, contact support)
  - Invalid credentials (re-run `eas login`)
  - Network timeout (try again)

### App Crashes on Launch

- Check device logs in Xcode: **Window** → **Devices and Simulators** → **Console**
- Verify environment variables are set correctly in `eas.json` or `.env`
- Check that API endpoints are accessible from your network

### Image Proxy Issues

- Ensure `EXPO_PUBLIC_USE_IMAGE_PROXY=true` in your build environment
- Verify `EXPO_PUBLIC_IMAGE_PROXY_BASE_URL` points to the correct Railway URL
- Check network logs to confirm proxy requests are going through

---

## Quick Reference

### Build a Preview (Device Testing)

```bash
eas build --platform ios --profile preview
```

### Build for Production

```bash
eas build --platform ios --profile production
```

### View Build Status

```bash
eas build:list
```

### View EAS Credentials

```bash
eas credentials
```

### Clear Build Cache (if needed)

```bash
eas build:cancel [BUILD_ID]
```

---

## Related Files

- `eas.json` — EAS Build configuration
- `app.json` — Expo app configuration
- `.env` — Environment variables for local development
- [EAS Build Docs](https://docs.expo.dev/build/setup/)
- [Apple Developer Certificates & Identifiers](https://developer.apple.com/account/resources/certificates/list)
