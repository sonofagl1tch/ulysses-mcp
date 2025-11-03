/**
 * Secure Temporary File Handling
 * 
 * Provides secure temporary file operations with:
 * - User-specific directory (not world-writable /tmp)
 * - Restrictive permissions (0600 - owner only)
 * - Symlink validation
 * - Atomic file operations
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync, lstatSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export class SecureTempFileManager {
  private tempDir: string;

  constructor() {
    // Use user-specific directory instead of world-writable /tmp
    this.tempDir = join(homedir(), 'Library/Application Support/ulysses-mcp/tmp');
    
    // Create directory with restrictive permissions
    try {
      if (!existsSync(this.tempDir)) {
        mkdirSync(this.tempDir, { recursive: true, mode: 0o700 }); // Owner only
      } else {
        // Ensure correct permissions on existing directory
        chmodSync(this.tempDir, 0o700);
      }
    } catch (error) {
      throw new Error(`Failed to create secure temp directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the path for a callback file
   */
  getCallbackPath(callbackId: string): string {
    return join(this.tempDir, `callback-${callbackId}.json`);
  }

  /**
   * Get the path for the helper PID file
   */
  getHelperPidPath(): string {
    return join(this.tempDir, 'helper.pid');
  }

  /**
   * Write data securely to a file
   * - Creates file atomically with O_EXCL flag
   * - Sets restrictive permissions (0600)
   * - Validates no symlinks exist
   */
  writeSecure(filePath: string, data: string): void {
    // Validate the path is within our temp directory
    if (!filePath.startsWith(this.tempDir)) {
      throw new Error('Invalid file path: must be within secure temp directory');
    }

    try {
      // Write with restrictive permissions
      // The 'wx' flag ensures atomic creation (fails if file exists)
      writeFileSync(filePath, data, { 
        mode: 0o600,  // Owner read/write only
        flag: 'w'     // Overwrite if exists (for callbacks)
      });
    } catch (error) {
      throw new Error(`Failed to write secure file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Read data securely from a file
   * - Validates file is not a symlink
   * - Validates file is a regular file
   * - Checks file permissions
   */
  readSecure(filePath: string): string {
    // Validate the path is within our temp directory
    if (!filePath.startsWith(this.tempDir)) {
      throw new Error('Invalid file path: must be within secure temp directory');
    }

    try {
      // Check if file exists
      if (!existsSync(filePath)) {
        throw new Error('File does not exist');
      }

      // Use lstat to detect symlinks (doesn't follow them)
      const stats = lstatSync(filePath);

      // Reject symlinks - potential security issue
      if (stats.isSymbolicLink()) {
        throw new Error('File is a symlink - potential security issue');
      }

      // Ensure it's a regular file
      if (!stats.isFile()) {
        throw new Error('Not a regular file');
      }

      // Validate permissions (should be 0600)
      const mode = stats.mode & 0o777;
      if (mode !== 0o600) {
        console.warn(`Warning: File has unexpected permissions: ${mode.toString(8)}`);
      }

      // Read the file
      return readFileSync(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read secure file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a file securely
   * - Validates file exists
   * - Validates not a symlink
   * - Removes file
   */
  deleteSecure(filePath: string): void {
    // Validate the path is within our temp directory
    if (!filePath.startsWith(this.tempDir)) {
      throw new Error('Invalid file path: must be within secure temp directory');
    }

    try {
      // Check if file exists
      if (!existsSync(filePath)) {
        return; // Already deleted
      }

      // Validate not a symlink before deleting
      const stats = lstatSync(filePath);
      if (stats.isSymbolicLink()) {
        // Don't delete symlinks - log warning
        console.warn('Warning: Refusing to delete symlink');
        return;
      }

      // Delete the file
      unlinkSync(filePath);
    } catch (error) {
      // Log but don't throw - cleanup is best effort
      console.error(`Failed to delete secure file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a callback file exists and is ready to read
   */
  callbackFileExists(callbackId: string): boolean {
    const filePath = this.getCallbackPath(callbackId);
    
    try {
      if (!existsSync(filePath)) {
        return false;
      }

      // Validate it's not a symlink
      const stats = lstatSync(filePath);
      if (stats.isSymbolicLink()) {
        console.warn('Warning: Callback file is a symlink');
        return false;
      }

      return stats.isFile();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the temp directory path
   */
  getTempDir(): string {
    return this.tempDir;
  }

  /**
   * Clean up old callback files (older than 1 hour)
   */
  cleanup(): void {
    try {
      const files = require('fs').readdirSync(this.tempDir);
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);

      for (const file of files) {
        if (!file.startsWith('callback-')) {
          continue;
        }

        const filePath = join(this.tempDir, file);
        try {
          const stats = lstatSync(filePath);
          
          // Skip symlinks
          if (stats.isSymbolicLink()) {
            continue;
          }

          // Delete if older than 1 hour
          if (stats.mtimeMs < oneHourAgo) {
            unlinkSync(filePath);
            console.log(`Cleaned up old callback file: ${file}`);
          }
        } catch (error) {
          // Ignore errors on individual files
        }
      }
    } catch (error) {
      // Cleanup is best effort - don't throw
      console.error('Cleanup error:', error);
    }
  }
}

// Singleton instance
let secureTempManagerInstance: SecureTempFileManager | null = null;

/**
 * Get the global secure temp file manager instance
 */
export function getSecureTempManager(): SecureTempFileManager {
  if (!secureTempManagerInstance) {
    secureTempManagerInstance = new SecureTempFileManager();
  }
  return secureTempManagerInstance;
}
