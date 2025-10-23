#!/usr/bin/env node

/**
 * Ulysses MCP Server
 * 
 * This MCP server provides tools to interact with the Ulysses writing application
 * via its x-callback-url API. It allows AI assistants like Cline, Ollama, and LM Studio
 * to create sheets, manage groups, insert text, attach notes and keywords, read content,
 * and navigate the Ulysses library.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "child_process";
import { promisify } from "util";
import * as http from "http";

const execFileAsync = promisify(execFile);

// Callback server state
interface CallbackState {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

const callbackServers = new Map<number, http.Server>();
const pendingCallbacks = new Map<string, CallbackState>();
const CALLBACK_TIMEOUT_MS = 30000; // 30 seconds

// Actions that require callbacks to receive data
const CALLBACK_ACTIONS = new Set([
  "authorize",
  "read-sheet",
  "get-item",
  "get-root-items",
  "get-version"
]);

// Whitelist of allowed Ulysses API actions
const ALLOWED_ACTIONS = new Set([
  "new-sheet",
  "new-group",
  "insert",
  "attach-note",
  "attach-keywords",
  "attach-image",
  "open",
  "open-all",
  "open-recent",
  "open-favorites",
  "get-version",
  "authorize",
  "read-sheet",
  "get-item",
  "get-root-items",
  "move",
  "copy",
  "trash",
  "set-group-title",
  "set-sheet-title",
  "remove-keywords",
  "update-note",
  "remove-note"
]);

// Rate limiting state (simple in-memory rate limiter)
const rateLimitState = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_DESTRUCTIVE_OPS_PER_MINUTE = 10;

const DESTRUCTIVE_ACTIONS = new Set([
  "trash",
  "move",
  "set-group-title",
  "set-sheet-title",
  "remove-keywords",
  "remove-note",
  "update-note"
]);

/**
 * URL-encodes a parameter value
 */
function encodeParam(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Validates that a required parameter is present and non-empty
 */
function validateRequired(value: unknown, fieldName: string): string {
  if (value === undefined || value === null) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${fieldName} is required`
    );
  }
  
  const strValue = String(value).trim();
  if (strValue === '') {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${fieldName} cannot be empty`
    );
  }
  
  return strValue;
}

/**
 * Validates that an enum value is one of the allowed values
 */
function validateEnum(value: string | undefined, allowedValues: string[], fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  
  if (!allowedValues.includes(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${fieldName} must be one of: ${allowedValues.join(', ')}`
    );
  }
  
  return value;
}

/**
 * Validates that a string length is within reasonable bounds
 */
function validateLength(value: string, maxLength: number, fieldName: string): string {
  if (value.length > maxLength) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${fieldName} exceeds maximum length of ${maxLength} characters`
    );
  }
  return value;
}

/**
 * Checks rate limit for destructive operations
 */
