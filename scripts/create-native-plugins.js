
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
  "description": "AIDE Embedded In-App Browser Plugin (Native Only)",
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
// Use the modern plugins DSL for better variant-aware dependency management
plugins {
    id 'com.android.library'
    id 'org.jetbrains.kotlin.android'
}

ext {
    junitVersion = project.hasProperty('junitVersion') ? project.property('junitVersion') : '4.13.2'
    androidxAppCompatVersion = project.hasProperty('androidxAppCompatVersion') ? project.property('androidxAppCompatVersion') : '1.6.1'
    androidxJunitVersion = project.hasProperty('androidxJunitVersion') ? project.property('androidxJunitVersion') : '1.1.5'
    kotlin_version = project.hasProperty('kotlinVersion') ? project.property('kotlinVersion') : '1.9.22'
}

android {
    namespace "com.aide.browser"
    compileSdk project.hasProperty('compileSdkVersion') ? project.property('compileSdkVersion') : 34
    defaultConfig {
        minSdkVersion project.hasProperty('minSdkVersion') ? project.property('minSdkVersion') : 22
        targetSdkVersion project.hasProperty('targetSdkVersion') ? project.property('targetSdkVersion') : 34
        versionCode 1
        versionName "1.0"
    }
    
    buildTypes {
        release {
            minifyEnabled false
        }
    }

    // lintOptions is deprecated, use lint
    lint {
        abortOnError false
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_21
        targetCompatibility JavaVersion.VERSION_21
    }

    kotlinOptions {
        jvmTarget = '21'
    }

    buildFeatures {
        buildConfig false
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
    implementation "org.jetbrains.kotlin:kotlin-stdlib:$kotlin_version"
}
`,

  // Android Manifest (empty, as we are not using a separate Activity anymore)
  'android/src/main/AndroidManifest.xml': `
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
</manifest>
`,

  // Android Plugin Kotlin file with new embedded logic
  'android/src/main/java/com/aide/browser/AideBrowserPlugin.kt': `
package com.aide.browser

import android.annotation.SuppressLint
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "AideBrowser")
class AideBrowserPlugin : Plugin() {

    private var webView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    @PluginMethod
    fun open(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("Must provide a URL")
        val bounds = call.getObject("bounds") ?: return call.reject("Must provide bounds")

        activity.runOnUiThread {
            if (webView == null) {
                webView = WebView(context)
                webView!!.settings.javaScriptEnabled = true
                webView!!.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                    }
                }
                val layoutParams = FrameLayout.LayoutParams(0, 0)
                (bridge.view.parent as ViewGroup).addView(webView, layoutParams)
            }
            updateBounds(call)
            webView?.loadUrl(url)
            call.resolve()
        }
    }

    @PluginMethod
    fun close(call: PluginCall) {
        activity.runOnUiThread {
            if (webView != null) {
                (bridge.view.parent as ViewGroup).removeView(webView)
                webView?.destroy()
                webView = null
            }
            call.resolve()
        }
    }

    @PluginMethod
    fun show(call: PluginCall) {
        activity.runOnUiThread {
            webView?.visibility = View.VISIBLE
            call.resolve()
        }
    }

    @PluginMethod
    fun hide(call: PluginCall) {
        activity.runOnUiThread {
            webView?.visibility = View.GONE
            call.resolve()
        }
    }

    @PluginMethod
    fun updateBounds(call: PluginCall) {
        val bounds = call.getObject("bounds") ?: return call.reject("Must provide bounds")
        val x = bounds.getInteger("x", 0)
        val y = bounds.getInteger("y", 0)
        val width = bounds.getInteger("width", 0)
        val height = bounds.getInteger("height", 0)

        activity.runOnUiThread {
            val layoutParams = webView?.layoutParams as? FrameLayout.LayoutParams
            if (layoutParams != null) {
                layoutParams.width = width
                layoutParams.height = height
                layoutParams.leftMargin = x
                layoutParams.topMargin = y
                webView?.layoutParams = layoutParams
            }
            call.resolve()
        }
    }
    
    @PluginMethod
    fun executeScript(call: PluginCall) {
        val code = call.getString("code") ?: return call.reject("Must provide code to execute")
        
        activity.runOnUiThread {
            webView?.evaluateJavascript(code) { result ->
                val escapedResult = result?.toString()?.removeSurrounding("\\"") ?: "null"
                val ret = JSObject()
                ret.put("value", escapedResult)
                call.resolve(ret)
            }
        }
    }
}
`,
  // iOS Plugin Swift file
  'ios/Plugin/AideBrowserPlugin.swift': `
import Foundation
import Capacitor
import WebKit

@objc(AideBrowserPlugin)
public class AideBrowserPlugin: CAPPlugin, WKNavigationDelegate {
    var webView: WKWebView?

    @objc func open(_ call: CAPPluginCall) {
        let urlString = call.getString("url") ?? ""
        guard let url = URL(string: urlString) else {
            call.reject("Invalid URL")
            return
        }
        guard let bounds = call.getObject("bounds") else {
            call.reject("Must provide bounds")
            return
        }

        DispatchQueue.main.async {
            if self.webView == nil {
                let webConfiguration = WKWebViewConfiguration()
                self.webView = WKWebView(frame: .zero, configuration: webConfiguration)
                self.webView!.navigationDelegate = self
                self.bridge?.viewController?.view.addSubview(self.webView!)
            }
            
            self.updateBounds(call)
            let request = URLRequest(url: url)
            self.webView?.load(request)
            call.resolve()
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.webView?.removeFromSuperview()
            self.webView = nil
            call.resolve()
        }
    }

    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.webView?.isHidden = false
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.webView?.isHidden = true
            call.resolve()
        }
    }
    
    @objc func updateBounds(_ call: CAPPluginCall) {
        guard let bounds = call.getObject("bounds") else {
            call.reject("Must provide bounds")
            return
        }
        let x = bounds["x"] as? CGFloat ?? 0
        let y = bounds["y"] as? CGFloat ?? 0
        let width = bounds["width"] as? CGFloat ?? 0
        let height = bounds["height"] as? CGFloat ?? 0

        DispatchQueue.main.async {
            self.webView?.frame = CGRect(x: x, y: y, width: width, height: height)
            call.resolve()
        }
    }
    
    @objc func executeScript(_ call: CAPPluginCall) {
        let code = call.getString("code") ?? ""
        
        DispatchQueue.main.async {
            guard let webView = self.webView else {
                call.reject("Browser is not open.")
                return
            }
            webView.evaluateJavaScript(code) { (result, error) in
                if let error = error {
                    call.reject("Script evaluation error: \\(error.localizedDescription)")
                } else {
                    call.resolve(["value": result ?? NSNull()])
                }
            }
        }
    }
}
`,
};

log('Starting embedded native plugin generation...');
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

log('Embedded native browser plugin generated successfully.');
