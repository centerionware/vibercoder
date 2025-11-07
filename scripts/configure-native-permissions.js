
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

// Replicate __dirname functionality in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const log = (message) => console.log(`[Native Config] ${message}`);
const logPlugin = (message) => console.log(`[Plugin Injector] ${message}`);

// --- Plugin File Injection ---

const androidPluginFiles = {
    plugin: {
        path: 'android/app/src/main/java/com/aide/app/AideBrowserPlugin.kt',
        content: `package com.aide.app

import android.content.Intent
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "AideBrowser")
class AideBrowserPlugin : Plugin() {

    @PluginMethod
    fun open(call: PluginCall) {
        val url = call.getString("url")
        if (url == null) {
            call.reject("Must provide a URL")
            return
        }

        val intent = Intent(context, BrowserActivity::class.java)
        intent.putExtra(BrowserActivity.EXTRA_URL, url)
        startActivityForResult(call, intent, "browserResult")
    }

    @PluginMethod
    fun close(call: PluginCall) {
        BrowserActivity.closeInstance()
        call.resolve()
    }
    
    @PluginMethod
    fun executeScript(call: PluginCall) {
        val code = call.getString("code")
        if (code == null) {
            call.reject("Must provide code to execute")
            return
        }
        
        BrowserActivity.executeScript(code) { result ->
            val ret = JSObject()
            ret.put("value", result)
            call.resolve(ret)
        }
    }

    @ActivityCallback
    private fun browserResult(call: PluginCall?, result: ActivityResult) {
        call?.resolve()
    }
    
    override fun handleOnPause() {
        super.handleOnPause()
        BrowserActivity.closeInstance()
    }
}`
    },
    activity: {
        path: 'android/app/src/main/java/com/aide/app/BrowserActivity.kt',
        content: `package com.aide.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.getcapacitor.BridgeActivity

class BrowserActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    companion object {
        const val EXTRA_URL = "extra_url"
        private var instance: BrowserActivity? = null

        fun closeInstance() {
            instance?.finish()
        }
        
        fun executeScript(code: String, callback: (String) -> Unit) {
            instance?.runOnUiThread {
                instance?.webView?.evaluateJavascript(code) { result ->
                    val resultString = result?.toString()?.removeSurrounding("\"") ?: "null"
                    callback(resultString)
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this

        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                (application as? BridgeActivity)?.bridge?.getPlugin("AideBrowser")?.notifyListeners("pageLoaded", null)
            }
        }

        val url = intent.getStringExtra(EXTRA_URL)
        if (url != null) {
            webView.loadUrl(url)
        } else {
            finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            (application as? BridgeActivity)?.bridge?.getPlugin("AideBrowser")?.notifyListeners("closed", null)
            instance = null
        }
    }
}`
    },
    mainActivity: {
        path: 'android/app/src/main/java/com/aide/app/MainActivity.kt',
        content: `package com.aide.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Manually register the custom AideBrowserPlugin before super.onCreate()
        // to ensure it's available to the Capacitor bridge at startup.
        registerPlugin(AideBrowserPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}`
    }
};

