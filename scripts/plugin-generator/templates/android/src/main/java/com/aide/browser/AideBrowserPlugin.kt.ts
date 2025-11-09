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
                // The result from evaluateJavascript is a JSON string of the JS result.
                // We need to parse it if it's a string, otherwise it's just the value.
                // For simplicity, we pass it back as a string to be handled by JS side.
                val jsResult = result ?: "null"
                val ret = JSObject()
                ret.put("value", jsResult)
                call.resolve(ret)
            }
        }
    }
}
`;
