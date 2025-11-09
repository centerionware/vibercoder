
export const content = `
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
        val url = call.getString("url") ?: run {
            call.reject("Must provide a URL")
            return
        }

        bridge.activity.runOnUiThread {
            if (webView == null) {
                // Get the root content view of the activity, which is a safe ViewGroup.
                val container = bridge.activity.findViewById<ViewGroup>(android.R.id.content)

                webView = WebView(context)
                webView?.settings?.javaScriptEnabled = true
                webView?.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        notifyListeners("pageLoaded", null)
                    }
                }
                // Initialize with 0 size; setBounds will position it correctly.
                val layoutParams = FrameLayout.LayoutParams(0, 0)
                webView?.layoutParams = layoutParams
                container.addView(webView)
                webView?.visibility = View.GONE // Start hidden
            }
            webView?.loadUrl(url)
            call.resolve()
        }
    }
    
    @PluginMethod
    fun show(call: PluginCall) {
        bridge.activity.runOnUiThread {
            webView?.visibility = View.VISIBLE
            webView?.bringToFront() // Ensure it's on top of the main webview
            call.resolve()
        }
    }

    @PluginMethod
    fun hide(call: PluginCall) {
        bridge.activity.runOnUiThread {
            webView?.visibility = View.GONE
            call.resolve()
        }
    }
    
    @PluginMethod
    fun setBounds(call: PluginCall) {
        val x = call.getFloat("x") ?: 0f
        val y = call.getFloat("y") ?: 0f
        val width = call.getFloat("width") ?: 0f
        val height = call.getFloat("height") ?: 0f

        bridge.activity.runOnUiThread {
            val layoutParams = FrameLayout.LayoutParams(width.toInt(), height.toInt())
            layoutParams.leftMargin = x.toInt()
            layoutParams.topMargin = y.toInt()
            webView?.layoutParams = layoutParams
            call.resolve()
        }
    }

    @PluginMethod
    fun close(call: PluginCall) {
        bridge.activity.runOnUiThread {
            webView?.let {
                (it.parent as? ViewGroup)?.removeView(it)
                it.destroy()
            }
            webView = null
            notifyListeners("closed", null)
            call.resolve()
        }
    }

    @PluginMethod
    fun executeScript(call: PluginCall) {
        val code = call.getString("code") ?: run {
            call.reject("Must provide code to execute")
            return
        }
        
        bridge.activity.runOnUiThread {
            webView?.evaluateJavascript(code) { result ->
                val ret = JSObject()
                // The result from evaluateJavascript is a JSON string, but we pass it as a plain string.
                // It might also be null or "null".
                val resultString = result?.toString() ?: "null"
                ret.put("value", resultString)
                call.resolve(ret)
            }
        }
    }
}
`;