const iosPluginFiles = {
    plugin: {
        path: 'ios/App/App/AideBrowserPlugin.swift',
        content: `import Foundation
import Capacitor

@objc(AideBrowserPlugin)
public class AideBrowserPlugin: CAPPlugin {
    var viewController: BrowserViewController?

    @objc func open(_ call: CAPPluginCall) {
        let urlString = call.getString("url") ?? ""
        
        guard let url = URL(string: urlString) else {
            call.reject("Invalid URL")
            return
        }

        DispatchQueue.main.async {
            self.viewController = BrowserViewController()
            self.viewController!.plugin = self
            self.viewController!.initialUrl = url
            self.viewController!.modalPresentationStyle = .fullScreen
            
            self.bridge?.viewController?.present(self.viewController!, animated: true, completion: {
                 call.resolve()
            })
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.viewController?.dismiss(animated: true) {
                self.viewController = nil
                call.resolve()
            }
        }
    }
    
    @objc func executeScript(_ call: CAPPluginCall) {
        let code = call.getString("code") ?? ""
        
        DispatchQueue.main.async {
            guard let webView = self.viewController?.webView else {
                call.reject("Browser is not open or webView is not available.")
                return
            }
            webView.evaluateJavaScript(code) { (result, error) in
                if let error = error {
                    call.reject("Script evaluation error: \\(error.localizedDescription)")
                } else {
                    var resultValue: Any
                    if result == nil || type(of: result) == NSNull.self {
                        resultValue = NSNull()
                    } else {
                        resultValue = result!
                    }
                    call.resolve(["value": resultValue])
                }
            }
        }
    }
}`
    },
    viewController: {
        path: 'ios/App/App/BrowserViewController.swift',
        content: `import UIKit
import WebKit
import Capacitor

class BrowserViewController: UIViewController, WKNavigationDelegate {
    
    weak var plugin: CAPPlugin?
    var webView: WKWebView!
    var initialUrl: URL?

    override func viewDidLoad() {
        super.viewDidLoad()

        let webConfiguration = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: webConfiguration)
        webView.navigationDelegate = self
        view = webView
        
        if let url = initialUrl {
            let request = URLRequest(url: url)
            webView.load(request)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        plugin?.notifyListeners("pageLoaded", data: nil)
    }
    
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        plugin?.notifyListeners("closed", data: nil)
    }
}`
    }
};

function injectAndroidPlugin() {
    logPlugin('Checking for Android platform...');
    const androidDir = path.resolve(__dirname, '..', 'android');
    if (!fs.existsSync(androidDir)) {
        logPlugin('Android directory not found, skipping Android plugin injection.');
        return;
    }

    logPlugin('Injecting custom browser plugin files for Android...');
    for (const file of Object.values(androidPluginFiles)) {
        const filePath = path.resolve(__dirname, '..', file.path);
        const fileDir = path.dirname(filePath);

        try {
            if (!fs.existsSync(filePath) || file.path.includes('MainActivity')) {
                fs.mkdirSync(fileDir, { recursive: true });
                fs.writeFileSync(filePath, file.content.trim(), 'utf8');
                logPlugin(`  + Wrote file: ${file.path}`);
            } else {
                logPlugin(`  ✓ File already exists: ${file.path}`);
            }
        } catch (e) {
            logPlugin(`  ! Error writing file ${file.path}: ${e.message}`);
        }
    }
}

function injectIosPlugin() {
    logPlugin('Checking for iOS platform...');
    const iosDir = path.resolve(__dirname, '..', 'ios');
    if (!fs.existsSync(iosDir)) {
        logPlugin('iOS directory not found, skipping iOS plugin injection.');
        return;
    }

    logPlugin('Injecting custom browser plugin files for iOS...');
    for (const file of Object.values(iosPluginFiles)) {
        const filePath = path.resolve(__dirname, '..', file.path);
        
        try {
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, file.content.trim(), 'utf8');
                logPlugin(`  + Created file: ${file.path}`);
            } else {
                logPlugin(`  ✓ File already exists: ${file.path}`);
            }
        } catch (e) {
            logPlugin(`  ! Error writing file ${file.path}: ${e.message}`);
        }
    }
}

