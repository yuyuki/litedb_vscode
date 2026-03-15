// Optimized C# backend for LiteDB operations

using LiteDB;
using System.Linq;

// Alias to avoid conflicts
using JsonSerializer = System.Text.Json.JsonSerializer;
using JsonSerializerOptions = System.Text.Json.JsonSerializerOptions;
using JsonNamingPolicy = System.Text.Json.JsonNamingPolicy;

public sealed record BridgeRequest(string Command, string DbPath, string? Query);
public sealed record BridgeResponse(bool Success, object? Data = null, string? Error = null);

public static class Program
{
    // Cache LiteDatabase instances by file path
    private static readonly Dictionary<string, LiteDatabase> _dbCache = 
        new(StringComparer.OrdinalIgnoreCase);
    
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    public static int Main(string[] args)
    {
        AppDomain.CurrentDomain.ProcessExit += (_, __) => CloseAllDatabases();

        while (Console.ReadLine() is { } line)
        {
            ProcessRequest(line);
        }
        
        CloseAllDatabases();
        return 0;
    }

    private static void ProcessRequest(string line)
    {

        LogInfo($"Received line: {line}");
        try
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                WriteResponse(new BridgeResponse(false, Error: "Empty request"));
                return;
            }

            var request = JsonSerializer.Deserialize<BridgeRequest>(line, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (request is null)
            {
                WriteResponse(new BridgeResponse(false, Error: "Invalid request format"));
                return;
            }

            ExecuteCommand(request);
        }
        catch (Exception ex)
        {
            WriteResponse(new BridgeResponse(false, Error: $"Request error: {ex.Message}"));
            LogError($"Error processing request: {ex}");
        }
    }

    private static void ExecuteCommand(BridgeRequest request)
    {
        try
        {
            switch (request.Command.ToLowerInvariant())
            {
                case "collections":
                    GetCollections(request);
                    break;
                case "fields":
                    GetFields(request);
                    break;
                case "query":
                    ExecuteQuery(request);
                    break;
                case "close":
                    CloseAllDatabases();
                    WriteResponse(new BridgeResponse(true, Data: "Databases closed"));
                    break;
                default:
                    WriteResponse(new BridgeResponse(false, Error: $"Unknown command: {request.Command}"));
                    break;
            }
        }
        catch (Exception ex)
        {
            WriteResponse(new BridgeResponse(false, Error: ex.Message));
            LogError($"Command execution error: {ex}");
        }
    }

    private static LiteDatabase GetDatabase(string dbPath)
    {
        if (_dbCache.TryGetValue(dbPath, out var db))
        {
            return db;
        }

        var connectionString = $"Filename={dbPath};Mode=Shared";
        db = new LiteDatabase(connectionString);
        _dbCache[dbPath] = db;
        
        LogInfo($"Opened database: {dbPath}");
        return db;
    }

    private static void CloseAllDatabases()
    {
        LogInfo("CloseAllDatabases");

        foreach (var (path, db) in _dbCache)
        {
            CloseDatabase(path, db);
        }
        _dbCache.Clear();
    }

    private static void CloseDatabase(string path, LiteDatabase db)
    {
        try
        {
            // Perform checkpoint to flush all changes to disk
            try
            {
                db.Checkpoint();
                LogInfo($"Checkpoint completed for database: {path}");
            }
            catch (Exception checkpointEx)
            {
                LogError($"Error during checkpoint for {path}: {checkpointEx.Message}");
            }

            // Dispose the database
            db.Dispose();
            LogInfo($"Closed database: {path}");

            // Wait a moment to ensure file handles are released
            Thread.Sleep(100);

            // Delete corresponding -log.litedb file if it exists
            try
            {
                var dbDir = Path.GetDirectoryName(path);
                var dbFile = Path.GetFileNameWithoutExtension(path);
                var logFile = Path.Combine(dbDir ?? string.Empty, $"{dbFile}-log.litedb");
                
                if (File.Exists(logFile))
                {
                    // Retry deletion a few times in case of file locks
                    int retries = 3;
                    while (retries > 0)
                    {
                        try
                        {
                            File.Delete(logFile);
                            LogInfo($"Deleted log file: {logFile}");
                            break;
                        }
                        catch (IOException) when (retries > 1)
                        {
                            LogInfo($"Retrying log file deletion for {logFile}, attempts remaining: {retries - 1}");
                            Thread.Sleep(100);
                            retries--;
                        }
                    }
                }
            }
            catch (Exception logEx)
            {
                LogError($"Error deleting log file for {path}: {logEx.Message}");
            }
        }
        catch (Exception ex)
        {
            LogError($"Error closing database {path}: {ex.Message}");
        }
    }

    private static void GetCollections(BridgeRequest request)
    {
        var db = GetDatabase(request.DbPath);
        var names = db.GetCollectionNames().ToArray();
        WriteResponse(new BridgeResponse(true, Data: names));
    }

    private static void GetFields(BridgeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
        {
            WriteResponse(new BridgeResponse(false, Error: "Collection name required in Query field"));
            return;
        }

        var db = GetDatabase(request.DbPath);
        var collectionName = request.Query;

        if (!db.CollectionExists(collectionName))
        {
            WriteResponse(new BridgeResponse(false, Error: $"Collection '{collectionName}' not found"));
            return;
        }

        var collection = db.GetCollection(collectionName);
        var fields = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Sample first N documents for performance
        const int sampleSize = 100;
        var documents = collection.Query().Limit(sampleSize).ToList();
        
        foreach (var doc in documents)
        {
            foreach (var key in doc.Keys)
            {
                fields.Add(key);
            }
        }

        WriteResponse(new BridgeResponse(true, Data: fields.OrderBy(f => f).ToArray()));
    }

    private static void ExecuteQuery(BridgeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
        {
            WriteResponse(new BridgeResponse(false, Error: "Query cannot be empty"));
            return;
        }

        var db = GetDatabase(request.DbPath);
        
        LogInfo($"Executing query: {request.Query}");
        
        try
        {
            var result = db.Execute(request.Query).ToList();
            LogInfo($"Query returned {result.Count} result(s)");
            
            var rows = result.SelectMany(ExpandToRows).ToList();
            LogInfo($"Expanded to {rows.Count} row(s)");

            var columns = rows
                .SelectMany(r => r.Keys)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            WriteResponse(new BridgeResponse(true, Data: new { columns, rows }));
        }
        catch (LiteException ex)
        {
            WriteResponse(new BridgeResponse(false, Error: $"Query error: {ex.Message}"));
        }
    }

    private static IEnumerable<IDictionary<string, object?>> ExpandToRows(BsonValue value)
    {
        if (value.IsDocument)
        {
            return ExpandDocument(value.AsDocument);
        }

        if (value.IsArray)
        {
            return value.AsArray.SelectMany(ExpandToRows);
        }

        return new[] { new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) 
        { 
            ["value"] = ConvertToNative(value) 
        }};
    }

    private static IEnumerable<IDictionary<string, object?>> ExpandDocument(BsonDocument doc)
    {
        // If document has single array field, expand it
        if (doc.Count == 1)
        {
            var first = doc.First();
            if (first.Value.IsArray)
            {
                return first.Value.AsArray.SelectMany(ExpandToRows);
            }
        }

        var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in doc.Keys)
        {
            var bsonValue = doc[key];
            row[key] = ConvertToNative(bsonValue);
        }

        return new[] { (IDictionary<string, object?>)row };
    }

    private static object? ConvertToNative(BsonValue value)
    {
        if (value.IsNull) return null;

        // Handle BSON special types - return them in BSON format
        if (value.IsObjectId)
        {
            return new Dictionary<string, object> { ["$oid"] = value.AsObjectId.ToString() };
        }

        if (value.IsGuid)
        {
            return new Dictionary<string, object> { ["$guid"] = value.AsGuid.ToString() };
        }

        if (value.IsDateTime)
        {
            return new Dictionary<string, object> { ["$date"] = value.AsDateTime.ToString("o") };
        }

        if (value.IsDocument)
        {
            return value.AsDocument.ToDictionary(
                kvp => kvp.Key,
                kvp => ConvertToNative(kvp.Value)
            );
        }

        if (value.IsArray)
        {
            return value.AsArray.Select(ConvertToNative).ToArray();
        }

        // For primitive types (string, number, boolean), return the raw value
        return BsonMapper.Global.Serialize(value).RawValue;
    }

    private static void WriteResponse(BridgeResponse response)
    {
        try
        {
            var json = JsonSerializer.Serialize(response, _jsonOptions);
            Console.WriteLine(json);
            Console.Out.Flush();
        }
        catch (Exception ex)
        {
            LogError($"Error writing response: {ex.Message}");
        }
    }

    private static void LogInfo(string message)
    {
        // Write INFO logs to STDERR for debugging (they won't interfere with JSON responses on STDOUT)
        Console.Error.WriteLine($"[INFO] {DateTime.Now:yyyy-MM-dd HH:mm:ss} - {message}");
    }

    private static void LogError(string message)
    {
        Console.Error.WriteLine($"[ERROR] {DateTime.Now:yyyy-MM-dd HH:mm:ss} - {message}");
    }
}
