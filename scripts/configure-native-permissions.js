
import fs from 'fs';
import path from 'path';

const log = (message) => console.log(`[Native Config] ${message}`);
const logPlugin = (message) => console.log(`[Plugin Injector] ${message}`);

// Use process.cwd() for a reliable project root in CI environments.
const projectRoot = process.cwd();
log(`Project root determined as: ${projectRoot}`);

// --- DYNAMICALLY GET APP ID ---
const getAppId = () => {
    const capacitorConfigPath = path.resolve(projectRoot, 'capacitor.config.json');
    if (!fs.existsSync(capacitorConfigPath)) {
        log(`capacitor.config.json not found at ${capacitorConfigPath}. Falling back to AndroidManifest.xml`);
        const manifestPath = path.resolve(projectRoot, 'android/app/src/main/AndroidManifest.xml');
        if (fs.existsSync(manifestPath)) {
            const manifest = fs.readFileSync(manifestPath, 'utf8');
            const match = manifest.match(/package="([^"]+)"/);
            if (match && match[1]) {
                log(`App ID found in AndroidManifest.xml: ${match[1]}`);
                return match[1];
            }
        }
        log('Could not determine appId. Using default "com.aide.app". This might be incorrect.');
        return "com.aide.app";
    }
    const config = JSON.parse(fs.readFileSync(capacitorConfigPath, 'utf8'));
    if (!config.appId) {
        throw new Error('appId not found in capacitor.config.json');
    }
    log(`App ID found in capacitor.config.json: ${config.appId}`);
    return config.appId;
};

// --- Plugin File Injection ---

const getAndroidPluginFiles = (appId, packagePath) => ({
    plugin: {
        path: `android/app/src/main/java/${packagePath}/AideBrowserPlugin.kt`,
        content: `package ${appId}

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
        path: `android/app/src/main/java/${packagePath}/BrowserActivity.kt`,
        content: `package ${appId}

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
});

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
    const androidDir = path.resolve(projectRoot, 'android');
    if (!fs.existsSync(androidDir)) {
        logPlugin('Android directory not found, skipping Android plugin injection.');
        return;
    }

    const appId = getAppId();
    const packagePath = appId.replace(/\./g, '/');
    logPlugin(`Detected App ID: ${appId}`);
    logPlugin(`Generated package path: ${packagePath}`);
    const androidPluginFiles = getAndroidPluginFiles(appId, packagePath);

    logPlugin('Injecting custom browser plugin and activity files for Android...');
    for (const fileKey of ['plugin', 'activity']) {
        const file = androidPluginFiles[fileKey];
        const filePath = path.resolve(projectRoot, file.path);
        const fileDir = path.dirname(filePath);

        try {
            if (!fs.existsSync(filePath)) {
                fs.mkdirSync(fileDir, { recursive: true });
                fs.writeFileSync(filePath, file.content.trim(), 'utf8');
                logPlugin(`  + Wrote file: ${filePath}`);
            } else {
                logPlugin(`  ✓ File already exists: ${filePath}`);
            }
        } catch (e) {
            logPlugin(`  ! Error writing file ${filePath}: ${e.message}`);
        }
    }

    logPlugin('Modifying MainActivity.kt to register plugin...');
    const mainActivityPath = path.resolve(projectRoot, `android/app/src/main/java/${packagePath}/MainActivity.kt`);
    logPlugin(`Checking for MainActivity.kt at: ${mainActivityPath}`);

    if (!fs.existsSync(mainActivityPath)) {
        logPlugin(`  ! MainActivity.kt not found. Creating it from a template...`);
        try {
            const mainActivityTemplate = `package ${appId}

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(AideBrowserPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
`;
            const mainActivityDir = path.dirname(mainActivityPath);
            fs.mkdirSync(mainActivityDir, { recursive: true });
            fs.writeFileSync(mainActivityPath, mainActivityTemplate.trim(), 'utf8');
            logPlugin(`  + Successfully created and configured MainActivity.kt at ${mainActivityPath}.`);
        } catch (e) {
            logPlugin(`  ! CRITICAL: Failed to create MainActivity.kt: ${e.message}`);
        }
        return;
    }

    try {
        let mainActivityContent = fs.readFileSync(mainActivityPath, 'utf8');
        const registrationLine = `registerPlugin(AideBrowserPlugin::class.java)`;
        const onCreateMethodRegex = /override fun onCreate\s*\(/;
        const classDeclarationRegex = /(class MainActivity\s*:\s*BridgeActivity\(\)\s*{)/;

        if (mainActivityContent.includes(registrationLine)) {
            logPlugin(`  ✓ MainActivity.kt already contains plugin registration.`);
            return;
        }

        if (!mainActivityContent.includes(`import ${appId}.AideBrowserPlugin`)) {
            mainActivityContent = mainActivityContent.replace(/(package .*)/, `$1\n\nimport ${appId}.AideBrowserPlugin`);
            logPlugin(`  + Added AideBrowserPlugin import.`);
        }
        if (!mainActivityContent.includes("import android.os.Bundle")) {
            mainActivityContent = mainActivityContent.replace(/(package .*)/, `$1\nimport android.os.Bundle`);
            logPlugin(`  + Added Bundle import.`);
        }
        
        const lines = mainActivityContent.split('\n');
        const uniqueLines = [...new Set(lines)];
        mainActivityContent = uniqueLines.join('\n');

        if (onCreateMethodRegex.test(mainActivityContent)) {
            mainActivityContent = mainActivityContent.replace(
                /(super\.onCreate\s*\(\s*savedInstanceState\s*\))/,
                `        ${registrationLine}\n        $1`
            );
            logPlugin(`  + Injected registration into existing onCreate() method.`);
        } else if (classDeclarationRegex.test(mainActivityContent)) {
            const onCreateMethod = `
    override fun onCreate(savedInstanceState: Bundle?) {
        ${registrationLine}
        super.onCreate(savedInstanceState)
    }`;
            mainActivityContent = mainActivityContent.replace(
                classDeclarationRegex,
                `$1${onCreateMethod}`
            );
            logPlugin(`  + Added new onCreate() method with plugin registration.`);
        } else {
            logPlugin(`  ! CRITICAL: Could not find 'class MainActivity' declaration. Failed to inject plugin.`);
            return;
        }

        fs.writeFileSync(mainActivityPath, mainActivityContent, 'utf8');
        logPlugin(`  + Successfully updated existing MainActivity.kt.`);

    } catch (e) {
        logPlugin(`  ! CRITICAL: Error modifying existing MainActivity.kt: ${e.message}`);
    }
}


function injectIosPlugin() {
    logPlugin('Checking for iOS platform...');
    const iosDir = path.resolve(projectRoot, 'ios');
    if (!fs.existsSync(iosDir)) {
        logPlugin('iOS directory not found, skipping iOS plugin injection.');
        return;
    }

    logPlugin('Injecting custom browser plugin files for iOS...');
    for (const file of Object.values(iosPluginFiles)) {
        const filePath = path.resolve(projectRoot, file.path);
        
        try {
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, file.content.trim(), 'utf8');
                logPlugin(`  + Created file: ${filePath}`);
            } else {
                logPlugin(`  ✓ File already exists: ${filePath}`);
            }
        } catch (e) {
            logPlugin(`  ! Error writing file ${filePath}: ${e.message}`);
        }
    }
}

