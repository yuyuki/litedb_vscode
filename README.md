# LiteDB Explorer (VS Code Extension)

This extension prototype provides:

- Open/close a LiteDB database file (`.db` or any file)
- Run a LiteDB SQL query and view results in a table (webview)
- Show database collections in the VS Code Explorer panel

## Prerequisites

- Node.js (for extension build)
- .NET 8 SDK (for the LiteDB bridge process)

## Commands

- `LiteDB: Open Database`
- `LiteDB: Close Database`
- `LiteDB: Run Query`
- `LiteDB: Refresh Collections`

## How it works

The VS Code extension (TypeScript) launches a small .NET bridge app that references the official `LiteDB` NuGet package. The bridge receives JSON commands and returns JSON results.

## Development

```bash
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.