function injectCustomBrowserPlugin() {
    injectAndroidPlugin();
    injectIosPlugin();
}

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

        const activityTag = `        <activity android:name=".BrowserActivity" android:exported="false" />`;
        const mainActivityMarker = '<activity android:name=".MainActivity"';
        if (!manifest.includes('android:name=".BrowserActivity"')) {
            manifest = manifest.replace(
                mainActivityMarker,
                `${activityTag}\n        ${mainActivityMarker}`
            );
            log(`  + Added BrowserActivity to manifest.`);
            manifestChangesMade = true;
        } else {
            log(`  ✓ BrowserActivity already in manifest.`);
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

    // Part 3 & 4: Configure android/app/build.gradle for signing and versioning
    const buildGradlePath = path.resolve(__dirname, '..', 'android/app/build.gradle');
    if (!fs.existsSync(buildGradlePath)) {
        log('android/app/build.gradle not found, skipping signing and versioning configuration.');
        return;
    }
    
    log(`Configuring android/app/build.gradle for signing & versioning at: ${buildGradlePath}`);
    let gradleContent = fs.readFileSync(buildGradlePath, 'utf8');
    let anyChangesMade = false;

    // --- Signing Configuration ---
    const signingConfigBlock = `
    signingConfigs {
        release {
            def propsFile = rootProject.file('keystore.properties')
            if (propsFile.exists()) {
                println ">>> Release signing properties found, configuring signing."
                def props = new Properties()
                props.load(new FileInputStream(propsFile))
                storeFile rootProject.file(props['storeFile'])
                storePassword props['storePassword']
                keyAlias props['keyAlias']
                keyPassword props['keyPassword']
            } else {
                println ">>> Release signing properties not found, building unsigned release."
            }
        }
    }
`;
    if (!gradleContent.includes('signingConfigs {')) {
        if (gradleContent.includes('buildTypes {')) {
            gradleContent = gradleContent.replace(/(\s*buildTypes\s*{)/, `${signingConfigBlock}\n$1`);
            log('  + Added signingConfigs block.');
            anyChangesMade = true;
        }
    } else {
        log('  ✓ signingConfigs block already exists.');
    }

    if (!gradleContent.includes('signingConfig signingConfigs.release')) {
        if (gradleContent.match(/buildTypes\s*{\s*release\s*{/)) {
            gradleContent = gradleContent.replace(/(buildTypes\s*{\s*release\s*{)/, `$1\n            signingConfig signingConfigs.release`);
            log('  + Applied signingConfig to release build type.');
            anyChangesMade = true;
        }
    } else {
        log('  ✓ release build type already configured for signing.');
    }
    
    // --- Dynamic Versioning Configuration ---
    log(`Configuring for dynamic versioning.`);
    const versionCodeRegex = /versionCode\s+\d+/;
    const newVersionCodeLine = `versionCode project.hasProperty('envVersionCode') ? project.property('envVersionCode').toInteger() : 1`;
    if (gradleContent.match(versionCodeRegex)) {
        if (!gradleContent.includes(`project.property('envVersionCode')`)) {
            gradleContent = gradleContent.replace(versionCodeRegex, newVersionCodeLine);
            log('  + Replaced static versionCode with dynamic property.');
            anyChangesMade = true;
        } else {
            log('  ✓ Dynamic versionCode already configured.');
        }
    }
    
    const versionNameRegex = /versionName\s+".*"/;
    const newVersionNameLine = `versionName project.hasProperty('envVersionName') ? project.property('envVersionName') : "1.0"`;
    if (gradleContent.match(versionNameRegex)) {
        if (!gradleContent.includes(`project.property('envVersionName')`)) {
            gradleContent = gradleContent.replace(versionNameRegex, newVersionNameLine);
            log('  + Replaced static versionName with dynamic property.');
            anyChangesMade = true;
        } else {
            log('  ✓ Dynamic versionName already configured.');
        }
    }
    
    // Final write if any change was made
    if (anyChangesMade) {
        fs.writeFileSync(buildGradlePath, gradleContent, 'utf8');
        log('android/app/build.gradle updated successfully.');
    } else {
        log('android/app/build.gradle configuration already up-to-date.');
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
log('Starting native configuration script...');
try {
    injectCustomBrowserPlugin();
    configureAndroid();
    configureIOS();
    log('Script finished successfully.');
} catch (error) {
    log(`An error occurred: ${error.message}`);
    process.exit(1);
}
