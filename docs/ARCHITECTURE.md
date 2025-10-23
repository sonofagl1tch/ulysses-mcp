# Ulysses MCP Server - Architecture Documentation

## Overview

The Ulysses MCP Server is a **local-only bridge** between AI assistants and the Ulysses writing application. It operates entirely on your local machine with **zero external network calls** and **no data collection**.

## System Architecture

```mermaid
graph TB
    subgraph "Your Local Machine"
        AI[AI Assistant<br/>Claude/Cline/LM Studio]
        MCP[Ulysses MCP Server<br/>Node.js Process]
        CB[Callback Server<br/>localhost:random-port]
        UL[Ulysses App<br/>macOS Application]
    end
    
    AI -->|MCP Protocol<br/>stdio| MCP
    MCP -->|x-callback-url<br/>open command| UL
    UL -->|HTTP Callback<br/>127.0.0.1| CB
    CB -->|Response Data| MCP
    MCP -->|JSON Response| AI
    
    style AI fill:#e1f5ff
    style MCP fill:#fff4e1
    style CB fill:#f0f0f0
    style UL fill:#e8f5e9
```

### Components

#### 1. AI Assistant (Client)

- Claude Desktop, Cline (VS Code), LM Studio, or any MCP-compatible client
- Communicates via MCP protocol over stdio (standard input/output)
- Sends tool requests and receives responses
- **No network access required**

#### 2. MCP Server (Bridge)

- Node.js application running locally
- Validates and processes tool requests
- Constructs Ulysses x-callback-url commands
- Manages temporary callback servers
- **All processing happens locally**

#### 3. Callback Server (Temporary HTTP Server)

- Dynamically created HTTP server on localhost
- Random ephemeral port (49152-65535)
- Receives responses from Ulysses
- Automatically closes after receiving callback
- **Only accepts connections from 127.0.0.1**

#### 4. Ulysses Application

- macOS writing application
- Processes x-callback-url commands
- Sends responses via HTTP callbacks
- **No external network communication**

## Communication Flow

### Write Operation (No Callback)

```mermaid
sequenceDiagram
    participant AI as AI Assistant
    participant MCP as MCP Server
    participant UL as Ulysses App
    
    AI->>MCP: new-sheet request
    MCP->>MCP: Validate parameters
    MCP->>MCP: Check rate limits
    MCP->>UL: ulysses://x-callback-url/new-sheet
    UL->>UL: Create sheet
    MCP->>AI: Success response
    
    Note over AI,UL: No external network traffic
    Note over MCP,UL: All local communication
```

### Read Operation (With Callback)

```mermaid
sequenceDiagram
    participant AI as AI Assistant
    participant MCP as MCP Server
    participant CB as Callback Server
    participant UL as Ulysses App
    
    AI->>MCP: read-sheet request (with token)
    MCP->>MCP: Validate token & parameters
    MCP->>CB: Start HTTP server on 127.0.0.1
    MCP->>UL: ulysses://x-callback-url/read-sheet<br/>x-success=http://127.0.0.1:port
    UL->>UL: Read sheet content
    UL->>CB: HTTP GET http://127.0.0.1:port/x-success?data=...
    CB->>CB: Parse response
    CB->>CB: Close HTTP server
    CB->>MCP: Return data
    MCP->>AI: Sheet content (JSON)
    
    Note over AI,UL: All communication stays on localhost
    Note over CB: Server only accepts 127.0.0.1
```

## Data Flow & Privacy

### Data Never Leaves Your Machine

```mermaid
graph LR
    subgraph "Your Mac (127.0.0.1)"
        A[AI sends request]
        B[MCP processes]
        C[Ulysses executes]
        D[Data returns]
    end
    
    A --> B
    B --> C
    C --> D
    D --> A
    
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#ffe1e1
```

**Privacy Guarantees:**

1. ✅ **No External Network Calls** - All communication is localhost-only
2. ✅ **No Data Collection** - Server doesn't log or store any content
3. ✅ **No Analytics** - No telemetry or tracking
4. ✅ **No Cloud Services** - No AWS, Google, Azure, or any cloud APIs
5. ✅ **No Third-Party Services** - No external dependencies at runtime
6. ✅ **Open Source** - All code is auditable

### What Data Flows Where?

| Data Type | Source | Destination | Network |
|-----------|--------|-------------|---------|
| Tool Requests | AI Assistant | MCP Server | stdio (no network) |
| X-Callback URLs | MCP Server | Ulysses | macOS `open` command |
| Callback Responses | Ulysses | Callback Server | localhost HTTP |
| Tool Responses | MCP Server | AI Assistant | stdio (no network) |
| Access Tokens | User | Ulysses | User's keychain |
| Sheet Content | Ulysses | AI Assistant | Via MCP (local only) |

