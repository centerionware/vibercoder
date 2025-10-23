import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

// Replicate __dirname functionality in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const log = (message) => console.log(`[Permissions] ${message}`);

// --- Android Configuration ---
function configureAndroid() {
    // Part 1: Configure AndroidManifest.xml for permissions
    const manifestPath = path.resolve(__dirname, '..', 'android/app/src/main/AndroidManifest.xml');
    if (!fs.existsSync(manifestPath)) {
        log('AndroidManifest.xml not found, skipping manifest configuration.');
    } else {
        log(`Configuring AndroidManifest.xml at: ${manifestPath}`);
        let manifest = fs.readFileSync(manifestPath, 'utf8');
        let manifestChangesMade = false;

        const permissions = [
            'android.permission.INTERNET',
            'android.permission.CAMERA',
            'android.permission.RECORD_AUDIO',
            'android.permission.MODIFY_AUDIO_SETTINGS' // Useful for audio routing
        ];

        const manifestMarker = '<application';
        for (const permission of permissions) {
            const permissionTag = `<uses-permission android:name="${permission}" />`;
            if (!manifest.includes(permissionTag)) {
                manifest = manifest.replace(
                    manifestMarker,
                    `    ${permissionTag}\n    ${manifestMarker}`
                );
                log(`  + Added permission: ${permission}`);
                manifestChangesMade = true;
            } else {
                log(`  ✓ Permission already exists: ${permission}`);
            }
        }
        
        if (!manifest.includes('android:usesCleartextTraffic="true"')) {
            manifest = manifest.replace(
                '<application',
                '<application android:usesCleartextTraffic="true"'
            );
            log('  + Added usesCleartextTraffic="true" to application tag.');
            manifestChangesMade = true;
        }

        if (manifestChangesMade) {
            fs.writeFileSync(manifestPath, manifest, 'utf8');
            log('AndroidManifest.xml updated successfully.');
        } else {
            log('AndroidManifest.xml already up-to-date.');
        }
    }

    // Part 2: Configure variables.gradle for minSdkVersion
    const variablesGradlePath = path.resolve(__dirname, '..', 'android/variables.gradle');
    if (!fs.existsSync(variablesGradlePath)) {
        log('variables.gradle not found, skipping minSdkVersion configuration. This may be an error if an Android project exists.');
    } else {
        log(`Configuring variables.gradle at: ${variablesGradlePath}`);
        let gradleFile = fs.readFileSync(variablesGradlePath, 'utf8');
        let gradleChangesMade = false;
        const newMinSdkVersion = 26;
        const minSdkVersionRegex = /(minSdkVersion\s*=\s*)(\d+)/;
        
        if (minSdkVersionRegex.test(gradleFile)) {
            const currentVersion = parseInt(gradleFile.match(minSdkVersionRegex)[2], 10);
            if (currentVersion !== newMinSdkVersion) {
                gradleFile = gradleFile.replace(minSdkVersionRegex, `$1${newMinSdkVersion}`);
                log(`  + Updated minSdkVersion from ${currentVersion} to ${newMinSdkVersion} in variables.gradle.`);
                gradleChangesMade = true;
            } else {
                log(`  ✓ minSdkVersion is already ${newMinSdkVersion} in variables.gradle.`);
            }
        } else {
            const extBlockRegex = /(ext\s*{)([\s\S]*?)(})/;
            if (extBlockRegex.test(gradleFile)) {
                gradleFile = gradleFile.replace(extBlockRegex, `$1$2\n    minSdkVersion = ${newMinSdkVersion}\n$3`);
                log(`  + Added minSdkVersion = ${newMinSdkVersion} to ext block in variables.gradle.`);
                gradleChangesMade = true;
            } else {
                 log('  ! Could not find ext { ... } block in variables.gradle to add minSdkVersion. Creating it.');
                 gradleFile += `\next {\n    minSdkVersion = ${newMinSdkVersion}\n}\n`;
                 gradleChangesMade = true;
            }
        }

        if (gradleChangesMade) {
            fs.writeFileSync(variablesGradlePath, gradleFile, 'utf8');
            log('variables.gradle updated successfully.');
        }
    }

    // Part 3: Configure android/app/build.gradle for release signing
    const buildGradlePath = path.resolve(__dirname, '..', 'android/app/build.gradle');
    if (!fs.existsSync(buildGradlePath)) {
        log('android/app/build.gradle not found, skipping signing configuration.');
    } else {
        log(`Configuring android/app/build.gradle for signing at: ${buildGradlePath}`);
        let gradleContent = fs.readFileSync(buildGradlePath, 'utf8');
        let gradleChangesMade = false;

        const signingConfigBlock = `
    signingConfigs {
        release {
            if (project.hasProperty('keystore.properties')) {
                def propsFile = rootProject.file('keystore.properties')
                if (propsFile.exists()) {
                    def props = new Properties()
                    props.load(new FileInputStream(propsFile))
                    storeFile file(props['storeFile'])
                    storePassword props['storePassword']
                    keyAlias props['keyAlias']
                    keyPassword props['keyPassword']
                }
            }
        }
    }
`;

        // Check if signingConfigs block is already present
        if (!gradleContent.includes('signingConfigs {')) {
            // Inject signingConfigs block inside the android { ... } block, before buildTypes
            if (gradleContent.includes('buildTypes {')) {
                gradleContent = gradleContent.replace(
                    /(\s*buildTypes\s*{)/,
                    `${signingConfigBlock}\n$1`
                );
                log('  + Added signingConfigs block.');
                gradleChangesMade = true;
            } else {
                // Fallback if buildTypes isn't there
                gradleContent = gradleContent.replace(
                    /(android\s*{)/,
                    `$1\n${signingConfigBlock}`
                );
                log('  + Added signingConfigs block (buildTypes not found, using fallback).');
                gradleChangesMade = true;
            }
        } else {
            log('  ✓ signingConfigs block already exists.');
        }

        // Check if the release build type is already configured for signing
        if (!gradleContent.includes('signingConfig signingConfigs.release')) {
            // Add signingConfig to the release build type
            if (gradleContent.match(/buildTypes\s*{\s*release\s*{/)) {
                gradleContent = gradleContent.replace(
                    /(buildTypes\s*{\s*release\s*{)/,
                    `$1\n            signingConfig signingConfigs.release`
                );
                log('  + Applied signingConfig to release build type.');
                gradleChangesMade = true;
            } else {
                 log('  ! Could not find `buildTypes { release {` block to apply signing config.');
            }
        } else {
            log('  ✓ release build type already configured for signing.');
        }

        if (gradleChangesMade) {
            fs.writeFileSync(buildGradlePath, gradleContent, 'utf8');
            log('android/app/build.gradle updated for signing successfully.');
        } else {
            log('android/app/build.gradle signing configuration already up-to-date.');
        }
    }
}

// --- iOS Configuration ---
function configureIOS() {
    const plistPath = path.resolve(__dirname, '..', 'ios/App/App/Info.plist');
    if (!fs.existsSync(plistPath)) {
        log('Info.plist not found, skipping iOS configuration.');
        return;
    }
    log(`Configuring Info.plist at: ${plistPath}`);

    let plist = fs.readFileSync(plistPath, 'utf8');
    
    const usageDescriptions = {
        'NSCameraUsageDescription': 'This app uses the camera to enable AI visual interaction and analysis.',
        'NSMicrophoneUsageDescription': 'This app uses the microphone to enable voice chat and wake word detection.'
    };
    
    let changesMade = false;
    // Add new keys just before the final </dict> tag
    const dictMarker = '</dict>';
    for (const [key, description] of Object.entries(usageDescriptions)) {
        if (!plist.includes(`<key>${key}</key>`)) {
            plist = plist.replace(
                dictMarker,
                `    <key>${key}</key>\n    <string>${description}</string>\n` + dictMarker
            );
            log(`  + Added usage description: ${key}`);
            changesMade = true;
        } else {
            log(`  ✓ Usage description already exists: ${key}`);
        }
    }
    
    if (changesMade) {
        fs.writeFileSync(plistPath, plist, 'utf8');
        log('Info.plist updated successfully.');
    } else {
        log('Info.plist already up-to-date.');
    }
}


// --- Main Execution ---
log('Starting native permissions configuration script...');
try {
    configureAndroid();
    configureIOS();
    log('Script finished successfully.');
} catch (error) {
    log(`An error occurred: ${error.message}`);
    process.exit(1);
}
