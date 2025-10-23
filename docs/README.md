# Ulysses MCP Server Documentation

Welcome to the comprehensive documentation for the Ulysses MCP Server. This documentation provides detailed information about architecture, security, privacy, and authentication.

## 📚 Documentation Overview

### [Architecture Documentation](./ARCHITECTURE.md)

**Deep dive into how the MCP server works**

- System architecture and components
- Communication flows and protocols
- Data flow diagrams
- Network topology
- Process lifecycle
- Performance characteristics
- Error handling

**Key Topics:**

- Local-only operation model
- MCP protocol over stdio
- Ulysses x-callback-url integration
- Callback server architecture
- Security features and validation

### [Authentication & Authorization](./AUTHENTICATION.md)

**Understanding access control and tokens**

- Authorization flow and lifecycle
- Access token management
- Authorization levels (operations requiring auth vs. not)
- Token security and storage
- Managing authorized applications
- Revoking access
- Best practices

**Key Topics:**

- User-controlled authorization model
- macOS Keychain integration
- Token lifecycle management
- Security implications
- Troubleshooting auth issues

### [Privacy & Security](./PRIVACY.md)

**Privacy guarantees and security measures**

- Privacy statement and guarantees
- Data processing (what flows, what doesn't)
- Network activity verification
- Security features (input validation, rate limiting, etc.)
- Threat model
- Compliance (GDPR-friendly)
- Verification and auditing

**Key Topics:**

- Zero data collection
- No external network calls
- Command injection prevention
- Local-only architecture
- Open source transparency

## 🔐 Security Summary

### What Makes This Secure?

✅ **Local-Only Operation**

- All processing on your machine
- No internet connections
- No external APIs

✅ **Privacy-First Design**

- Zero data collection
- No logging of content
- No analytics or telemetry

✅ **Transparent & Auditable**

- Open source code
- Clear documentation
- Verifiable claims

✅ **User Control**

- Explicit authorization required
- Easy revocation
- Full access visibility

### Security Features

| Feature | Implementation | Benefit |
|---------|---------------|---------|
| **Action Whitelist** | Only 23 predefined actions | Prevents arbitrary commands |
| **Input Validation** | All params validated | Prevents injection attacks |
| **Command Safety** | Uses `execFile` not `exec` | No shell injection |
| **Rate Limiting** | 10 destructive ops/min | Prevents mass deletion |
| **Callback Security** | localhost-only, short-lived | No network exposure |
| **Error Sanitization** | No sensitive data in errors | No data leakage |
| **No Storage** | No disk writes | No data retention |
| **No Logging** | No persistent logs | No tracking |

## 🔒 Privacy Summary

### Privacy Guarantees

| Aspect | Status | Details |
|--------|--------|---------|
| **Data Collection** | ❌ None | We collect zero data |
| **External Connections** | ❌ None | No internet traffic |
| **Analytics** | ❌ None | No telemetry or tracking |
| **Cloud Services** | ❌ None | Fully local |
| **Data Storage** | ❌ None | No persistent storage |
| **Logging** | ❌ None | No content logging |

### What Data Flows Where?

```
┌─────────────────────────────────────────────┐
│  YOUR MACHINE (127.0.0.1 ONLY)             │
│                                             │
│  Ulysses ←→ MCP Server ←→ AI Assistant     │
│                                             │
│  ✅ All communication stays local           │
│  ❌ No data leaves your machine             │
│  ❌ No cloud services involved              │
│                                             │
└─────────────────────────────────────────────┘
```

## 🎯 Quick Reference

### Essential Reading for Different Users

**For New Users:**

1. Start with the main [README.md](../README.md) for installation
2. Read [Authorization workflow](./AUTHENTICATION.md#authorization-workflow)
3. Review [Privacy Statement](./PRIVACY.md#privacy-statement)

**For Security-Conscious Users:**

1. Review [Privacy & Security](./PRIVACY.md) completely
2. Check [Threat Model](./PRIVACY.md#threat-model)
3. Verify claims with [Verification Guide](./PRIVACY.md#verification--auditing)

**For Developers:**

1. Study [Architecture Documentation](./ARCHITECTURE.md)
2. Review [Communication Flow](./ARCHITECTURE.md#communication-flow)
3. Understand [Security Architecture](./ARCHITECTURE.md#security-architecture)

**For Enterprise/Corporate Users:**

1. Review [Compliance & Standards](./PRIVACY.md#compliance--standards)
2. Check [AI Assistant Privacy](./PRIVACY.md#ai-assistant-privacy)
3. Understand [Trust Boundaries](./PRIVACY.md#trust-boundaries)

## 📊 Architecture Diagrams

### System Overview

```
┌──────────────────────────────────────────────────┐
│  Your Local Machine                              │
│                                                  │
│  ┌────────────┐    stdio    ┌──────────────┐   │
│  │ AI         │◄───────────►│ MCP          │   │
│  │ Assistant  │             │ Server       │   │
│  └────────────┘             └──────┬───────┘   │
│                                    │            │
│                              x-callback-url     │
│                                    │            │
│                             ┌──────▼───────┐   │
│                             │ Ulysses      │   │
│                             │ App          │   │
│                             └──────────────┘   │
│                                                  │
│  ⚠️  NO EXTERNAL NETWORK CONNECTIONS            │
└──────────────────────────────────────────────────┘
```

### Data Flow

```
User Request
    ↓
AI Assistant (processes request)
    ↓
MCP Server (validates & routes)
    ↓
Ulysses (executes operation)
    ↓
MCP Server (receives result)
    ↓
AI Assistant (returns to user)
    ↓
User

ALL COMMUNICATION STAYS LOCAL
```

## 🛡️ Authorization Levels

### Operations Without Authorization

These work immediately without an access token:

- ✅ Creating sheets and groups
- ✅ Adding content (insert, attach notes/keywords/images)
- ✅ Navigation (open sheets/groups/sections)
- ✅ Non-destructive operations

### Operations Requiring Authorization

These need an access token:

- 🔐 Reading sheet content
- 🔐 Getting library structure
- 🔐 Moving or deleting content
- 🔐 Modifying titles
- 🔐 Destructive operations

**Get Authorization:**

```
AI Assistant → ulysses_authorize → User Approves → Access Token
```

## 📝 Common Tasks

### Task: Verify No External Network Access

```bash
# Method 1: Monitor with tcpdump
sudo tcpdump -i any host not 127.0.0.1

# Method 2: Check connections
netstat -an | grep ESTABLISHED | grep -v 127.0.0.1

# Method 3: Use Little Snitch (macOS app)
# Watch for any outbound connections from node process
```

### Task: Audit Source Code

```bash
# Clone and review
git clone https://github.com/sonofagl1tch/ulysses-mcp.git
cd ulysses-mcp

# Check for external URLs
grep -r "http://" src/
grep -r "https://" src/

# Review main code
cat src/index.ts

# Check dependencies
cat package.json
npm list
```

### Task: Revoke Authorization

1. Open Ulysses
2. Go to **Ulysses → Preferences → Privacy**
3. Find the application in the list
4. Click **Revoke**

## ❓ FAQ

### Is this safe to use with sensitive content?

Yes, with caveats:

- ✅ The MCP server itself is completely local and private
- ⚠️ The AI assistant you use may have different privacy policies
- ✅ For maximum privacy, use local-only AI (Ollama, LM Studio)
- ⚠️ Cloud AI (Claude, ChatGPT) may store conversations

### Does this send my writing to the cloud?

**No.** The MCP server makes zero external network connections. All processing is local-only.

However, the AI assistant you connect it to might send data to the cloud (depending on which one you use).

### Can the developers see my data?

**No.** We (the developers) have no visibility into your data. The server runs entirely on your machine with no telemetry or reporting.

### How do I verify the privacy claims?

See [Verification & Auditing](./PRIVACY.md#verification--auditing) for detailed instructions on:

- Monitoring network traffic
- Reviewing source code
- Checking file system activity
- Inspecting dependencies

## 🔗 Additional Resources

### External Documentation

- [Ulysses x-callback-url API](https://github.com/ulyssesapp/x-callback-documentation)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)

### Related Files

- [Main README](../README.md) - Installation and usage
- [SECURITY.md](../SECURITY.md) - Security policy
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contributing guidelines
- [CHANGELOG.md](../CHANGELOG.md) - Version history

## 📧 Support & Contact

### For Documentation Issues

- Found a typo or unclear section?
- Have suggestions for improvement?
- Need additional diagrams or explanations?

Open an issue on GitHub with the `documentation` label.

### For Security Concerns

- **Public questions:** Open a GitHub Discussion
- **Security vulnerabilities:** Use GitHub Security Advisories (private)
- See [SECURITY.md](../SECURITY.md) for full details

### For Privacy Questions

- Review this documentation first
- Check [Privacy FAQ](./PRIVACY.md#frequently-asked-questions)
- Still have questions? Open a GitHub Discussion

---

**Documentation Version:** 1.0  
**Last Updated:** October 2025  
**MCP Server Version:** 0.1.0
