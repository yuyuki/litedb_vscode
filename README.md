# LiteDB Explorer (VS Code Extension)

This extension prototype provides:

- Open/close a LiteDB database file (`.db` or any file)
- Run a LiteDB SQL query and view results in a table (webview)
- Show database collections in the VS Code Explorer panel

## Prerequisites

- Node.js (for extension build)
- .NET 10 SDK (for the LiteDB bridge process)

## Commands

- `LiteDB: Open Database`
- `LiteDB: Close Database`
- `LiteDB: Run Query`
- `LiteDB: Refresh Collections`

## How it works

The VS Code extension (TypeScript) launches a small .NET bridge app that references the official `LiteDB` NuGet package. The bridge receives JSON commands and returns JSON results.

## Development

### Initial Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the C# backend:**
   ```bash
   dotnet build backend/LiteDbBridge/LiteDbBridge.csproj
   ```

3. **Compile the extension:**
   ```bash
   npm run compile
   ```

### Development Workflow

1. **Start the TypeScript compiler in watch mode** (optional, for automatic recompilation):
   ```bash
   npm run watch
   ```

2. **Launch VS Code in extension development mode:**
   
   **Option A: Using F5 (Recommended)**
   - Open the project in VS Code
   - Press `F5` or go to Run → Start Debugging
   - This opens a new Extension Development Host window with your extension loaded

   **Option B: Command Line**
   ```bash
   code --extensionDevelopmentPath=%cd% --disable-extensions
   ```
   - This launches a new VS Code window with only your extension enabled for testing

### Testing the Extension

1. In the Extension Development Host window, open the Command Palette (`Ctrl+Shift+P`)
2. Type "LiteDB" to see available commands:
   - `LiteDB: Open Database`
   - `LiteDB: Close Database`
   - `LiteDB: Run Query`
   - `LiteDB: Refresh Collections`

3. Check the Explorer panel (left sidebar) for the "LiteDB" section

4. For debugging, open Developer Tools: `Ctrl+Shift+P` → "Developer: Toggle Developer Tools"

### Making Changes

- Edit TypeScript files in the `src/` folder
- If running `npm run watch`, changes will automatically recompile
- Reload the Extension Development Host window (`Ctrl+R`) to see changes
- Check the Debug Console for any errors
