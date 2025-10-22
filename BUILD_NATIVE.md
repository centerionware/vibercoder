# AIDE Native & Desktop Build Guide

**⚡ Automated Builds are Active! ⚡**

This project's build process is fully automated by a CI/CD pipeline using GitHub Actions. This is the primary and recommended method for creating builds.

➡️ **Please see the [CI/CD Guide](./CICD_GUIDE.md) for a detailed explanation of the automated workflow and how to access the final build artifacts.**

The manual instructions below are provided as a secondary option for local development, testing, and debugging when you need to build directly on your own machine.

---

## Part 1: Android (APK)

This guide walks you through compiling the AIDE web app into a native Android APK using Capacitor.

### Prerequisites

1.  **Node.js and npm:** Required for managing project dependencies.
2.  **Android Studio:** The official IDE for Android development.
3.  **Java Development Kit (JDK):** Version 17 or higher.

### Step-by-Step Instructions

1.  **Install Dependencies:**
    Open your terminal in the project root and run:
    ```bash
    npm install
    ```

2.  **Build the Web App:**
    Create a production build of the React application. This command compiles the web assets into a `/www` directory, which Capacitor will use.
    ```bash
    npm run build:web
    ```

3.  **Add and Sync the Android Platform:**
    This command initializes the native Android project in the `/android` directory and copies the web assets into it.
    ```bash
    npm run sync:native
    ```
    *(Note: This single script handles `npx capacitor add android` and `npx capacitor sync` for convenience.)*

4.  **Open in Android Studio:**
    Open the native project in Android Studio.
    ```bash
    npm run open:android
    ```

5.  **Build the APK:**
    *   Once Android Studio opens and finishes indexing the project, go to the menu `Build > Build Bundle(s) / APK(s) > Build APK(s)`.
    *   Android Studio will compile the native code and package it with the web assets.
    *   When it's finished, a notification will appear. Click "locate" to find the generated `app-debug.apk` file in `android/app/build/outputs/apk/debug/`.

---

## Part 2: iOS (IPA)

This guide explains how to compile the AIDE web app into a native iOS application for emulators or physical devices.

### Prerequisites

1.  **A macOS computer:** iOS development can only be done on macOS.
2.  **Node.js and npm:** Required for managing project dependencies.
3.  **Xcode:** The official IDE for iOS development (available from the Mac App Store).
4.  **CocoaPods:** A dependency manager for Swift and Objective-C projects.
    ```bash
    sudo gem install cocoapods
    ```

### Step-by-Step Instructions

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Build the Web App:**
    ```bash
    npm run build:web
    ```

3.  **Add and Sync the iOS Platform:**
    This initializes the native Xcode project in the `/ios` directory and copies the web assets.
    ```bash
    npm run sync:native
    ```
    *(Note: This also handles `npx capacitor add ios` and `npx capacitor sync`.)*

4.  **Install iOS Dependencies:**
    Capacitor requires native dependencies managed by CocoaPods.
    ```bash
    cd ios/App && pod install && cd ../..
    ```

5.  **Open in Xcode:**
    Open the native project's workspace file in Xcode.
    ```bash
    npm run open:ios
    ```

6.  **Configure Signing & Build:**
    *   In Xcode, select the `App` project in the left-hand navigator.
    *   Go to the `Signing & Capabilities` tab.
    *   Select your Apple Developer account from the "Team" dropdown. Xcode may prompt you to register your device.
    *   Choose a target device or simulator from the top of the Xcode window.
    *   Click the "Run" button (the play icon) to build and run the app on your selected device/simulator.
    *   To create a shareable `.ipa` file, go to the menu `Product > Archive`.

---

## Part 3: Desktop (Windows, Linux, macOS)

This section explains how to build desktop executables using Electron.

### Prerequisites

*   **Node.js and npm:** Already installed.
*   **Platform-specific build tools:** `electron-builder` may require additional tools depending on your OS (e.g., `wine` and `mono` on Linux to build for Windows).

### Step-by-Step Instructions

1.  **Install Dependencies:**
    If you haven't already:
    ```bash
    npm install
    ```

2.  **Build the Web App:**
    Electron will load the compiled web assets.
    ```bash
    npm run build:web
    ```

3.  **Run in Development Mode (Optional):**
    To test the Electron app locally without building an installer:
    ```bash
    npm run start:electron
    ```

4.  **Build the Executable:**
    Run the command corresponding to your target platform. You can build for other platforms from one OS (cross-compilation), but it's most reliable to build on the target OS itself.
    
    *   **To build for your current OS:**
        ```bash
        npm run build:desktop
        ```

    *   **To build for a specific OS:**
        ```bash
        # For Windows (.exe)
        npm run build:win

        # For Linux (.AppImage)
        npm run build:linux
        
        # For macOS (.dmg)
        npm run build:macos
        ```

5.  **Find the Installer:**
    The compiled installers will be located in the `/dist` directory.

---

## Part 4: Docker Container

This section explains how to build a Docker image that serves the AIDE web application.

### Prerequisites

*   **Docker:** You must have Docker installed and running on your system.

### Step-by-Step Instructions

1.  **Build the Docker Image:**
    This command uses the `Dockerfile` in the project root. It's a multi-stage build that first compiles the web assets and then copies them into a lightweight `nginx` server image.
    ```bash
    npm run build:docker
    ```
    This command will tag the image as `aide:latest`.

2.  **Run the Container:**
    Once the build is complete, run the container:
    ```bash
    docker run -d -p 8080:80 aide:latest
    ```

3.  **Access AIDE:**
    Open your web browser and navigate to `http://localhost:8080`. You should see the AIDE application running, served by the Nginx container.