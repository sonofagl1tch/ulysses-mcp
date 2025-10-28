# Security Policy

## Reporting Security Vulnerabilities

We take the security of the Ulysses MCP Server seriously. If you discover a security vulnerability, please follow these guidelines:

### How to Report

**DO NOT** open public GitHub issues for security vulnerabilities.

Instead, please report security vulnerabilities by:

1. **Email**: Send details to <sonofagl1tch@pebcakconsulting.com>
2. **GitHub Security Advisory**: Use the [GitHub Security Advisory](https://github.com/sonofagl1tch/ulysses-mcp/security/advisories/new) feature

### What to Include

When reporting a vulnerability, please include:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact of the vulnerability
- Any suggested fixes or mitigations
- Your contact information for follow-up

### Response Timeline

- **Initial Response**: Within 48 hours of receiving your report
- **Status Update**: Within 7 days with our assessment
- **Fix Timeline**: We aim to release fixes for critical vulnerabilities within 30 days

### Disclosure Policy

- We request that you do not publicly disclose the vulnerability until we have had a chance to address it
- We will credit you in the release notes (unless you prefer to remain anonymous)
- Once fixed, we will coordinate with you on the disclosure timeline

## Security Features

This MCP server implements several security measures:

### Command Injection Prevention

- Uses `execFile` instead of `exec` to prevent shell injection attacks
- All Ulysses API actions are validated against a whitelist
- URL parameters are properly encoded

### Input Validation

- Required parameters are validated for presence and non-empty values
- Text inputs have reasonable length limits to prevent DoS attacks
- Enum values are validated against allowed options
- Action names are validated against a whitelist

### Rate Limiting

- Destructive operations are rate-limited to 10 per minute
- Helps prevent accidental bulk deletions or modifications

### Error Handling

- Error messages are sanitized to avoid exposing sensitive information
- Access tokens are never logged or exposed in error messages

### Access Control

- Operations requiring authorization explicitly require access tokens
- Tokens are obtained through Ulysses' authorization flow
- Users can revoke tokens at any time via Ulysses preferences

## Known Limitations

### Inherent Risks

- This server provides programmatic access to your Ulysses library
- Access tokens grant full library access to the holder
- The server operates with the same permissions as the user running it

### Best Practices for Users

1. **Token Management**:
   - Never commit access tokens to version control
   - Store tokens securely if persistence is needed
   - Revoke unused tokens promptly
   - Generate new tokens if compromise is suspected

2. **Server Deployment**:
   - Only run this server in trusted environments
   - Be cautious when sharing MCP configurations
   - Review client applications before granting library access

3. **Data Protection**:
   - Understand that AI assistants will have access to your writing
   - Be mindful of sensitive content in your Ulysses library
   - Consider using separate libraries for sensitive vs. public content

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Updates

Security updates will be released as soon as possible after a vulnerability is confirmed. Update notifications will be provided via:

- GitHub Security Advisories
- Release notes
- README updates

## Acknowledgments

We appreciate the security research community's efforts in responsibly disclosing vulnerabilities. Contributors who report valid security issues will be acknowledged in release notes (unless they prefer to remain anonymous).

## Contact

For security-related questions or concerns not related to vulnerability reports, please open a regular GitHub issue or discussion.

---

**Last Updated**: 2025-10-23