function injectCustomBrowserPlugin() {
    injectAndroidPlugin();
    injectIosPlugin();
}

function configureAndroid() {
    const manifestPath = path.resolve(projectRoot, 'android/app/src/main/AndroidManifest.xml');
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
            'android.permission.MODIFY_AUDIO_SETTINGS'
        ];

        const manifestMarker = '<application';
        for (const permission of permissions) {
            const permissionTag = `<uses-permission android:name="${permission}" />`;
            if (!manifest.includes(permissionTag)) {
                manifest = manifest.replace(manifestMarker, `${permissionTag}\n    ${manifestMarker}`);
                manifestChangesMade = true;
                log(`  + Added permission: ${permission}`);
            } else {
                log(`  ✓ Permission already exists: ${permission}`);
            }
        }

        // Register BrowserActivity
        const activityTag = `<activity android:name=".BrowserActivity" android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode" android:launchMode="singleTop" />`;
        if (!manifest.includes('android:name=".BrowserActivity"')) {
            const applicationEndMarker = '</application>';
            if (manifest.includes(applicationEndMarker)) {
                manifest = manifest.replace(applicationEndMarker, `        ${activityTag}\n    ${applicationEndMarker}`);
                manifestChangesMade = true;
                log(`  + Added BrowserActivity declaration.`);
            } else {
                log(`  ! Could not find </application> tag to inject BrowserActivity.`);
            }
        } else {
            log(`  ✓ BrowserActivity already declared.`);
        }

        if (manifestChangesMade) {
            fs.writeFileSync(manifestPath, manifest, 'utf8');
            log('AndroidManifest.xml updated successfully.');
        } else {
            log('No changes needed for AndroidManifest.xml.');
        }
    }

    const buildGradlePath = path.resolve(projectRoot, 'android/app/build.gradle');
    if (!fs.existsSync(buildGradlePath)) {
        log('android/app/build.gradle not found, skipping Java version configuration.');
    } else {
        log(`Configuring build.gradle at: ${buildGradlePath}`);
        let buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
        let needsWrite = false;

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
            needsWrite = true;
            log('  + Set Java compatibility to version 17.');
        } else {
            log('  ✓ Java version 17 already configured in build.gradle.');
        }
        
        // Also update kotlinOptions if present to match
        if (buildGradle.includes("jvmTarget = '1.8'")) {
             buildGradle = buildGradle.replace("jvmTarget = '1.8'", "jvmTarget = '17'");
             log("  + Set kotlinOptions.jvmTarget to '17'.");
             needsWrite = true;
        } else {
             log("  ✓ kotlinOptions.jvmTarget is not '1.8' (no change needed).");
        }

        if (needsWrite) {
            fs.writeFileSync(buildGradlePath, buildGradle, 'utf8');
            log('build.gradle updated successfully.');
        } else {
            log('No changes needed for build.gradle.');
        }
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

// --- Main Execution ---
log('Starting native project configuration...');
configureAndroid();
configureIos();
injectCustomBrowserPlugin();
log('Native project configuration finished.');
