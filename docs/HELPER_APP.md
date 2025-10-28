# Ulysses MCP Helper App

## Overview

The Ulysses MCP Helper App is a lightweight macOS application that acts as a bridge between the Ulysses MCP Server and Ulysses itself. It's required because Ulysses blocks HTTP/HTTPS callback URLs for security reasons.

## Architecture

```
┌─────────────┐
│   Ulysses   │
└──────┬──────┘
       │ ulysses-mcp-callback://...
       ▼
┌─────────────────────┐
│  Helper Mac App     │
│  (URL Handler)      │
└──────┬──────────────┘
       │ File-based IPC
       ▼
┌─────────────────────┐
│  MCP Server         │
│  (Node.js)          │
└─────────────────────┘
```

## How It Works

1. **Custom URL Scheme**: The helper app registers the `ulysses-mcp-callback://` URL scheme with macOS
2. **Callback Reception**: When Ulysses executes a callback, it uses this custom URL scheme instead of HTTP
3. **Data Transfer**: The helper app receives the callback and writes the data to a temporary file
4. **MCP Server Polling**: The MCP server polls for this file and reads the response data
5. **Cleanup**: Both the helper app and MCP server clean up temporary files after use

## Building the Helper App

### Prerequisites

- macOS 10.15 (Catalina) or later
- Xcode Command Line Tools installed (`xcode-select --install`)
- Swift compiler available

### Build Instructions

```bash
# From the project root directory
npm run build-helper
```

This will:

1. Compile the Swift source code
2. Create a macOS application bundle
3. Copy the Info.plist configuration
4. Register the custom URL scheme with macOS
5. (Optional) Code sign the application

The compiled app will be located at: `helper-app/UlyssesMCPHelper.app`

### Manual Build

If you need to build manually:

```bash
cd helper-app
swiftc -o UlyssesMCPHelper.app/Contents/MacOS/UlyssesMCPHelper \
    UlyssesMCPHelper.swift \
    -framework Cocoa \
    -framework AppKit
```

## Running the Helper App

### Automatic Startup

The MCP server automatically starts the helper app when needed. You don't need to manually launch it.

### Manual Startup

If you need to manually test the helper app:

```bash
open -a helper-app/UlyssesMCPHelper.app
```

Or run the Swift file directly for development:

```bash
swift helper-app/UlyssesMCPHelper.swift
```

### Checking if Helper is Running

```bash
# Check PID file
cat /tmp/ulysses-mcp-helper.pid

# Or search for the process
ps aux | grep UlyssesMCPHelper
```

## Helper App Behavior

### Background Operation

- The helper app runs as an **accessory** application
- It does not appear in the Dock
- It does not show in the menu bar
- It runs silently in the background

### URL Scheme Registration

The helper app registers the `ulysses-mcp-callback` URL scheme. This allows it to receive callbacks from Ulysses:

- Success callbacks: `ulysses-mcp-callback://x-success?callbackId=...&data=...`
- Error callbacks: `ulysses-mcp-callback://x-error?callbackId=...&errorMessage=...`

### File-Based IPC

The helper app communicates with the MCP server using temporary files:

- **PID File**: `/tmp/ulysses-mcp-helper.pid` - Contains the helper app's process ID
- **Socket Info**: `/tmp/ulysses-mcp-helper-socket.txt` - Socket path (currently unused)
- **Callback Files**: `/tmp/ulysses-mcp-callback-{callbackId}.json` - Callback data

### Lifecycle

1. **Startup**: Helper app starts, creates PID file, registers URL handler
2. **Waiting**: App waits for callback URLs from Ulysses
3. **Callback Received**: Parses URL, extracts data, writes to temp file
4. **Cleanup**: MCP server reads file and deletes it
5. **Shutdown**: Helper app can be terminated manually or will exit on system logout

## Troubleshooting

### Helper App Won't Start

**Symptom**: MCP server reports "Helper app failed to start"

**Solutions**:

1. Check if Swift compiler is available: `which swift`
2. Rebuild the helper app: `npm run build-helper`
3. Check build errors in the output
4. Verify file permissions: `ls -la helper-app/UlyssesMCPHelper.app`

### URL Scheme Not Registered

**Symptom**: Callbacks from Ulysses don't reach the helper app

**Solutions**:

1. Manually register the app:

   ```bash
   /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f helper-app/UlyssesMCPHelper.app
   ```

2. Check URL scheme registration:

   ```bash
   /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -dump | grep ulysses-mcp-callback
   ```

3. Restart the helper app
4. Rebuild the helper app: `npm run build-helper`

### Callbacks Timing Out

**Symptom**: MCP operations timeout waiting for callbacks

**Solutions**:

