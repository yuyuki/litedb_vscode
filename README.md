# LiteDB Explorer for VS Code

Open LiteDB databases, browse collections, run LiteDB SQL queries, and edit
simple document fields in VS Code. The extension uses a local .NET 10 bridge;
install the .NET runtime on the machine running the extension.

## Use

1. Run **LiteDB: Open Database** from the Command Palette or the LiteDB view
   in Explorer, then select a `.db` or `.litedb` file.
2. Select a collection to view its documents. Use the refresh button to reload.
3. Click a string, number, or boolean cell to edit it; press Enter to save or
   Escape to cancel. `_id`, BSON values, nulls, and nested values are read only.
   Click nested JSON to open it formatted in an editor.
4. Run **LiteDB: Run Query** to create a query editor. Press F5 to execute its
   selected text, or the whole document when nothing is selected. Results
   appear in the LiteDB Result panel.
5. Run **LiteDB: Close Database** when finished.

The query editor offers keyword and collection completion. Reload external
database changes with **LiteDB: Refresh Collections**.

![Open database](images/open_db.gif)
![Browse and edit](images/open_and_edit_collection.gif)
![Query editor](images/query_editor.gif)

## Develop

Requirements: Node.js, npm, .NET 10 SDK, and VS Code.

```sh
npm install
npm run compile
dotnet build backend/LiteDbBridge/LiteDbBridge.csproj
```

The backend project builds into `out/LiteDbBridge/`, where the extension
expects `LiteDbBridge.dll`. Press F5 in VS Code to launch an Extension
Development Host. TypeScript source is in `src/`, the bridge is in
`backend/LiteDbBridge/`, and the collection webview is in `media/gridView.html`.
See [AGENTS.md](AGENTS.md) for development invariants.

## License

MIT. See [LICENSE.md](LICENSE.md).
