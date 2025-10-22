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

3.  **`build_android`**:
    *   Runs on Linux.
    *   Sets up a Java/Android environment.
    *   Downloads the `web-assets` artifact and syncs it with Capacitor.
    *   Builds the Android APK.
    *   Uploads the resulting `.apk` file as an artifact.

4.  **`build_ios`**:
    *   Runs on macOS (a requirement for iOS builds).
    *   Downloads the `web-assets` artifact and syncs it with Capacitor.
    *   Installs iOS dependencies (CocoaPods).
    *   Builds the iOS application archive.
    *   Uploads the resulting `.xcarchive` bundle as an artifact.

## Required Setup: Repository Secrets

To build and sign release-ready applications, you need to provide credentials as "secrets" in your GitHub repository. Go to your repository's `Settings > Secrets and variables > Actions` to add them.

*   `API_KEY_PLACEHOLDER`: (**Required for Web Build**) The Gemini API key. This is needed by the bundler to make it available to the application.
*   `APPLE_ID`: (**Optional for macOS/iOS**) Your Apple Developer ID.
*   `APPLE_ID_PASSWORD`: (**Optional for macOS/iOS**) An app-specific password for your Apple ID.
*   `APPLE_TEAM_ID`: (**Optional for macOS/iOS**) Your Apple Developer Team ID.
*   `SIGNING_KEY_ALIAS`, `SIGNING_KEY_PASSWORD`, `SIGNING_KEY_STORE_PASSWORD`: (**Optional for Android**) Your Android app signing key details.
*   `ENCODED_SIGNING_KEY`: (**Optional for Android**) Your signing keystore file, encoded in Base64.

The workflow file has comments indicating where these secrets are used. Without them, the builds will produce unsigned, development-ready artifacts.

## Accessing the Builds

After the workflow runs successfully, you can find all the compiled application installers and packages.

Go to the **"Actions"** tab of your repository, click on the completed workflow run, and you will see the artifacts listed at the bottom of the summary page, ready for download.