function checkRateLimit(action: string): void {
  if (!DESTRUCTIVE_ACTIONS.has(action)) {
    return; // No rate limit for non-destructive operations
  }
  
  const now = Date.now();
  const state = rateLimitState.get(action);
  
  if (!state || now > state.resetTime) {
    // Reset or initialize rate limit
    rateLimitState.set(action, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    });
    return;
  }
  
  if (state.count >= MAX_DESTRUCTIVE_OPS_PER_MINUTE) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Rate limit exceeded for ${action}. Please wait before trying again.`
    );
  }
  
  state.count++;
}

/**
 * Find an available port for the callback server
 */
async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to get port')));
      }
    });
    server.on('error', reject);
  });
}

/**
 * Create a callback server for receiving Ulysses responses
 */
async function createCallbackServer(callbackId: string): Promise<{ port: number; promise: Promise<any> }> {
  const port = await findAvailablePort();
  
  const callbackPromise = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCallbacks.delete(callbackId);
      const server = callbackServers.get(port);
      if (server) {
        server.close();
        callbackServers.delete(port);
      }
      reject(new McpError(
        ErrorCode.InternalError,
        `Callback timeout for action: ${callbackId.split('-')[0]}. Ulysses may not be running or may not have called back to the server.\n\nTroubleshooting:\n1. Ensure Ulysses is installed and running\n2. Check that Ulysses has permission to access x-callback-url\n3. Try the command manually`
      ));
    }, CALLBACK_TIMEOUT_MS);
    
    pendingCallbacks.set(callbackId, { resolve, reject, timeout });
    
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://127.0.0.1:${port}`);
      const receivedCallbackId = url.searchParams.get('callbackId');
      
      if (receivedCallbackId !== callbackId) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      
      const callback = pendingCallbacks.get(callbackId);
      if (!callback) {
        res.writeHead(404);
        res.end('Callback not found');
        return;
      }
      
      // Parse callback data from URL params
      const params: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        if (key !== 'callbackId') {
          params[key] = value;
        }
      });
      
      res.writeHead(200);
      res.end('OK');
      
      // Clean up
      clearTimeout(callback.timeout);
      pendingCallbacks.delete(callbackId);
      server.close();
      callbackServers.delete(port);
      
      if (url.pathname.includes('/x-error')) {
        callback.reject(new Error(params.errorMessage || 'Ulysses returned an error'));
      } else {
        callback.resolve(params);
      }
    });
    
    server.listen(port, '127.0.0.1', () => {
      callbackServers.set(port, server);
      console.error(`Callback server listening on port ${port} for ${callbackId}`);
    });
    
    server.on('error', (error) => {
      clearTimeout(timeout);
      pendingCallbacks.delete(callbackId);
      callbackServers.delete(port);
      reject(error);
    });
  });
  
  return { port, promise: callbackPromise };
}

/**
 * Executes a Ulysses x-callback-url command
 * Uses execFile to prevent command injection vulnerabilities
 * For callback actions, waits for Ulysses to respond with data
 */
