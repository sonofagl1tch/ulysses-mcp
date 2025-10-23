# Contributing to Ulysses MCP Server

Thank you for your interest in contributing to the Ulysses MCP Server! This document provides guidelines for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Your environment details (macOS version, Node.js version, Ulysses version)
- Screenshots or error messages if applicable

### Suggesting Enhancements

Enhancement suggestions are welcome! Please create an issue with:

- A clear description of the enhancement
- Use cases and benefits
- Any relevant examples or mockups

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following the coding standards below
3. **Test your changes** thoroughly
4. **Update documentation** if you're adding or changing features
5. **Commit your changes** with clear, descriptive commit messages
6. **Push to your fork** and submit a pull request

#### Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Update the README.md if needed
- Add tests if applicable
- Ensure the code builds successfully: `npm run build`
- Follow the existing code style

## Development Setup

### Prerequisites

- macOS (Ulysses is Mac/iOS only)
- Node.js 18.0.0 or higher
- Ulysses app installed
- An MCP-compatible client for testing

### Setup Steps

```bash
# Clone your fork
git clone <your-repository-url>
cd ulysses-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Watch for changes during development
npm run watch
```

### Testing

To test your changes:

1. Build the project: `npm run build`
2. Update your MCP client configuration to point to your local build
3. Restart your MCP client
4. Test the affected tools using your MCP client
5. Verify the Ulysses x-callback-url commands execute correctly

You can also use the MCP Inspector:

```bash
npm run inspector
```

## Coding Standards

### TypeScript

- Use TypeScript for all source files
- Enable strict type checking
- Avoid `any` types when possible
- Document complex functions with JSDoc comments

### Code Style

- Use 2 spaces for indentation
- Use semicolons
- Use double quotes for strings
- Keep lines under 100 characters when practical
- Add comments for complex logic

### Example

```typescript
/**
 * Executes a Ulysses x-callback-url command
 * @param action - The Ulysses action to execute
 * @param params - URL parameters for the action
 * @returns Success message or throws error
 */
async function executeUlyssesCommand(
  action: string,
  params: Record<string, string> = {}
): Promise<string> {
  // Implementation
}
```

### Naming Conventions

- Use camelCase for variables and functions
- Use PascalCase for types and interfaces
- Use UPPER_CASE for constants
- Prefix tool names with `ulysses_`

## Adding New Tools

When adding a new Ulysses tool:

1. **Add to ListToolsRequestSchema** handler with:
   - Clear name (prefixed with `ulysses_`)
   - Descriptive documentation
   - Complete inputSchema with all parameters
   - Required vs optional parameter specifications

2. **Add to CallToolRequestSchema** handler:
   - Add case to switch statement
   - Extract and validate parameters
   - Call `executeUlyssesCommand` with proper parameters
   - Return formatted result

3. **Update README.md**:
   - Add tool to the appropriate category
   - Document all parameters
   - Provide usage examples

4. **Test thoroughly**:
   - Test with valid inputs
   - Test with edge cases
   - Test error handling
   - Verify Ulysses behavior

## Project Structure

```
ulysses-mcp/
├── src/
│   └── index.ts          # Main server implementation
├── build/                # Compiled output (git-ignored)
├── node_modules/         # Dependencies (git-ignored)
├── package.json          # Project metadata
├── tsconfig.json         # TypeScript configuration
├── README.md             # Main documentation
├── CONTRIBUTING.md       # This file
├── LICENSE               # MIT License
└── .gitignore           # Git ignore rules
```

## Documentation

- Keep README.md up to date with new features
- Add JSDoc comments for exported functions
- Update tool descriptions to be clear and concise
- Include examples for complex features

## Commit Messages

Write clear, concise commit messages:

- Use present tense ("Add feature" not "Added feature")
- Capitalize the first letter
- Keep the first line under 50 characters
- Add detailed description if needed

Examples:

```
Add ulysses_open_favorites tool

Implements the open-favorites x-callback-url action to allow
users to quickly navigate to their favorites section in Ulysses.
```

```
Fix parameter encoding in executeUlyssesCommand

URL parameters weren't being properly encoded, causing issues
with special characters in sheet content.
```

## Release Process

The project follows semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes

## Questions?

If you have questions about contributing, feel free to:

- Open an issue for discussion on GitHub
- Check existing issues and discussions
- Review the [Ulysses x-callback-url documentation](https://github.com/ulyssesapp/x-callback-documentation)
- Review our [Code of Conduct](CODE_OF_CONDUCT.md)

## GitHub-Specific Guidelines

### Issue Templates

We provide templates for:

- **Bug Reports**: Use when reporting issues
- **Feature Requests**: Use when suggesting enhancements

### Pull Request Process

1. Use the pull request template provided
2. Link related issues in your PR description
3. Wait for CI checks to pass
4. Respond to review feedback promptly
5. Ensure all discussions are resolved before merge

### GitHub Actions

Our CI pipeline automatically:

- Builds the project on multiple Node.js versions
- Runs TypeScript type checking
- Performs security audits
- Verifies build output

All checks must pass before a PR can be merged.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Acknowledgments

Thank you for taking the time to contribute to the Ulysses MCP Server! Your efforts help make this tool better for everyone in the community.
