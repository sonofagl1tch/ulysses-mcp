#!/bin/bash

# Helper App Code Signing Script
# Signs the UlyssesMCPHelper app to prevent Gatekeeper warnings

set -e

HELPER_APP="helper-app/UlyssesMCPHelper.app"
ENTITLEMENTS_FILE="/tmp/ulysses-mcp-entitlements.plist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔐 Ulysses MCP Helper App Code Signing"
echo "======================================"
echo ""

# Check if helper app exists
if [ ! -d "$HELPER_APP" ]; then
    echo -e "${RED}❌ Error: Helper app not found at $HELPER_APP${NC}"
    echo "Please run 'npm run build-helper' first"
    exit 1
fi

# Create entitlements file
echo "📝 Creating entitlements file..."
cat > "$ENTITLEMENTS_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <false/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
EOF

# Check for Developer ID certificate
CERT_NAME=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed -e 's/.*"\(.*\)"/\1/')

if [ -n "$CERT_NAME" ]; then
    echo -e "${GREEN}✓ Found Developer ID certificate: $CERT_NAME${NC}"
    echo "🔑 Signing with Developer ID (production)..."
    
    codesign --deep --force \
        --options runtime \
        --entitlements "$ENTITLEMENTS_FILE" \
        --sign "$CERT_NAME" \
        --timestamp \
        "$HELPER_APP"
    
    echo -e "${GREEN}✓ Signed with Developer ID${NC}"
    echo ""
    echo "⚠️  To complete notarization for distribution:"
    echo "   1. Create a zip: ditto -c -k --keepParent \"$HELPER_APP\" UlyssesMCPHelper.zip"
    echo "   2. Submit: xcrun notarytool submit UlyssesMCPHelper.zip --apple-id YOUR_EMAIL --team-id TEAM_ID --wait"
    echo "   3. Staple: xcrun stapler staple \"$HELPER_APP\""
    
else
    echo -e "${YELLOW}⚠️  No Developer ID certificate found${NC}"
    echo "Self-signing with ad-hoc signature (development only)..."
    echo ""
    
    codesign --deep --force \
        --entitlements "$ENTITLEMENTS_FILE" \
        --sign - \
        "$HELPER_APP"
    
    echo -e "${GREEN}✓ Self-signed with ad-hoc signature${NC}"
    echo ""
    echo -e "${YELLOW}NOTE: Self-signed apps still require user approval on first run${NC}"
    echo "For production distribution, get an Apple Developer ID:"
    echo "  https://developer.apple.com/support/code-signing/"
fi

# Verify signature
echo ""
echo "🔍 Verifying signature..."
if codesign --verify --deep --strict "$HELPER_APP"; then
    echo -e "${GREEN}✓ Signature valid${NC}"
else
    echo -e "${RED}❌ Signature verification failed${NC}"
    rm -f "$ENTITLEMENTS_FILE"
    exit 1
fi

# Display signature info
echo ""
echo "📋 Signature information:"
codesign -dvv "$HELPER_APP" 2>&1 | grep -E "(Authority|Identifier|Format|Signature|Timestamp)"

# Cleanup
rm -f "$ENTITLEMENTS_FILE"

echo ""
echo -e "${GREEN}✅ Code signing complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Test the app: open -a \"$HELPER_APP\""
echo "  2. Check system preferences if prompted for approval"
echo "  3. Verify it runs without warnings"
