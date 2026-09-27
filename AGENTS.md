# Agent guide

## Project

LiteDB Explorer is a VS Code extension. TypeScript in `src/` owns commands,
views, and the request queue; the .NET bridge in `backend/LiteDbBridge/` owns
LiteDB connections and query execution. `media/gridView.html` runs inside a
VS Code webview. See `src/extension.ts` for command wiring.

## Build and verify

- Run `npm install` and `npm run compile` for TypeScript changes.
- Run `dotnet build backend/LiteDbBridge/LiteDbBridge.csproj` for backend changes.
- Exercise opening a database, querying, editing a primitive field, closing,
  and reopening in an Extension Development Host when VS Code is available.
- Report any verification blocked by a missing SDK or runtime.

## Documentation for every change

- Update `CHANGELOG.md` for every change.
- Update `README.md` when the change affects users or its documentation would
  help them use or develop the extension. Keep examples runnable.

## Invariants

- The bridge uses one JSON request and one JSON response per line on stdout;
  diagnostics go to stderr. Keep queued requests in order. After a request
  times out, restart the process before sending another request.
- Only the bridge should open or close database files. Leave LiteDB log files
  to LiteDB, particularly in shared mode.
- Treat database content and webview messages as untrusted. Escape HTML and
  attributes; validate edits before building LiteDB SQL. Preserve BSON ID
  types and never silently convert an ID string to an ObjectId or number.
