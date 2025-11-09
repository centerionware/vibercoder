export const content = `
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
                webConfiguration.allowsInlineMediaPlayback = true
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
        let x = bounds["x"] as? Double ?? 0
        let y = bounds["y"] as? Double ?? 0
        let width = bounds["width"] as? Double ?? 0
        let height = bounds["height"] as? Double ?? 0

        DispatchQueue.main.async {
            // Ensure the main view has its layout updated before calculating frames
            self.bridge?.viewController?.view.layoutIfNeeded()
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
`;
