
import fs from 'fs';
import path from 'path';

const log = (message) => console.log(`[Plugin Generator] ${message}`);
const projectRoot = process.cwd();
const pluginDir = path.resolve(projectRoot, 'native-plugins/aide-browser');

const files = {
  // package.json for the plugin
  'package.json': `
{
  "name": "@aide/browser",
  "version": "1.0.0",
  "description": "AIDE In-App Browser Plugin (Native Only)",
  "capacitor": {
    "ios": {
      "src": "ios"
    },
    "android": {
      "src": "android"
    }
  }
}
`,

  // Podspec for iOS
  'aide-browser.podspec': `
require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'AideBrowser'
  s.version = package['version']
  s.summary = package['description']
  s.license = 'MIT'
  s.homepage = 'https://github.com/aistudio-co/aide'
  s.author = 'AIDE'
  s.source = { :path => '.' }
  s.source_files = 'ios/Plugin/**/*.{swift,h,m}'
  s.ios.deployment_target = '13.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
`,
  // Android build.gradle
  'android/build.gradle': `
ext {
    junitVersion = project.hasProperty('junitVersion') ? project.property('junitVersion') : '4.13.2'
    androidxAppCompatVersion = project.hasProperty('androidxAppCompatVersion') ? project.property('androidxAppCompatVersion') : '1.6.1'
    androidxJunitVersion = project.hasProperty('androidxJunitVersion') ? project.property('androidxJunitVersion') : '1.1.5'
}

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.2.1'
    }
}

apply plugin: 'com.android.library'

android {
    namespace "com.aide.browser"
    compileSdk project.hasProperty('compileSdkVersion') ? project.property('compileSdkVersion') : 34
    defaultConfig {
        minSdkVersion project.hasProperty('minSdkVersion') ? project.property('minSdkVersion') : 22
        targetSdkVersion project.hasProperty('targetSdkVersion') ? project.property('targetSdkVersion') : 34
        versionCode 1
        versionName "1.0"
        consumerProguardFiles 'proguard-rules.pro'
    }
    buildTypes {
        release {
            minifyEnabled false
        }
    }
    lintOptions {
        abortOnError false
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

repositories {
    google()
    mavenCentral()
}


dependencies {
    implementation fileTree(dir: 'libs', include: ['*.jar'])
    implementation project(':capacitor-android')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    testImplementation "junit:junit:$junitVersion"
    androidTestImplementation "androidx.test.ext:junit:$androidxJunitVersion"
}
`,
  // Proguard rules for Android release builds
  'android/proguard-rules.pro': `
-keep public class com.aide.browser.** { *; }
-keep public class * extends com.getcapacitor.Plugin
-keep public @com.getcapacitor.annotation.CapacitorPlugin class *
`,

  // Android Manifest
  'android/src/main/AndroidManifest.xml': `
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application>
        <activity
            android:name="com.aide.browser.BrowserActivity"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:launchMode="singleTop" />
    </application>
</manifest>
`,

  // Android Plugin Kotlin file
  'android/src.main/java/com/aide/browser/AideBrowserPlugin.kt': `
package com.aide.browser

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
}
`,
  // Android Activity Kotlin file
  'android/src.main/java/com/aide/browser/BrowserActivity.kt': `
package com.aide.browser

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.getcapacitor.BridgeActivity

class BrowserActivity : AppCompatActivity() {

    lateinit var webView: WebView

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
                mainActivity?.bridge?.getPlugin("AideBrowser")?.notifyListeners("pageLoaded", null)
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
            mainActivity?.bridge?.getPlugin("AideBrowser")?.notifyListeners("closed", null)
            instance = null
        }
    }
    
    private val mainActivity: BridgeActivity?
        get() = BridgeActivity.getBridge()?.activity
}
`,

  // iOS Plugin Swift file
  'ios/Plugin/AideBrowserPlugin.swift': `
import Foundation
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
}
`,
  // iOS ViewController Swift file
  'ios/Plugin/BrowserViewController.swift': `
import UIKit
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
}
`
};

log('Starting native plugin generation...');
if (!fs.existsSync(pluginDir)) {
    log(`Creating plugin directory: ${pluginDir}`);
    fs.mkdirSync(pluginDir, { recursive: true });
}

for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.resolve(pluginDir, filePath);
    const dirName = path.dirname(fullPath);
    if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true });
    }
    fs.writeFileSync(fullPath, content.trim(), 'utf8');
    log(`  ✓ Wrote ${filePath}`);
}

log('Native browser plugin generated successfully.');

// --- Manual Plugin Registration ---
// The following logic is added to address an issue where the AideBrowser plugin
// is not being automatically discovered by Capacitor on Android. This creates
// a MainActivity.java file for the main application, which manually registers
// the plugin, ensuring it's available to the web bridge at runtime.
log('Configuring manual registration for AideBrowser plugin...');

const mainActivityPackagePath = 'android/app/src/main/java/com/aide/app';
const mainActivityPath = path.resolve(projectRoot, mainActivityPackagePath, 'MainActivity.java');

const mainActivityContent = `
package com.aide.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import java.util.ArrayList;

// Import the custom plugin
import com.aide.browser.AideBrowserPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Manually register the AideBrowserPlugin
    this.init(savedInstanceState, new ArrayList<Class<? extends Plugin>>() {{
      add(AideBrowserPlugin.class);
    }});
  }
}
`;

try {
  if (!fs.existsSync(mainActivityPath)) {
    fs.mkdirSync(path.resolve(projectRoot, mainActivityPackagePath), { recursive: true });
    fs.writeFileSync(mainActivityPath, mainActivityContent.trim(), 'utf8');
    log('  ✓ Created MainActivity.java with manual plugin registration.');
  } else {
    log('  - MainActivity.java already exists. Assuming plugin is already registered there.');
  }
} catch (e) {
  log('  ! Error creating MainActivity.java: ' + e.message);
}
