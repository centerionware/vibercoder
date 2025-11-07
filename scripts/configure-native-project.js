

import fs from 'fs';
import path from 'path';

const log = (message) => console.log(`[Native Config] ${message}`);
const projectRoot = process.cwd();

function configureAndroid() {
    // --- PART 1: AndroidManifest.xml ---
    const manifestPath = path.resolve(projectRoot, 'android/app/src/main/AndroidManifest.xml');
    if (fs.existsSync(manifestPath)) {
        log(`Configuring AndroidManifest.xml at: ${manifestPath}`);
        let manifest = fs.readFileSync(manifestPath, 'utf8');
        let manifestChangesMade = false;

        const permissions = [
            'android.permission.INTERNET',
            'android.permission.CAMERA',
            'android.permission.RECORD_AUDIO',
            'android.permission.MODIFY_AUDIO_SETTINGS'
        ];
        const manifestMarker = '<application';
        for (const permission of permissions) {
            const permissionTag = `<uses-permission android:name="${permission}" />`;
            if (!manifest.includes(permissionTag)) {
                manifest = manifest.replace(manifestMarker, `${permissionTag}\n    ${manifestMarker}`);
                manifestChangesMade = true;
                log(`  + Added permission: ${permission}`);
            }
        }

        const activityTag = `<activity android:name=".BrowserActivity" android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode" android:launchMode="singleTop" />`;
        if (!manifest.includes('android:name=".BrowserActivity"')) {
            const applicationEndMarker = '</application>';
            if (manifest.includes(applicationEndMarker)) {
                manifest = manifest.replace(applicationEndMarker, `        ${activityTag}\n    ${applicationEndMarker}`);
                manifestChangesMade = true;
                log(`  + Added BrowserActivity declaration.`);
            }
        }

        if (manifestChangesMade) {
            fs.writeFileSync(manifestPath, manifest, 'utf8');
            log('AndroidManifest.xml updated successfully.');
        } else {
            log('No changes needed for AndroidManifest.xml.');
        }
    } else {
        log('AndroidManifest.xml not found, skipping manifest configuration.');
    }

    // --- PART 2: build.gradle ---
    const buildGradlePath = path.resolve(projectRoot, 'android/app/build.gradle');
    if (fs.existsSync(buildGradlePath)) {
        log(`Configuring build.gradle at: ${buildGradlePath}`);
        let buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
        let gradleChangesMade = false;

        // Configure Java Version
        if (!buildGradle.includes('JavaVersion.VERSION_17')) {
            const compileOptionsRegex = /compileOptions\s*{[^}]*}/;
            const newCompileOptions = `compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }`;
            if (compileOptionsRegex.test(buildGradle)) {
                buildGradle = buildGradle.replace(compileOptionsRegex, newCompileOptions);
            } else {
                buildGradle = buildGradle.replace(/android\s*{/, `android {\n    ${newCompileOptions}`);
            }
            gradleChangesMade = true;
            log('  + Set Java compatibility to version 17.');
        }

        if (buildGradle.includes("jvmTarget = '1.8'")) {
             buildGradle = buildGradle.replace("jvmTarget = '1.8'", "jvmTarget = '17'");
             log("  + Set kotlinOptions.jvmTarget to '17'.");
             gradleChangesMade = true;
        }

        // Configure Signing for Release Builds
        const signingConfigBlock = `
// Dynamically added by configure-native-project.js for CI/CD signing
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android.signingConfigs {
    release {
        if (keystorePropertiesFile.exists()) {
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
}`;

        const signingConfigAssignment = `android.buildTypes.release.signingConfig = android.signingConfigs.release`;

        // Use a simple append strategy, which is safer than regex replacement
        if (!buildGradle.includes('android.signingConfigs')) {
            buildGradle += `\n\n${signingConfigBlock}`;
            gradleChangesMade = true;
            log('  + Injected signingConfigs block.');
        }
        if (!buildGradle.includes('android.buildTypes.release.signingConfig')) {
            buildGradle += `\n${signingConfigAssignment}`;
            gradleChangesMade = true;
            log('  + Applied release signingConfig to release build type.');
        }

        if (gradleChangesMade) {
            fs.writeFileSync(buildGradlePath, buildGradle, 'utf8');
            log('build.gradle updated successfully.');
        } else {
            log('No changes needed for build.gradle.');
        }
    } else {
        log('android/app/build.gradle not found, skipping gradle configuration.');
    }
}

function configureIos() {
    const infoPlistPath = path.resolve(projectRoot, 'ios/App/App/Info.plist');
    if (!fs.existsSync(infoPlistPath)) {
        log('Info.plist not found, skipping iOS configuration.');
        return;
    }
    log(`Configuring Info.plist at: ${infoPlistPath}`);
    let infoPlist = fs.readFileSync(infoPlistPath, 'utf8');
    let plistChangesMade = false;

    const permissions = {
        NSCameraUsageDescription: 'To capture photos and videos for analysis by the AI.',
        NSMicrophoneUsageDescription: 'To enable voice chat with the AI assistant.',
    };

    const dictMarker = '</dict>';
    for (const [key, description] of Object.entries(permissions)) {
        if (!infoPlist.includes(`<key>${key}</key>`)) {
            const permissionEntry = `
    <key>${key}</key>
    <string>${description}</string>`;
            infoPlist = infoPlist.replace(dictMarker, `${permissionEntry}\n${dictMarker}`);
            plistChangesMade = true;
            log(`  + Added permission: ${key}`);
        } else {
            log(`  ✓ Permission already exists: ${key}`);
        }
    }

    if (plistChangesMade) {
        fs.writeFileSync(infoPlistPath, infoPlist, 'utf8');
        log('Info.plist updated successfully.');
    } else {
        log('No changes needed for Info.plist.');
    }
}

log('Starting native project configuration (manifests, gradle)...');
configureAndroid();
configureIos();
log('Native project configuration finished.');