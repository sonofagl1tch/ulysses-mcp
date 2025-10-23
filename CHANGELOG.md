# Changelog

All notable changes to the Ulysses MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-10-23

### Added

- Initial release of Ulysses MCP Server
- 24 tools for interacting with Ulysses writing app
- Content creation tools:
  - `ulysses_new_sheet` - Create new sheets
  - `ulysses_new_group` - Create new groups
- Content modification tools:
  - `ulysses_insert` - Insert/append text
  - `ulysses_attach_note` - Attach notes
  - `ulysses_attach_keywords` - Add keywords
  - `ulysses_attach_image` - Attach images
- Navigation tools:
  - `ulysses_open` - Open sheets/groups
  - `ulysses_open_all` - Open All section
  - `ulysses_open_recent` - Open Recent section
  - `ulysses_open_favorites` - Open Favorites
- Information & authorization tools:
  - `ulysses_get_version` - Get version info
  - `ulysses_authorize` - Request authorization
  - `ulysses_read_sheet` - Read sheet contents
  - `ulysses_get_item` - Get item info
  - `ulysses_get_root_items` - Get library structure
- Advanced operation tools:
  - `ulysses_move` - Move items
  - `ulysses_copy` - Copy items
  - `ulysses_trash` - Trash items
  - `ulysses_set_group_title` - Rename groups
  - `ulysses_set_sheet_title` - Change sheet titles
  - `ulysses_remove_keywords` - Remove keywords
  - `ulysses_update_note` - Update notes
  - `ulysses_remove_note` - Remove notes
- Comprehensive documentation:
  - README with installation and usage instructions
  - CONTRIBUTING guide for developers
  - MIT License
  - Example configurations for Claude Desktop and Cline
- Full implementation of Ulysses x-callback-url API version 3
- TypeScript source with proper type definitions
- Error handling and validation

### Notes

- This is the initial public release
- All tools have been tested with Ulysses on macOS
- Server uses stdio transport for MCP communication
- Requires Node.js 18.0.0 or higher

[0.1.0]: https://github.com/yourusername/ulysses-mcp/releases/tag/v0.1.0
