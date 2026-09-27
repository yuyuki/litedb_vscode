# Changelog

## 1.0.1 — 2026-09-27

### Added

- Open nested JSON values from collection and query grids in a formatted editor.
- Add agent development guidance and regression tests for JSON display and document IDs.

### Fixed

- Restart the bridge after a timed out request so a late response cannot be
  applied to the next request.
- Preserve the type of document IDs when updating cells, and validate edited
  numbers, booleans, and column names.
- Close only the selected database and leave LiteDB log files under LiteDB's
  control.

### Documentation

- Rewrite the README with usage and .NET 10 build instructions.