**Note:** Access tokens are stored by Ulysses in your macOS keychain, not by the MCP server.

## Security Architecture

### Input Validation Layer

```mermaid
graph TD
    A[Tool Request] --> B{Validate Action}
    B -->|Invalid| C[Reject - Error]
    B -->|Valid| D{Check Rate Limit}
    D -->|Exceeded| E[Reject - Rate Limited]
    D -->|OK| F{Validate Parameters}
    F -->|Invalid| G[Reject - Bad Params]
    F -->|Valid| H{Check Auth Token}
    H -->|Required & Missing| I[Reject - Auth Required]
    H -->|OK| J[Execute Command]
    
    style C fill:#ffebee
    style E fill:#ffebee
    style G fill:#ffebee
    style I fill:#ffebee
    style J fill:#e8f5e9
```

### Security Features

1. **Action Whitelist**
   - Only 23 predefined actions allowed
   - Any other action is rejected
   - Prevents command injection

2. **Command Injection Prevention**

   ```javascript
   // ✅ Safe: Using execFile (not exec)
   await execFileAsync('open', [url]);
   
   // ❌ Unsafe: Never used
   // exec(`open "${url}"`);  // Shell injection risk
   ```

3. **Input Validation**
   - Required parameters checked
   - Enum values validated
   - Length limits enforced (1MB for content, 100KB for notes)
   - Empty values rejected

4. **Rate Limiting**
   - Destructive operations: 10 per minute
   - Prevents accidental mass deletion
   - In-memory tracking (resets on restart)

5. **Callback Security**
   - Random callback IDs
   - 30-second timeout
   - Only accepts connections from 127.0.0.1
   - Automatic cleanup

6. **No Sensitive Data Exposure**
   - Error messages are sanitized
   - Access tokens never logged
   - No debugging output with user data

## Network Topology

```mermaid
graph TB
    subgraph "Local Machine 127.0.0.1"
        subgraph "User Space"
            AI[AI Assistant]
        end
        
        subgraph "MCP Process"
            MCP[MCP Server]
            CB[Callback Servers]
        end
        
        subgraph "Applications"
            UL[Ulysses]
        end
    end
    
    Internet[Internet]
    
    AI <-->|stdio pipe| MCP
    MCP -->|macOS IPC| UL
    UL -->|HTTP 127.0.0.1| CB
    CB -->|in-process| MCP
    
    AI -.->|NO CONNECTION| Internet
    MCP -.->|NO CONNECTION| Internet
    UL -.->|NO CONNECTION| Internet
    
    style Internet fill:#ffebee,stroke:#c62828,stroke-width:3px
    style AI fill:#e1f5ff
    style MCP fill:#fff4e1
    style CB fill:#f0f0f0
    style UL fill:#e8f5e9
```

**Key Point:** There are **NO network connections** to the internet. All communication stays within your local machine.

## Process Lifecycle

### Server Startup

```mermaid
stateDiagram-v2
    [*] --> Init: npm start / node build/index.js
    Init --> LoadSDK: Load MCP SDK
    LoadSDK --> CreateServer: Initialize Server
    CreateServer --> RegisterTools: Register 23 tools
    RegisterTools --> ListenStdio: Listen on stdio
    ListenStdio --> Ready: Ready for requests
    Ready --> [*]: Process exit
```

### Tool Execution Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Receive: Receive tool request
    Receive --> Validate: Validate action & params
    Validate --> AuthCheck: Check if auth required
    AuthCheck --> RateCheck: Check rate limit
    RateCheck --> NeedsCallback: Callback required?
    
    NeedsCallback --> CreateCallback: Yes - Create callback server
    NeedsCallback --> BuildURL: No - Build simple URL
    
    CreateCallback --> BuildCallbackURL: Build URL with callbacks
    BuildCallbackURL --> Execute: Execute via 'open'
    BuildURL --> Execute
    
    Execute --> Wait: Callback? Yes
    Execute --> Success: Callback? No
    
    Wait --> Timeout: 30s timeout
    Wait --> CallbackReceived: Ulysses responds
    
    Timeout --> Error: Return error
    CallbackReceived --> ParseResponse: Parse data
    ParseResponse --> Cleanup: Close callback server
    Cleanup --> Success: Return data
    
    Success --> [*]
    Error --> [*]
```

## Transport Mechanisms

### MCP Protocol (stdio)

The Model Context Protocol uses standard input/output streams:

```
┌─────────────┐         stdin          ┌─────────────┐
│             │ ───────────────────>   │             │
│ AI Assistant│                        │  MCP Server │
│             │ <───────────────────   │             │
└─────────────┘         stdout         └─────────────┘
```

**Benefits:**

- Simple and secure
- No network configuration
- Works in sandboxed environments
- Standard Unix pipe mechanism

### Ulysses x-callback-url

Ulysses uses the x-callback-url specification:

```
ulysses://x-callback-url/[action]?
  param1=value1&
  param2=value2&
  x-success=[successURL]&
  x-error=[errorURL]
