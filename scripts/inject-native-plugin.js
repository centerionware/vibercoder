
import fs from 'fs';
import path from 'path';

const log = (message) => console.log(`[Plugin Injector] ${message}`);
const projectRoot = process.cwd();

// --- DYNAMICALLY GET APP ID ---
const getAppId = () => {
    const capacitorConfigPath = path.resolve(projectRoot, 'capacitor.config.json');
    if (!fs.existsSync(capacitorConfigPath)) {
        log('capacitor.config.json not found, cannot determine appId.');
        throw new Error('capacitor.config.json not found');
    }
    const config = JSON.parse(fs.readFileSync(capacitorConfigPath, 'utf8'));
    if (!config.appId) {
        throw new Error('appId not found in capacitor.config.json');
    }
    log(`App ID found in capacitor.config.json: ${config.appId}`);
    return config.appId;
};

// --- Plugin File Content ---
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
    log('Checking for Android platform...');
    const androidDir = path.resolve(projectRoot, 'android');
    if (!fs.existsSync(androidDir)) {
        log('Android directory not found, skipping Android plugin injection.');
        return;
    }
    const appId = getAppId();
    const packagePath = appId.replace(/\./g, '/');
    const androidPluginFiles = getAndroidPluginFiles(appId, packagePath);

    log('Injecting custom browser plugin and activity files for Android...');
    for (const fileKey of ['plugin', 'activity']) {
        const file = androidPluginFiles[fileKey];
        const filePath = path.resolve(projectRoot, file.path);
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(filePath)) {
            fs.mkdirSync(fileDir, { recursive: true });
            fs.writeFileSync(filePath, file.content.trim(), 'utf8');
            log(`  + Wrote file: ${filePath}`);
        } else {
            log(`  ✓ File already exists: ${filePath}`);
        }
    }
    log('Android plugin source files injected. Capacitor sync will handle registration.');
}

function injectIosPlugin() {
    log('Checking for iOS platform...');
    const iosDir = path.resolve(projectRoot, 'ios');
    if (!fs.existsSync(iosDir)) {
        log('iOS directory not found, skipping iOS plugin injection.');
        return;
    }

    log('Injecting custom browser plugin files for iOS...');
    for (const file of Object.values(iosPluginFiles)) {
        const filePath = path.resolve(projectRoot, file.path);
        
        try {
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, file.content.trim(), 'utf8');
                log(`  + Created file: ${filePath}`);
            } else {
                log(`  ✓ File already exists: ${filePath}`);
            }
        } catch (e) {
            log(`  ! Error writing file ${filePath}: ${e.message}`);
        }
    }
}

log('Starting native plugin file injection...');
injectAndroidPlugin();
injectIosPlugin();
log('Native plugin file injection finished.');
