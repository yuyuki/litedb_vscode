# Changelog

## 1.1.0 — 2026-09-27

### Added

- Prepare the next release of LiteDB Explorer with the current 1.1.0 package
  version and release metadata.

### Fixed

- Keep the extension version and changelog aligned for the next published
  release.

### Documentation

- Require changelog updates for every change and README updates when useful.

## 1.0.1 — 2026-09-27

### Added

- Open nested JSON values and JSON object/array text from collection and query
  grids in a formatted editor; cap column width to keep wide values readable.
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
