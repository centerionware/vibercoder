export const content = `
import Foundation
import Capacitor
import WebKit

@objc(AideBrowserPlugin)
public class AideBrowserPlugin: CAPPlugin, WKNavigationDelegate {
    
    private var webView: WKWebView?

    @objc func open(_ call: CAPPluginCall) {
        let urlString = call.getString("url") ?? ""
        guard let url = URL(string: urlString) else {
            call.reject("Invalid URL")
            return
        }

        DispatchQueue.main.async {
            if self.webView == nil {
                let webConfiguration = WKWebViewConfiguration()
                self.webView = WKWebView(frame: .zero, configuration: webConfiguration)
                self.webView?.navigationDelegate = self
                self.webView?.isHidden = true
                self.bridge?.viewController?.view.addSubview(self.webView!)
            }
            
            let request = URLRequest(url: url)
            self.webView?.load(request)
            call.resolve()
        }
    }

    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.webView?.isHidden = false
            // Bring to front if other views were added
            if let wv = self.webView {
                self.bridge?.viewController?.view.bringSubviewToFront(wv)
            }
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.webView?.isHidden = true
            call.resolve()
        }
    }

    @objc func setBounds(_ call: CAPPluginCall) {
        let x = call.getDouble("x") ?? 0
        let y = call.getDouble("y") ?? 0
        let width = call.getDouble("width") ?? 0
        let height = call.getDouble("height") ?? 0
        
        // Convert screen points from webview to native view coordinates.
        // The webview's coordinate system has its origin at the top-left of the web content,
        // while the native view's coordinate system has its origin at the top-left of the screen.
        let frame = self.bridge?.webView?.frame ?? .zero
        let nativeX = x / Double(self.bridge?.webView?.scrollView.zoomScale ?? 1.0) + Double(frame.origin.x)
        let nativeY = y / Double(self.bridge?.webView?.scrollView.zoomScale ?? 1.0) + Double(frame.origin.y)
        let nativeWidth = width / Double(self.bridge?.webView?.scrollView.zoomScale ?? 1.0)
        let nativeHeight = height / Double(self.bridge?.webView?.scrollView.zoomScale ?? 1.0)

        DispatchQueue.main.async {
            self.webView?.frame = CGRect(x: nativeX, y: nativeY, width: nativeWidth, height: nativeHeight)
            call.resolve()
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.webView?.removeFromSuperview()
            self.webView = nil
            self.notifyListeners("closed", data: nil)
            call.resolve()
        }
    }
    
    @objc func executeScript(_ call: CAPPluginCall) {
        let code = call.getString("code") ?? ""
        
        DispatchQueue.main.async {
            guard let webView = self.webView else {
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
