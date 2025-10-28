#!/bin/bash

# Build script for Ulysses MCP Helper App
# This script compiles the Swift helper app into a macOS application bundle

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HELPER_DIR="$PROJECT_ROOT/helper-app"
BUILD_DIR="$HELPER_DIR/UlyssesMCPHelper.app"
CONTENTS_DIR="$BUILD_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

echo "Building Ulysses MCP Helper App..."
echo "Project root: $PROJECT_ROOT"
echo "Helper directory: $HELPER_DIR"

# Clean previous build
if [ -d "$BUILD_DIR" ]; then
    echo "Cleaning previous build..."
    rm -rf "$BUILD_DIR"
fi

# Create app bundle structure
echo "Creating app bundle structure..."
mkdir -p "$MACOS_DIR"
mkdir -p "$RESOURCES_DIR"

# Compile Swift file
echo "Compiling Swift source..."
swiftc -o "$MACOS_DIR/UlyssesMCPHelper" \
    "$HELPER_DIR/UlyssesMCPHelper.swift" \
    -framework Cocoa \
    -framework AppKit

if [ $? -ne 0 ]; then
    echo "ERROR: Swift compilation failed!"
    exit 1
fi

# Copy Info.plist
echo "Copying Info.plist..."
cp "$HELPER_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"

# Make executable
chmod +x "$MACOS_DIR/UlyssesMCPHelper"

# Try to code sign if possible (optional)
if command -v codesign &> /dev/null; then
    echo "Attempting to code sign app..."
    codesign --force --deep --sign - "$BUILD_DIR" 2>/dev/null || echo "Warning: Code signing failed (continuing anyway)"
fi

# Register the URL scheme
echo "Registering URL scheme..."
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$BUILD_DIR"

echo ""
echo "✅ Build complete!"
echo "Helper app location: $BUILD_DIR"
echo ""
echo "To test the helper app:"
echo "  open -a '$BUILD_DIR'"
echo ""
echo "To register the URL scheme (if not automatic):"
echo "  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f '$BUILD_DIR'"
echo ""
