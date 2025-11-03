import Foundation
import Cocoa
import AppKit

class UlyssesMCPHelper: NSObject, NSApplicationDelegate {
    var socketPath: String = "/tmp/ulysses-mcp-\(getpid()).sock"
    var shouldKeepRunning = true
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        print("Ulysses MCP Helper started")
        print("Socket path: \(socketPath)")
        
        // Register for URL events
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleURLEvent(_:withReplyEvent:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
        
        // Create socket path file for the MCP server to discover
        let socketInfoPath = "/tmp/ulysses-mcp-helper-socket.txt"
        try? socketPath.write(toFile: socketInfoPath, atomically: true, encoding: .utf8)
        
        print("Helper app ready to receive callbacks")
        print("Waiting for URLs with scheme: ulysses-mcp-callback://")
    }
    
    @objc func handleURLEvent(_ event: NSAppleEventDescriptor, withReplyEvent: NSAppleEventDescriptor) {
        guard let urlString = event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue,
              let url = URL(string: urlString) else {
            print("ERROR: Could not parse URL from event")
            return
        }
        
        print("Received callback URL: \(urlString)")
        
        // Parse the URL components
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            print("ERROR: Could not parse URL components")
            return
        }
        
        // Extract callback data from query parameters
        var callbackData: [String: String] = [:]
        components.queryItems?.forEach { item in
            callbackData[item.name] = item.value ?? ""
        }
        
        // Get the callback ID
        guard let callbackId = callbackData["callbackId"] else {
            print("ERROR: No callbackId in callback URL")
            return
        }
        
        print("Callback ID: \(callbackId)")
        print("Callback data: \(callbackData)")
        
        // Determine if this is success or error callback
        let isError = url.path.contains("/x-error")
        
        // Send data to MCP server via Unix socket
        sendToMCPServer(callbackId: callbackId, data: callbackData, isError: isError)
    }
    
    func sendToMCPServer(callbackId: String, data: [String: String], isError: Bool) {
        // Create a response payload
        var response: [String: Any] = [
            "callbackId": callbackId,
            "isError": isError,
            "data": data
        ]
        
        // Convert to JSON
        guard let jsonData = try? JSONSerialization.data(withJSONObject: response, options: []),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            print("ERROR: Could not serialize callback data to JSON")
            return
        }
        
        // Write to secure temp directory for the MCP server to read
        let homeDir = FileManager.default.homeDirectoryForCurrentUser.path
        let secureTempDir = "\(homeDir)/Library/Application Support/ulysses-mcp/tmp"
        
        // Create directory if it doesn't exist
        try? FileManager.default.createDirectory(atPath: secureTempDir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        
        let socketDataPath = "\(secureTempDir)/callback-\(callbackId).json"
        do {
            try jsonString.write(toFile: socketDataPath, atomically: true, encoding: .utf8)
            print("Wrote callback data to: \(socketDataPath)")
        } catch {
            print("ERROR: Could not write callback data: \(error)")
        }
    }
    
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false // Keep running in background
    }
}

// Main entry point
let app = NSApplication.shared
let helper = UlyssesMCPHelper()
app.delegate = helper

// Run without showing in Dock or menu bar
app.setActivationPolicy(.accessory)

// Write PID file so MCP server can manage the helper process
let homeDir = FileManager.default.homeDirectoryForCurrentUser.path
let secureTempDir = "\(homeDir)/Library/Application Support/ulysses-mcp/tmp"

// Create directory if it doesn't exist
try? FileManager.default.createDirectory(atPath: secureTempDir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])

let pidPath = "\(secureTempDir)/helper.pid"
try? "\(getpid())".write(toFile: pidPath, atomically: true, encoding: .utf8)

print("Helper PID: \(getpid())")
app.run()