1. Ensure Ulysses is running
2. Check if helper app is running: `cat /tmp/ulysses-mcp-helper.pid`
3. Check helper app logs (if running in terminal)
4. Verify callback file permissions: `ls -la /tmp/ulysses-mcp-callback-*.json`
5. Check macOS security settings for app permissions

### Multiple Helper Instances

**Symptom**: Multiple helper apps running simultaneously

**Solution**:

```bash
# Kill all helper instances
pkill -f UlyssesMCPHelper

# Remove stale PID file
rm /tmp/ulysses-mcp-helper.pid

# Restart the MCP server
```

### Stale Callback Files

**Symptom**: Old callback files accumulating in /tmp

**Solution**:

```bash
# Clean up old callback files
rm /tmp/ulysses-mcp-callback-*.json
```

## Security Considerations

### Local Only

- All communication happens locally on your machine
- No network connections are made
- No data is sent to external servers

### Temporary Files

- Callback data is written to `/tmp` directory
- Files are deleted immediately after being read
- File names include unique callback IDs to prevent conflicts
- macOS automatically cleans /tmp on reboot

### Process Isolation

- Helper app runs with your user permissions
- Cannot access other user accounts
- Cannot access files outside normal user scope

### URL Scheme Security

- Only accepts URLs from registered scheme
- Validates callback ID before processing
- Rejects malformed or unexpected URLs

## Development

### Source Files

- `helper-app/UlyssesMCPHelper.swift` - Main Swift source code
- `helper-app/Info.plist` - App bundle configuration
- `scripts/build-helper.sh` - Build script

### Modifying the Helper App

After making changes to the Swift code:

```bash
# Rebuild
npm run build-helper

# Test manually
open -a helper-app/UlyssesMCPHelper.app

# Or run directly for debugging
swift helper-app/UlyssesMCPHelper.swift
```

### Debugging

To see debug output, run the helper app manually in a terminal:

```bash
swift helper-app/UlyssesMCPHelper.swift
```

This will show:

- Startup messages
- URL scheme registration confirmation
- Received callbacks
- Data written to files
- Any errors

### Adding Features

The helper app is intentionally minimal. If you need to add features:

1. Modify `UlyssesMCPHelper.swift`
2. Update `Info.plist` if needed (e.g., new permissions)
3. Rebuild with `npm run build-helper`
4. Test thoroughly
5. Update this documentation

## Distribution

### Including in MCP Server Package

The helper app should be distributed with the MCP server:

1. Build the helper app: `npm run build-helper`
2. The app bundle is in `helper-app/UlyssesMCPHelper.app`
3. Include this directory when packaging the MCP server

### User Installation

Users need to:

1. Install the MCP server as usual
2. Run `npm run build-helper` once to build the helper app
3. The MCP server will automatically start the helper app when needed

### Code Signing (Optional)

For distribution, you may want to code sign the helper app:

```bash
# Sign with your Apple Developer ID
codesign --force --deep --sign "Developer ID Application: Your Name" helper-app/UlyssesMCPHelper.app

# Verify signature
codesign --verify --deep --verbose helper-app/UlyssesMCPHelper.app
```

Note: Code signing is optional for personal use but recommended for distribution.

## Technical Details

### URL Scheme Format

Callback URLs follow this format:

```
ulysses-mcp-callback://x-success?callbackId=authorize-1234567890-abc123&token=xxx&apiVersion=3
ulysses-mcp-callback://x-error?callbackId=authorize-1234567890-abc123&errorMessage=User%20denied
```

### Callback Data Format

Data written to temporary files is JSON:

```json
{
  "callbackId": "authorize-1234567890-abc123",
  "isError": false,
  "data": {
    "token": "demotoken-abc123...",
    "apiVersion": "3"
  }
}
```

### Performance

- Helper app startup: < 1 second
- Callback processing: < 100ms
- File write: < 10ms
- Memory usage: ~10-20 MB
- CPU usage: Negligible when idle

## FAQ

### Q: Do I need to keep the helper app running manually?

**A**: No. The MCP server automatically starts it when needed.

### Q: Will the helper app run on startup?

**A**: No. It only runs when the MCP server needs to receive callbacks from Ulysses.

### Q: Can I run multiple MCP servers?

**A**: Yes, but they will share the same helper app instance. The callback ID system prevents conflicts.

### Q: What happens if the helper app crashes?

**A**: The MCP server will automatically restart it on the next callback operation.

### Q: Can I uninstall the helper app?

**A**: Yes. Simply delete the `helper-app/UlyssesMCPHelper.app` directory. The MCP server will fall back to running the Swift file directly.

### Q: Does this work on Apple Silicon (M1/M2/M3)?

**A**: Yes. Swift compiles natively for both Intel and Apple Silicon Macs.

---

**Last Updated**: October 2025  
**Version**: 0.1.0
