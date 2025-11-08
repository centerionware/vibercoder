
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

        // Add necessary imports if they are missing to prevent syntax errors
        const importsToAdd = [];
        if (!buildGradle.includes('import java.util.Properties')) {
            importsToAdd.push('import java.util.Properties');
        }
        if (!buildGradle.includes('import java.io.FileInputStream')) {
            importsToAdd.push('import java.io.FileInputStream');
        }
        if (importsToAdd.length > 0) {
            buildGradle = importsToAdd.join('\n') + '\n\n' + buildGradle;
            gradleChangesMade = true;
            log(`  + Added missing imports: ${importsToAdd.join(', ')}`);
        }

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

        // Configure dynamic versioning for CI/CD
        const versionCodeRegex = /versionCode\s+\d+/;
        const versionNameRegex = /versionName\s+".*"/;

        if (versionCodeRegex.test(buildGradle)) {
            buildGradle = buildGradle.replace(versionCodeRegex, `versionCode project.hasProperty('envVersionCode') ? project.property('envVersionCode').toInteger() : 1`);
            gradleChangesMade = true;
            log('  + Replaced static versionCode with dynamic property.');
        } else {
            log('  ! Could not find static versionCode to replace.');
        }

        if (versionNameRegex.test(buildGradle)) {
            buildGradle = buildGradle.replace(versionNameRegex, `versionName project.hasProperty('envVersionName') ? project.property('envVersionName') : "1.0"`);
            gradleChangesMade = true;
            log('  + Replaced static versionName with dynamic property.');
        } else {
            log('  ! Could not find static versionName to replace.');
        }

        // Configure Signing for Release Builds
        // Step 1: Inject keystore properties and signingConfigs block if it doesn't exist.
        if (!buildGradle.includes('signingConfigs {')) {
            const propertiesAndSigningBlock = `
    // Dynamically added by configure-native-project.js for CI/CD signing
    def keystorePropertiesFile = rootProject.file("keystore.properties")
    def keystoreProperties = new Properties()
    if (keystorePropertiesFile.exists()) {
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    }

    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
`;
            const androidBlockRegex = /android\s*{/;
            const match = buildGradle.match(androidBlockRegex);
            if (match && match.index !== undefined) {
                const injectionPoint = match.index + match[0].length;
                buildGradle = buildGradle.substring(0, injectionPoint) + propertiesAndSigningBlock + buildGradle.substring(injectionPoint);
                gradleChangesMade = true;
                log('  + Injected keystore properties and signingConfigs block.');
            } else {
                log('  ! Could not find android block to inject signing config.');
            }
        }
        
        // Step 2: Add signingConfig to the existing release build type.
        if (!buildGradle.includes('signingConfig signingConfigs.release')) {
            const releaseBlockRegex = /buildTypes\s*\{\s*release\s*\{/;
            const match = buildGradle.match(releaseBlockRegex);
            if (match && match.index !== undefined) {
                const injectionPoint = match.index + match[0].length;
                buildGradle = buildGradle.substring(0, injectionPoint) + '\n            signingConfig signingConfigs.release' + buildGradle.substring(injectionPoint);
                gradleChangesMade = true;
                log('  + Added signingConfig to release build type.');
            } else {
                log('  ! Could not find "buildTypes { release {" block to add signingConfig.');
            }
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

function createMainActivity() {
    log('Ensuring MainActivity with custom plugin registration exists...');
    
    // Read App ID from capacitor.config.json to make this robust
    const capacitorConfigPath = path.resolve(projectRoot, 'capacitor.config.json');
    if (!fs.existsSync(capacitorConfigPath)) {
        log('  ! capacitor.config.json not found. Cannot determine package ID. Skipping MainActivity creation.');
        return;
    }
    const config = JSON.parse(fs.readFileSync(capacitorConfigPath, 'utf8'));
    const mainAppId = config.appId;
    if (!mainAppId) {
        log('  ! appId not found in capacitor.config.json. Skipping MainActivity creation.');
        return;
    }
    
    const packagePath = mainAppId.replace(/\./g, '/');
    const mainActivityPath = path.resolve(projectRoot, `android/app/src/main/java/${packagePath}`);
    const mainActivityFile = path.resolve(mainActivityPath, 'MainActivity.java');
    
    // Ensure the directory for the MainActivity.java file exists
    if (!fs.existsSync(mainActivityPath)) {
        fs.mkdirSync(mainActivityPath, { recursive: true });
        log(`  + Created directory: ${mainActivityPath}`);
    }

    const mainActivityContent = `package ${mainAppId};

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

// Import the custom browser plugin
import com.aide.browser.AideBrowserPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Register all custom plugins here to ensure they are available to Capacitor
    registerPlugin(AideBrowserPlugin.class);
  }
}
`;

    if (!fs.existsSync(mainActivityFile)) {
        fs.writeFileSync(mainActivityFile, mainActivityContent.trim(), 'utf8');
        log(`  + Created MainActivity.java with AideBrowserPlugin registration.`);
    } else {
        let content = fs.readFileSync(mainActivityFile, 'utf8');
        let changesMade = false;
        
        // Add import if it's missing
        if (!content.includes('import com.aide.browser.AideBrowserPlugin;')) {
            content = content.replace(/(import com\.getcapacitor\.BridgeActivity;)/, `$1\nimport com.aide.browser.AideBrowserPlugin;`);
            changesMade = true;
        }
        
        // Add registration call if it's missing
        if (!content.includes('registerPlugin(AideBrowserPlugin.class);')) {
            const onCreateMatch = content.match(/super\.onCreate\(savedInstanceState\);/);
            if (onCreateMatch) {
                content = content.replace(onCreateMatch[0], `${onCreateMatch[0]}\n\n    // Register custom plugins\n    registerPlugin(AideBrowserPlugin.class);`);
                changesMade = true;
            } else {
                 log(`  ! Could not find super.onCreate() to inject plugin registration.`);
            }
        }
        
        if (changesMade) {
             fs.writeFileSync(mainActivityFile, content, 'utf8');
             log('  + Updated existing MainActivity.java to register AideBrowserPlugin.');
        } else {
            log('  ✓ MainActivity.java already includes AideBrowserPlugin registration.');
        }
    }
}

function configureGradleForLocalPlugin() {
    log('Patching Gradle configuration for local browser plugin...');
    const invalidCapacitorPluginId = ':@aide/browser';
    const validGradlePluginId = ':aide-browser'; // A valid Gradle project name
    const directPluginPath = '../native-plugins/aide-browser/android';
    const correctPathForGradle = directPluginPath.replace(/\\/g, '/');

    // --- Patch settings.gradle ---
    const settingsGradlePath = path.resolve(projectRoot, 'android/settings.gradle');
    if (!fs.existsSync(settingsGradlePath)) {
        log('  ! android/settings.gradle not found. Cannot patch local plugin path.');
        return;
    }
    
    let settingsGradle = fs.readFileSync(settingsGradlePath, 'utf8');
    let settingsChangesMade = false;

    // 1. Sanitize the project name. This is the main fix for the '/' character issue.
    if (settingsGradle.includes(invalidCapacitorPluginId)) {
        settingsGradle = settingsGradle.replace(new RegExp(invalidCapacitorPluginId, 'g'), validGradlePluginId);
        settingsChangesMade = true;
        log(`  + Sanitized plugin name from '${invalidCapacitorPluginId}' to '${validGradlePluginId}'`);
    }

    // 2. Now patch the path using the *valid* name.
    const projectDirRegex = new RegExp(`(project\\('${validGradlePluginId}'\\)\\.projectDir = new File\\(rootProject\\.projectDir, ')([^']+)('\\))`);
    
    const match = settingsGradle.match(projectDirRegex);
    if (match) {
        const currentPath = match[2];
        if (currentPath !== correctPathForGradle) {
            settingsGradle = settingsGradle.replace(projectDirRegex, `$1${correctPathForGradle}$3`);
            settingsChangesMade = true;
            log(`  + Patched projectDir for ${validGradlePluginId}:`);
            log(`    - Old path: ${currentPath}`);
            log(`    - New path: ${correctPathForGradle}`);
        } else {
            log(`  ✓ projectDir for ${validGradlePluginId} is already correct.`);
        }
    } else {
        log(`  ! Could not find projectDir line for '${validGradlePluginId}' to patch. Assuming it needs to be added.`);
        const includeStatement = `include '${validGradlePluginId}'`;
        if (!settingsGradle.includes(includeStatement)) {
            settingsGradle += `\n${includeStatement}`;
            settingsChangesMade = true;
        }
        const projectDirStatement = `project('${validGradlePluginId}').projectDir = new File(rootProject.projectDir, '${correctPathForGradle}')`;
        if (!settingsGradle.includes(projectDirStatement)) {
            settingsGradle += `\n${projectDirStatement}\n`;
            settingsChangesMade = true;
        }
    }

    if (settingsChangesMade) {
        fs.writeFileSync(settingsGradlePath, settingsGradle, 'utf8');
        log('  ✓ settings.gradle updated for local plugin.');
    } else {
        log('  ✓ No changes needed for settings.gradle.');
    }

    // --- Patch app/build.gradle ---
    const appBuildGradlePath = path.resolve(projectRoot, 'android/app/build.gradle');
    if (!fs.existsSync(appBuildGradlePath)) {
        log('  ! android/app/build.gradle not found. Cannot verify dependency.');
        return;
    }
    
    let appBuildGradle = fs.readFileSync(appBuildGradlePath, 'utf8');
    let appChangesMade = false;

    // Sanitize the project name here as well.
    const invalidImplementationStatement = `implementation project('${invalidCapacitorPluginId}')`;
    const validImplementationStatement = `implementation project('${validGradlePluginId}')`;
    if (appBuildGradle.includes(invalidImplementationStatement)) {
        appBuildGradle = appBuildGradle.replace(invalidImplementationStatement, validImplementationStatement);
        appChangesMade = true;
        log(`  + Sanitized plugin dependency name in app/build.gradle.`);
    }

    // Safety check: if the dependency is missing entirely, add the valid one.
    if (!appBuildGradle.includes(validImplementationStatement)) {
        const dependenciesRegex = /dependencies\s*\{/;
        const match = appBuildGradle.match(dependenciesRegex);
        if (match && match.index !== undefined) {
            const injectionPoint = match.index + match[0].length;
            appBuildGradle = appBuildGradle.substring(0, injectionPoint) + `\n    ${validImplementationStatement}` + appBuildGradle.substring(injectionPoint);
            appChangesMade = true;
            log(`  + Added fallback dependency to app/build.gradle: ${validImplementationStatement}`);
        } else {
            log('  ! Could not find dependencies block in app/build.gradle to inject plugin.');
        }
    }
    
    if (appChangesMade) {
        fs.writeFileSync(appBuildGradlePath, appBuildGradle, 'utf8');
        log('  ✓ app/build.gradle updated for local plugin.');
    } else {
        log('  ✓ No changes needed for app/build.gradle.');
    }
}


log('Starting native project configuration (manifests, gradle)...');
configureAndroid();
configureIos();
createMainActivity();
configureGradleForLocalPlugin();
log('Native project configuration finished.');
