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
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static int Main(string[] args)
    {
        AppDomain.CurrentDomain.ProcessExit += (_, __) => CloseAllDatabases();
        
        string? line;
        while ((line = Console.ReadLine()) != null)
        {
            ProcessRequest(line);
        }
        
        CloseAllDatabases();
        return 0;
    }

    private static void ProcessRequest(string line)
    {
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
        foreach (var (path, db) in _dbCache)
        {
            try
            {
                db.Dispose();
                LogInfo($"Closed database: {path}");
            }
            catch (Exception ex)
            {
                LogError($"Error closing database {path}: {ex.Message}");
            }
        }
        _dbCache.Clear();
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
        
        try
        {
            var result = db.Execute(request.Query).ToList();
            var rows = result.SelectMany(ExpandToRows).ToList();

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

    private static IEnumerable<IDictionary<string, string>> ExpandToRows(BsonValue value)
    {
        if (value.IsDocument)
        {
            return ExpandDocument(value.AsDocument);
        }

        if (value.IsArray)
        {
            return value.AsArray.SelectMany(ExpandToRows);
        }

        return new[] { new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) 
        { 
            ["value"] = FormatValue(value) 
        }};
    }

    private static IEnumerable<IDictionary<string, string>> ExpandDocument(BsonDocument doc)
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

        var row = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in doc.Keys)
        {
            row[key] = FormatValue(doc[key]);
        }

        return new[] { (IDictionary<string, string>)row };
    }

    private static string FormatValue(BsonValue value)
    {
        if (value.IsNull)
        {
            return string.Empty;
        }

        if (value.IsArray || value.IsDocument)
        {
            return JsonSerializer.Serialize(ConvertToNative(value));
        }

        return BsonMapper.Global.Serialize(value).RawValue?.ToString() ?? string.Empty;
    }

    private static object? ConvertToNative(BsonValue value)
    {
        if (value.IsNull) return null;

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
        Console.Error.WriteLine($"[INFO] {DateTime.Now:yyyy-MM-dd HH:mm:ss} - {message}");
    }

    private static void LogError(string message)
    {
        Console.Error.WriteLine($"[ERROR] {DateTime.Now:yyyy-MM-dd HH:mm:ss} - {message}");
    }
}
