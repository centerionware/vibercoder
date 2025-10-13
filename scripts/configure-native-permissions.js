import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

// Replicate __dirname functionality in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const log = (message) => console.log(`[Permissions] ${message}`);

// --- Android Configuration ---
function configureAndroid() {
    const manifestPath = path.resolve(__dirname, '..', 'android/app/src/main/AndroidManifest.xml');
    if (!fs.existsSync(manifestPath)) {
        log('AndroidManifest.xml not found, skipping Android configuration.');
        return;
    }
    log(`Configuring AndroidManifest.xml at: ${manifestPath}`);

    let manifest = fs.readFileSync(manifestPath, 'utf8');

    const permissions = [
        'android.permission.INTERNET',
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS' // Useful for audio routing
    ];

    let changesMade = false;
    // Add permissions just before the <application> tag for convention
    const manifestMarker = '<application';
    for (const permission of permissions) {
        const permissionTag = `<uses-permission android:name="${permission}" />`;
        if (!manifest.includes(permissionTag)) {
            manifest = manifest.replace(
                manifestMarker,
                `    ${permissionTag}\n    ${manifestMarker}`
            );
            log(`  + Added permission: ${permission}`);
            changesMade = true;
        } else {
            log(`  ✓ Permission already exists: ${permission}`);
        }
    }
    
    // Add usesCleartextTraffic for local development and connecting to local servers if needed
    if (!manifest.includes('android:usesCleartextTraffic="true"')) {
        manifest = manifest.replace(
            '<application',
            '<application android:usesCleartextTraffic="true"'
        );
        log('  + Added usesCleartextTraffic="true" to application tag.');
        changesMade = true;
    }


    if (changesMade) {
        fs.writeFileSync(manifestPath, manifest, 'utf8');
        log('AndroidManifest.xml updated successfully.');
    } else {
        log('AndroidManifest.xml already up-to-date.');
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