```

**Flow:**

1. MCP constructs URL with encoded parameters
2. Uses macOS `open` command to send to Ulysses
3. Ulysses processes action
4. Ulysses calls back to success/error URL
5. MCP receives response and parses data

## Deployment Models

### Standalone Mode (Recommended)

```mermaid
graph TB
    subgraph "MCP Client Config"
        Config["claude_desktop_config.json<br/>or<br/>cline_mcp_settings.json"]
    end
    
    subgraph "MCP Server"
        Node["node build/index.js"]
    end
    
    Config -->|spawn process| Node
    
    style Config fill:#e1f5ff
    style Node fill:#fff4e1
```

**Configuration Example:**

```json
{
  "mcpServers": {
    "ulysses": {
      "command": "node",
      "args": ["/absolute/path/to/ulysses-mcp/build/index.js"]
    }
  }
}
```

### Development Mode

```mermaid
graph TB
    Dev[Developer] -->|npm run build| Build[Build TypeScript]
    Build -->|tsc| JS[JavaScript in build/]
    Dev -->|npm run inspector| Inspector[MCP Inspector]
    Inspector -->|spawn| Server[MCP Server]
    Server -->|test tools| Ulysses[Ulysses]
    
    style Dev fill:#e1f5ff
    style Server fill:#fff4e1
    style Ulysses fill:#e8f5e9
```

## Performance Characteristics

### Latency Profile

| Operation Type | Typical Latency | Notes |
|----------------|-----------------|-------|
| Write Operations | 100-500ms | No callback, fire-and-forget |
| Read Operations | 500-2000ms | Callback required, includes Ulysses processing |
| Authorization | 2000-10000ms | User must approve in Ulysses |
| Tool Validation | <1ms | Local validation, very fast |

### Resource Usage

- **Memory:** ~50-100 MB (Node.js process)
- **CPU:** Negligible when idle, spikes during operations
- **Disk:** None (no logging or caching)
- **Network:** Zero external connections

### Scalability

- **Concurrent Operations:** Limited by Ulysses processing capacity
- **Rate Limits:** 10 destructive operations per minute
- **Callback Servers:** One per operation requiring callback
- **Maximum Throughput:** ~10-20 operations per minute (practical limit)

## Error Handling

```mermaid
graph TD
    A[Tool Request] --> B{Valid?}
    B -->|No| C[Input Validation Error]
    B -->|Yes| D{Rate OK?}
    D -->|No| E[Rate Limit Error]
    D -->|Yes| F{Auth OK?}
    F -->|No| G[Auth Required Error]
    F -->|Yes| H[Execute]
    H --> I{Success?}
    I -->|Yes| J[Return Data]
    I -->|No| K{Callback Timeout?}
    K -->|Yes| L[Timeout Error]
    K -->|No| M[Ulysses Error]
    
    style C fill:#ffebee
    style E fill:#ffebee
    style G fill:#ffebee
    style L fill:#ffebee
    style M fill:#ffebee
    style J fill:#e8f5e9
```

### Error Types

1. **Input Validation Errors** - Invalid parameters, missing required fields
2. **Rate Limit Errors** - Too many destructive operations
3. **Authorization Errors** - Missing or invalid access token
4. **Timeout Errors** - Ulysses didn't respond within 30 seconds
5. **Ulysses Errors** - Ulysses returned an error response

## Monitoring & Observability

**What's Logged:**

- ✅ Server startup/shutdown
- ✅ Callback server creation (port number only)
- ✅ Error types (sanitized)

**What's NOT Logged:**

- ❌ User content or sheet data
- ❌ Access tokens
- ❌ File paths or identifiers
- ❌ Any personally identifiable information

**Debugging:**

- Use `npm run inspector` for interactive testing
- Check MCP client logs for stdio communication issues
- Ulysses Console (Help → Show Console) for x-callback-url issues

## Future Architecture Considerations

### Potential Enhancements

1. **WebSocket Support** (if MCP adds it)
2. **Batch Operations** (multiple operations in one request)
3. **Caching Layer** (for frequently read sheets)
4. **Enhanced Rate Limiting** (per-operation type)

### What Will NOT Change

- ✅ Local-only operation
- ✅ No external network calls
- ✅ No data collection
- ✅ Open source transparency
- ✅ User privacy and security first

---

**Last Updated:** October 2025  
**Version:** 0.1.0
