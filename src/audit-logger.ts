/**
 * Audit Logger for Ulysses MCP Server
 * 
 * Provides security event logging with sanitization to track:
 * - Authorization attempts
 * - Destructive operations
 * - Rate limit violations
 * - Authentication failures
 */

import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Security event types
export enum AuditEventType {
  AUTHORIZATION = 'authorization',
  DESTRUCTIVE_OPERATION = 'destructive_operation',
  RATE_LIMIT_VIOLATION = 'rate_limit_violation',
  VALIDATION_FAILURE = 'validation_failure',
  OPERATION_SUCCESS = 'operation_success',
  OPERATION_FAILURE = 'operation_failure',
  SERVER_START = 'server_start',
  SERVER_ERROR = 'server_error'
}

export interface AuditEvent {
  timestamp: string;
  event_type: AuditEventType;
  action?: string;
  success: boolean;
  user?: string;
  details?: Record<string, any>;
  error?: string;
}

export class AuditLogger {
  private logPath: string;
  private enabled: boolean;

  constructor() {
    // Store logs in user's Application Support directory
    const logDir = join(homedir(), 'Library/Application Support/ulysses-mcp');
    
    // Create directory if it doesn't exist
    try {
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true, mode: 0o700 }); // Owner only
      }
    } catch (error) {
      console.error('Failed to create audit log directory:', error);
      this.enabled = false;
      this.logPath = '';
      return;
    }

    this.logPath = join(logDir, 'audit.jsonl');
    this.enabled = true;

    // Log server start
    this.log({
      timestamp: new Date().toISOString(),
      event_type: AuditEventType.SERVER_START,
      success: true,
      details: {
        pid: process.pid,
        node_version: process.version,
        platform: process.platform
      }
    });
  }

  /**
   * Log a security event
   */
  log(event: AuditEvent): void {
    if (!this.enabled) {
      return;
    }

    try {
      // Sanitize the event before logging
      const sanitized = this.sanitizeEvent(event);
      
      // Write as JSON Lines format (one JSON object per line)
      const logLine = JSON.stringify(sanitized) + '\n';
      
      // Append to log file with restrictive permissions
      appendFileSync(this.logPath, logLine, { mode: 0o600 });
    } catch (error) {
      console.error('Audit log write failed:', error);
    }
  }

  /**
   * Log an authorization event
   */
  logAuthorization(appname: string, success: boolean, error?: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      event_type: AuditEventType.AUTHORIZATION,
      action: 'authorize',
      success,
      details: { appname },
      error
    });
  }

  /**
   * Log a destructive operation
   */
  logDestructiveOperation(action: string, success: boolean, details?: Record<string, any>, error?: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      event_type: AuditEventType.DESTRUCTIVE_OPERATION,
      action,
      success,
      details: this.sanitizeDetails(details),
      error
    });
  }

  /**
   * Log a rate limit violation
   */
  logRateLimitViolation(action: string, details?: Record<string, any>): void {
    this.log({
      timestamp: new Date().toISOString(),
      event_type: AuditEventType.RATE_LIMIT_VIOLATION,
      action,
      success: false,
      details: this.sanitizeDetails(details)
    });
  }

  /**
   * Log a validation failure
   */
  logValidationFailure(action: string, error: string, details?: Record<string, any>): void {
    this.log({
      timestamp: new Date().toISOString(),
      event_type: AuditEventType.VALIDATION_FAILURE,
      action,
      success: false,
      details: this.sanitizeDetails(details),
      error
    });
  }

  /**
   * Log a successful operation
   */
  logSuccess(action: string, details?: Record<string, any>): void {
    this.log({
      timestamp: new Date().toISOString(),
      event_type: AuditEventType.OPERATION_SUCCESS,
      action,
      success: true,
      details: this.sanitizeDetails(details)
    });
  }

  /**
   * Log a failed operation
   */
  logFailure(action: string, error: string, details?: Record<string, any>): void {
    this.log({
      timestamp: new Date().toISOString(),
      event_type: AuditEventType.OPERATION_FAILURE,
      action,
      success: false,
      details: this.sanitizeDetails(details),
      error
    });
  }

  /**
   * Sanitize event data to remove sensitive information
   */
  private sanitizeEvent(event: AuditEvent): AuditEvent {
    return {
      ...event,
      details: this.sanitizeDetails(event.details)
    };
  }

  /**
   * Sanitize details object to remove or redact sensitive fields
   */
  private sanitizeDetails(details?: Record<string, any>): Record<string, any> {
    if (!details) {
      return {};
    }

    const sanitized = { ...details };

    // Remove sensitive fields
    const sensitiveFields = [
      'access_token',
      'access-token',
      'accessToken',
      'token',
      'password',
      'secret',
      'apiKey',
      'api_key'
    ];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '<redacted>';
      }
    }

    // Truncate large text fields to prevent log bloat
    if (sanitized.text && typeof sanitized.text === 'string' && sanitized.text.length > 100) {
      sanitized.text = sanitized.text.substring(0, 100) + '...[truncated]';
    }

    // Truncate large note fields
    if (sanitized.note && typeof sanitized.note === 'string' && sanitized.note.length > 100) {
      sanitized.note = sanitized.note.substring(0, 100) + '...[truncated]';
    }

    // Truncate image data
    if (sanitized.image && typeof sanitized.image === 'string') {
      sanitized.image = `<base64 data, length: ${sanitized.image.length}>`;
    }

    return sanitized;
  }

  /**
   * Get the log file path
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Check if logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
let auditLoggerInstance: AuditLogger | null = null;

/**
 * Get the global audit logger instance
 */
export function getAuditLogger(): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger();
  }
  return auditLoggerInstance;
}