async function executeUlyssesCommand(
  action: string,
  params: Record<string, string> = {}
): Promise<string> {
  // Validate action against whitelist
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid action: ${action}`
    );
  }
  
  // Check rate limit for destructive operations
  checkRateLimit(action);
  
  const needsCallback = CALLBACK_ACTIONS.has(action);
  let url: string;
  let callbackPromise: Promise<any> | null = null;
  
  if (needsCallback) {
    // Create callback server and wait for response
    const callbackId = `${action}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { port, promise } = await createCallbackServer(callbackId);
    callbackPromise = promise;
    
    const successUrl = encodeParam(`http://127.0.0.1:${port}/x-success?callbackId=${callbackId}`);
    const errorUrl = encodeParam(`http://127.0.0.1:${port}/x-error?callbackId=${callbackId}`);
    
    const paramString = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeParam(value)}`)
      .join("&");
    
    url = `ulysses://x-callback-url/${action}?x-success=${successUrl}&x-error=${errorUrl}${paramString ? `&${paramString}` : ""}`;
  } else {
    // No callback needed for this action
    const paramString = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeParam(value)}`)
      .join("&");
    
    url = `ulysses://x-callback-url/${action}${paramString ? `?${paramString}` : ""}`;
  }
  
  try {
    // Use execFile instead of exec to prevent shell injection
    await execFileAsync('open', [url]);
    
    if (callbackPromise) {
      // Wait for callback and format the response
      const result = await callbackPromise;
      return JSON.stringify(result, null, 2);
    } else {
      return `Successfully executed ${action}`;
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    // Sanitize error messages to avoid exposing sensitive information
    throw new McpError(
      ErrorCode.InternalError,
      `MCP error -32603: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Create an MCP server with tools for Ulysses automation
 */
const server = new Server(
  {
    name: "ulysses-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler that lists all available Ulysses tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ulysses_new_sheet",
        description: "Create a new sheet in Ulysses with the specified text content. Optionally specify a group, format (markdown/text/html), position, and whether it should be a material sheet.",
        inputSchema: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "The content to insert into the new sheet"
            },
            group: {
              type: "string",
              description: "Optional. Group name, path (e.g., /My Group/Subgroup), or identifier where the sheet should be created. Defaults to Inbox."
            },
            format: {
              type: "string",
              enum: ["markdown", "text", "html"],
              description: "Optional. Format of the imported text. Defaults to markdown."
            },
            index: {
              type: "string",
              description: "Optional. Position of the new sheet in its parent group (0 for first position)"
            },
            material: {
              type: "string",
              enum: ["YES", "NO"],
              description: "Optional. Whether the sheet should be created as a material sheet. Defaults to NO."
            }
          },
          required: ["text"]
        }
      },
      {
        name: "ulysses_new_group",
        description: "Create a new group in Ulysses",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The name of the group to be created"
            },
            parent: {
              type: "string",
              description: "Optional. Parent group name, path, or identifier. Defaults to top level."
            },
            index: {
              type: "string",
              description: "Optional. Position of the new group in its parent (0 for first position)"
            }
          },
          required: ["name"]
        }
      },
      {
        name: "ulysses_insert",
        description: "Insert or append text to an existing sheet in Ulysses",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The identifier of the sheet to insert text into"
            },
            text: {
              type: "string",
              description: "The text content to insert"
            },
            format: {
              type: "string",
              enum: ["markdown", "text", "html"],
              description: "Optional. Format of the imported text. Defaults to markdown."
            },
            position: {
              type: "string",
              enum: ["begin", "end"],
              description: "Optional. Position to insert text (begin or end). Defaults to appending."
            },
            newline: {
              type: "string",
              enum: ["prepend", "append", "enclose"],
              description: "Optional. How to handle newlines around inserted text"
            }
          },
          required: ["id", "text"]
        }
      },
      {
        name: "ulysses_attach_note",
        description: "Attach a note to a sheet in Ulysses",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The identifier of the sheet to attach the note to"
            },
            text: {
              type: "string",
              description: "The note content"
            },
            format: {
              type: "string",
              enum: ["markdown", "text", "html"],
              description: "Optional. Format of the note text. Defaults to markdown."
            }
          },
          required: ["id", "text"]
        }
      },
      {
        name: "ulysses_attach_keywords",
        description: "Add one or more keywords to a sheet in Ulysses",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The identifier of the sheet to attach keywords to"
            },
            keywords: {
              type: "string",
              description: "Comma-separated list of keywords (e.g., 'Draft,Important')"
            }
          },
          required: ["id", "keywords"]
        }
      },
      {
        name: "ulysses_attach_image",
        description: "Attach an image to a sheet in Ulysses using base64-encoded image data",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The identifier of the sheet to attach the image to"
            },
            image: {
              type: "string",
              description: "Base64-encoded image data (must also be URL-encoded)"
            },
            format: {
              type: "string",
              description: "Image format extension (png, jpg, gif, pdf, etc.)"
            }
          },
          required: ["id", "image", "format"]
        }
      },
      {
        name: "ulysses_open",
        description: "Open a specific sheet or group in Ulysses",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Group name, path (e.g., /My Group/Subgroup), or sheet/group identifier to open"
            }
          },
          required: ["id"]
        }
      },
      {
        name: "ulysses_open_all",
        description: "Open the 'All' section in Ulysses showing all sheets",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "ulysses_open_recent",
        description: "Open the 'Last 7 Days' section in Ulysses",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "ulysses_open_favorites",
        description: "Open the 'Favorites' section in Ulysses",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "ulysses_get_version",
        description: "Get the Ulysses version and API version information",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "ulysses_authorize",
        description: "Request authorization to access the Ulysses library. Required for reading content and destructive operations. Returns an access token to be used with other commands.",
        inputSchema: {
          type: "object",
          properties: {
            appname: {
              type: "string",
              description: "Name of the application requesting access (e.g., 'Cline MCP', 'Ollama', 'LM Studio')"
            }
          },
          required: ["appname"]
        }
      },
      {
        name: "ulysses_read_sheet",
        description: "Read the contents of a sheet (requires authorization). Returns title, text content, keywords, and notes.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The identifier of the sheet to read"
            },
            text: {
              type: "string",
              enum: ["YES", "NO"],
              description: "Optional. Whether to include the full text content. Defaults to NO."
            },
            access_token: {
              type: "string",
              description: "Required. Access token obtained from ulysses_authorize"
            }
          },
          required: ["id", "access_token"]
        }
      },
      {
        name: "ulysses_get_item",
        description: "Get information about a sheet or group (requires authorization)",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The identifier of the item (sheet or group) to get information about"
            },
            recursive: {
              type: "string",
              enum: ["YES", "NO"],
              description: "Optional. For groups, whether to include all sub-groups recursively. Defaults to YES."
            },
            access_token: {
              type: "string",
              description: "Required. Access token obtained from ulysses_authorize"
            }
          },
          required: ["id", "access_token"]
        }
      },
      {
        name: "ulysses_get_root_items",
        description: "Get the root sections of the Ulysses library (iCloud, On My Mac, external folders). Can be used to get a full library listing. Requires authorization.",
        inputSchema: {
          type: "object",
          properties: {
            recursive: {
              type: "string",
              enum: ["YES", "NO"],
              description: "Optional. Whether to get a deep listing of the entire library. Defaults to YES."
            },
            access_token: {
              type: "string",
              description: "Required. Access token obtained from ulysses_authorize"
            }
          },
          required: ["access_token"]
        }
      },
      {
        name: "ulysses_move",
        description: "Move a sheet or group to a different location (requires authorization)",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The identifier of the item to move"
            },
            targetGroup: {
              type: "string",
              description: "Optional. Target group name, path, or identifier"
            },
            index: {
              type: "string",
              description: "Optional. Position in the target group (0 for first position)"
            },
            access_token: {
              type: "string",
              description: "Required. Access token obtained from ulysses_authorize"
            }
          },
          required: ["id", "access_token"]
        }
      },
      {
        name: "ulysses_copy",
        description: "Copy a sheet or group to a different location",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The identifier of the item to copy"
            },
            targetGroup: {
              type: "string",
              description: "Optional. Target group name, path, or identifier"
            },
            index: {
              type: "string",
              description: "Optional. Position in the target group (0 for first position)"
            }
          },
          required: ["id"]
        }
      },
      {
        name: "ulysses_trash",
        description: "Move a sheet or group to the trash (requires authorization)",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The identifier of the item to trash"
            },
            access_token: {
              type: "string",
              description: "Required. Access token obtained from ulysses_authorize"
            }
          },
          required: ["id", "access_token"]
        }
      },
      {
        name: "ulysses_set_group_title",
        description: "Change the title of a group (requires authorization)",
        inputSchema: {
          type: "object",
          properties: {
            group: {
              type: "string",
              description: "Group name, path, or identifier"
            },
            title: {
              type: "string",
              description: "New title for the group"
            },
            access_token: {
              type: "string",
              description: "Required. Access token obtained from ulysses_authorize"
            }
          },
          required: ["group", "title", "access_token"]
        }
      },
      {
        name: "ulysses_set_sheet_title",
        description: "Change the first paragraph of a sheet (requires authorization)",
        inputSchema: {
          type: "object",
          properties: {
            sheet: {
              type: "string",
              description: "The identifier of the sheet"
            },
            title: {
              type: "string",
              description: "New title text"
            },
            type: {
              type: "string",
              enum: ["heading1", "heading2", "heading3", "heading4", "heading5", "heading6", "comment", "filename"],
              description: "Type of paragraph to use for the title"
            },
            access_token: {
              type: "string",
              description: "Required. Access token obtained from ulysses_authorize"
            }
          },
          required: ["sheet", "title", "type", "access_token"]
        }
      },
      {
        name: "ulysses_remove_keywords",
        description: "Remove keywords from a sheet (requires authorization)",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The identifier of the sheet"
            },
            keywords: {
              type: "string",
              description: "Comma-separated list of keywords to remove"
            },
            access_token: {
              type: "string",
              description: "Required. Access token obtained from ulysses_authorize"
            }
          },
          required: ["id", "keywords", "access_token"]
        }
      },
      {
        name: "ulysses_update_note",
        description: "Change an existing note attachment on a sheet (requires authorization)",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The identifier of the sheet"
            },
            index: {
              type: "string",
              description: "Position of the note to change (0 for first note, 1 for second, etc.)"
            },
            text: {
              type: "string",
              description: "New content for the note"
            },
            format: {
              type: "string",
              enum: ["markdown", "text", "html"],
              description: "Optional. Format of the note text. Defaults to markdown."
            },
            access_token: {
              type: "string",
              description: "Required. Access token obtained from ulysses_authorize"
            }
          },
          required: ["id", "index", "text", "access_token"]
        }
      },
      {
        name: "ulysses_remove_note",
        description: "Remove a note attachment from a sheet (requires authorization)",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The identifier of the sheet"
            },
            index: {
              type: "string",
              description: "Position of the note to remove (0 for first note, 1 for second, etc.)"
            },
            access_token: {
              type: "string",
              description: "Required. Access token obtained from ulysses_authorize"
            }
          },
          required: ["id", "index", "access_token"]
        }
      }
    ]
  };
});

/**
 * Handler for executing Ulysses tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "ulysses_new_sheet": {
        const text = validateLength(validateRequired(args?.text, "text"), 1000000, "text");
        const params: Record<string, string> = { text };
        
        if (args?.group) params.group = String(args.group);
        if (args?.format) {
          params.format = validateEnum(String(args.format), ["markdown", "text", "html"], "format") || "markdown";
        }
        if (args?.index) params.index = String(args.index);
        if (args?.material) {
          params.material = validateEnum(String(args.material), ["YES", "NO"], "material") || "NO";
        }

        const result = await executeUlyssesCommand("new-sheet", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_new_group": {
        const name = validateLength(validateRequired(args?.name, "name"), 255, "name");
        const params: Record<string, string> = { name };
        
        if (args?.parent) params.parent = String(args.parent);
        if (args?.index) params.index = String(args.index);

        const result = await executeUlyssesCommand("new-group", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_insert": {
        const id = validateRequired(args?.id, "id");
        const text = validateLength(validateRequired(args?.text, "text"), 1000000, "text");
        const params: Record<string, string> = { id, text };
        
        if (args?.format) {
          params.format = validateEnum(String(args.format), ["markdown", "text", "html"], "format") || "markdown";
        }
        if (args?.position) {
          params.position = validateEnum(String(args.position), ["begin", "end"], "position") || "end";
        }
        if (args?.newline) {
          params.newline = validateEnum(String(args.newline), ["prepend", "append", "enclose"], "newline") || "";
        }

        const result = await executeUlyssesCommand("insert", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_attach_note": {
        const id = validateRequired(args?.id, "id");
        const text = validateLength(validateRequired(args?.text, "text"), 100000, "text");
        const params: Record<string, string> = { id, text };
        
        if (args?.format) {
          params.format = validateEnum(String(args.format), ["markdown", "text", "html"], "format") || "markdown";
        }

        const result = await executeUlyssesCommand("attach-note", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_attach_keywords": {
        const id = validateRequired(args?.id, "id");
        const keywords = validateLength(validateRequired(args?.keywords, "keywords"), 1000, "keywords");
        const params: Record<string, string> = { id, keywords };

        const result = await executeUlyssesCommand("attach-keywords", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_attach_image": {
        const id = validateRequired(args?.id, "id");
        const image = validateRequired(args?.image, "image");
        const format = validateRequired(args?.format, "format");
        const params: Record<string, string> = { id, image, format };

        const result = await executeUlyssesCommand("attach-image", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_open": {
        const id = validateRequired(args?.id, "id");
        const params: Record<string, string> = { id };

        const result = await executeUlyssesCommand("open", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_open_all": {
        const result = await executeUlyssesCommand("open-all");
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_open_recent": {
        const result = await executeUlyssesCommand("open-recent");
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_open_favorites": {
        const result = await executeUlyssesCommand("open-favorites");
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_get_version": {
        const result = await executeUlyssesCommand("get-version");
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_authorize": {
        const appname = validateLength(validateRequired(args?.appname, "appname"), 100, "appname");
        const params: Record<string, string> = { appname };

        const result = await executeUlyssesCommand("authorize", params);
        return {
          content: [{ 
            type: "text", 
            text: `${result}\n\n⚠️ SECURITY NOTE: Ulysses will ask you to authorize this app. Once authorized, you'll receive an access token that provides access to your Ulysses library. Keep this token secure and do not share it. The token will remain valid until you revoke it in Ulysses preferences.` 
          }]
        };
      }

      case "ulysses_read_sheet": {
        const id = validateRequired(args?.id, "id");
        const accessToken = validateRequired(args?.access_token, "access_token");
        const params: Record<string, string> = {
          id,
          "access-token": accessToken
        };
        if (args?.text) {
          params.text = validateEnum(String(args.text), ["YES", "NO"], "text") || "NO";
        }

        const result = await executeUlyssesCommand("read-sheet", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_get_item": {
        const id = validateRequired(args?.id, "id");
        const accessToken = validateRequired(args?.access_token, "access_token");
        const params: Record<string, string> = {
          id,
          "access-token": accessToken
        };
        if (args?.recursive) {
          params.recursive = validateEnum(String(args.recursive), ["YES", "NO"], "recursive") || "YES";
        }

        const result = await executeUlyssesCommand("get-item", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_get_root_items": {
        const accessToken = validateRequired(args?.access_token, "access_token");
        const params: Record<string, string> = {
          "access-token": accessToken
        };
        if (args?.recursive) {
          params.recursive = validateEnum(String(args.recursive), ["YES", "NO"], "recursive") || "YES";
        }

        const result = await executeUlyssesCommand("get-root-items", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_move": {
        const id = validateRequired(args?.id, "id");
        const accessToken = validateRequired(args?.access_token, "access_token");
        const params: Record<string, string> = {
          id,
          "access-token": accessToken
        };
        if (args?.targetGroup) params.targetGroup = String(args.targetGroup);
        if (args?.index) params.index = String(args.index);

        const result = await executeUlyssesCommand("move", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_copy": {
        const id = validateRequired(args?.id, "id");
        const params: Record<string, string> = { id };
        
        if (args?.targetGroup) params.targetGroup = String(args.targetGroup);
        if (args?.index) params.index = String(args.index);

        const result = await executeUlyssesCommand("copy", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_trash": {
        const id = validateRequired(args?.id, "id");
        const accessToken = validateRequired(args?.access_token, "access_token");
        const params: Record<string, string> = {
          id,
          "access-token": accessToken
        };

        const result = await executeUlyssesCommand("trash", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_set_group_title": {
        const group = validateRequired(args?.group, "group");
        const title = validateLength(validateRequired(args?.title, "title"), 255, "title");
        const accessToken = validateRequired(args?.access_token, "access_token");
        const params: Record<string, string> = {
          group,
          title,
          "access-token": accessToken
        };

        const result = await executeUlyssesCommand("set-group-title", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_set_sheet_title": {
        const sheet = validateRequired(args?.sheet, "sheet");
        const title = validateLength(validateRequired(args?.title, "title"), 1000, "title");
        const type = validateEnum(
          validateRequired(args?.type, "type"),
          ["heading1", "heading2", "heading3", "heading4", "heading5", "heading6", "comment", "filename"],
          "type"
        ) || "heading1";
        const accessToken = validateRequired(args?.access_token, "access_token");
        const params: Record<string, string> = {
          sheet,
          title,
          type,
          "access-token": accessToken
        };

        const result = await executeUlyssesCommand("set-sheet-title", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_remove_keywords": {
        const id = validateRequired(args?.id, "id");
        const keywords = validateLength(validateRequired(args?.keywords, "keywords"), 1000, "keywords");
        const accessToken = validateRequired(args?.access_token, "access_token");
        const params: Record<string, string> = {
          id,
          keywords,
          "access-token": accessToken
        };

        const result = await executeUlyssesCommand("remove-keywords", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_update_note": {
        const id = validateRequired(args?.id, "id");
        const index = validateRequired(args?.index, "index");
        const text = validateLength(validateRequired(args?.text, "text"), 100000, "text");
        const accessToken = validateRequired(args?.access_token, "access_token");
        const params: Record<string, string> = {
          id,
          index,
          text,
          "access-token": accessToken
        };
        if (args?.format) {
          params.format = validateEnum(String(args.format), ["markdown", "text", "html"], "format") || "markdown";
        }

        const result = await executeUlyssesCommand("update-note", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "ulysses_remove_note": {
        const id = validateRequired(args?.id, "id");
        const index = validateRequired(args?.index, "index");
        const accessToken = validateRequired(args?.access_token, "access_token");
        const params: Record<string, string> = {
          id,
          index,
          "access-token": accessToken
        };

        const result = await executeUlyssesCommand("remove-note", params);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

/**
 * Start the server using stdio transport
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Ulysses MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
