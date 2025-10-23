# AIDE CI/CD Guide with GitHub Actions

This guide explains the automated build process for AIDE, which is now **active** and uses GitHub Actions to compile the application for all target platforms automatically.

## Active Workflow

The CI/CD pipeline is defined in `.github/workflows/build-pipeline.yml` and is now running in your repository. It will automatically trigger on every `push` and `pull_request` to the `main` branch.

## How It Works

The workflow is divided into several parallel `jobs` to be efficient:

1.  **`build_web_and_docker`**:
    *   Builds the static web application (`/www` directory).
    *   Uploads these web assets as an `artifact` named `web-assets` so other jobs can use them.
    *   Builds a Docker image and pushes it to the GitHub Container Registry (ghcr.io).

2.  **`build_desktop`**:
    *   Runs on Windows, macOS, and Linux simultaneously.
    *   Downloads the `web-assets` artifact.
    *   Runs the appropriate Electron build command (`build:win`, `build:macos`, `build:linux`).
    *   Uploads the resulting executables (`.exe`, `.dmg`, `.AppImage`) as artifacts.

3.  **`build_android_appbundle`**:
    *   Runs on Linux.
    *   Sets up a Java/Android environment.
    *   Downloads the `web-assets` artifact and syncs it with Capacitor.
    *   **Builds a signed Android App Bundle (.aab) if signing secrets are provided.** This is the required format for the Google Play Store.
    *   Builds a debug Android Package (.apk) as a fallback if secrets are not available.
    *   Uploads the resulting artifact to a `dev-builds/` branch.

4.  **`build_ios`**:
    *   Runs on macOS (a requirement for iOS builds).
    *   Downloads the `web-assets` artifact and syncs it with Capacitor.
    *   Installs iOS dependencies (CocoaPods).
    *   Builds the iOS application archive.
    *   Uploads the resulting `.xcarchive` bundle as an artifact.

## Required Setup: Repository Secrets

To build and sign release-ready applications, you need to provide credentials as "secrets" in your GitHub repository. Go to your repository's `Settings > Secrets and variables > Actions` to add them. The workflow will automatically use them if they are present.

*   `API_KEY_PLACEHOLDER`: (**Required for Web Build**) The Gemini API key. This is needed by the bundler to make it available to the application.

### Android Release Build (.aab)
To enable signed AAB builds, you must provide all four of the following secrets. This requires you to first generate a private upload key locally (a one-time setup).

1.  **Generate an upload key:**
    ```bash
    keytool -genkeypair -v -keystore my-upload-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
    ```
2.  **Encode the keystore file for the secret:**
    ```bash
    base64 -i my-upload-key.keystore
    ```
3.  **Add the following secrets to GitHub:**
    *   `ENCODED_SIGNING_KEY`: (**Required for AAB**) The Base64 output from the command above. Copy the entire string.
    *   `SIGNING_KEY_STORE_PASSWORD`: (**Required for AAB**) The keystore password you created in step 1.
    *   `SIGNING_KEY_ALIAS`: (**Required for AAB**) The alias you used (e.g., `my-key-alias`).
    *   `SIGNING_KEY_PASSWORD`: (**Required for AAB**) The key password you created in step 1.

_Note: This process assumes your `android/app/build.gradle` file is configured to read a `keystore.properties` file for release signing, which is standard for CI builds._

### macOS & iOS Release Builds
*   `APPLE_ID`: (**Optional for macOS/iOS**) Your Apple Developer ID.
*   `APPLE_ID_PASSWORD`: (**Optional for macOS/iOS**) An app-specific password for your Apple ID.
*   `APPLE_TEAM_ID`: (**Optional for macOS/iOS**) Your Apple Developer Team ID.

## Accessing the Builds

After the workflow runs successfully, you can find all the compiled application installers and packages.

Go to the **"Actions"** tab of your repository, click on the completed workflow run, and you will see the artifacts listed at the bottom of the summary page, ready for download.