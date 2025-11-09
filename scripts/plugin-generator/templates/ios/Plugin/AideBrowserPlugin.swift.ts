
export const content = `
import Foundation
import Capacitor
import WebKit

@objc(AideBrowserPlugin)
public class AideBrowserPlugin: CAPPlugin, WKNavigationDelegate {
    
    private var browserWebView: WKWebView?

    @objc func open(_ call: CAPPluginCall) {
        let urlString = call.getString("url") ?? ""
        guard let url = URL(string: urlString) else {
            call.reject("Invalid URL")
            return
        }

        DispatchQueue.main.async {
            if self.browserWebView == nil {
                let webConfiguration = WKWebViewConfiguration()
                self.browserWebView = WKWebView(frame: .zero, configuration: webConfiguration)
                self.browserWebView?.navigationDelegate = self
                self.browserWebView?.isHidden = true
                // Add the new webview as a subview of the main view controller's view.
                // This makes it a sibling of the main Capacitor webview, which is better for layout.
                self.bridge?.viewController?.view.addSubview(self.browserWebView!)
            }
            
            let request = URLRequest(url: url)
            self.browserWebView?.load(request)
            call.resolve()
        }
    }

    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.browserWebView?.isHidden = false
            // Bring to front if other views were added
            if let wv = self.browserWebView {
                self.bridge?.viewController?.view.bringSubviewToFront(wv)
            }
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.browserWebView?.isHidden = true
            call.resolve()
        }
    }

    @objc func setBounds(_ call: CAPPluginCall) {
        let x = call.getDouble("x") ?? 0
        let y = call.getDouble("y") ?? 0
        let width = call.getDouble("width") ?? 0
        let height = call.getDouble("height") ?? 0
        
        DispatchQueue.main.async {
            guard let bridgeWebView = self.bridge?.webView else {
                call.reject("Bridge webview not available")
                return
            }
            
            // getBoundingClientRect() provides coordinates relative to the web viewport.
            // We need to convert these to be relative to the screen's coordinate space
            // by adding the origin of the main Capacitor webView, which accounts for
            // safe areas and status bars.
            let webViewFrame = bridgeWebView.frame
            
            let newX = webViewFrame.origin.x + x
            let newY = webViewFrame.origin.y + y
            
            self.browserWebView?.frame = CGRect(x: newX, y: newY, width: width, height: height)
            call.resolve()
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.browserWebView?.removeFromSuperview()
            self.browserWebView = nil
            self.notifyListeners("closed", data: nil)
            call.resolve()
        }
    }
    
    @objc func executeScript(_ call: CAPPluginCall) {
        let code = call.getString("code") ?? ""
        
        DispatchQueue.main.async {
            guard let webView = self.browserWebView else {
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

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        self.notifyListeners("pageLoaded", data: nil)
    }
}
`;