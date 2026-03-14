using LiteDB;

// alias System.Text.Json classes to avoid conflict with LiteDB.JsonSerializer
using JsonSerializer = System.Text.Json.JsonSerializer;
using JsonSerializerOptions = System.Text.Json.JsonSerializerOptions;
using JsonNamingPolicy = System.Text.Json.JsonNamingPolicy;

public sealed record BridgeRequest(string Command, string DbPath, string? Query);
public sealed record BridgeResponse(bool Success, object? Data = null, string? Error = null);


public static class Program
{
    // Cache LiteDatabase instances by file path
    private static readonly Dictionary<string, LiteDatabase> _dbCache = new(StringComparer.OrdinalIgnoreCase);

    public static int Main(string[] args)
    {
        AppDomain.CurrentDomain.ProcessExit += (_, __) => CloseAllDbs();
        string? line;
        while ((line = Console.ReadLine()) != null)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(line))
                {
                    Write(new BridgeResponse(false, Error: "Missing request payload"));
                    continue;
                }

                var request = JsonSerializer.Deserialize<BridgeRequest>(line, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (request is null)
                {
                    Write(new BridgeResponse(false, Error: "Invalid request payload"));
                    continue;
                }

                var command = request.Command.ToLowerInvariant();
                int result = command switch
                {
                    "collections" => Collections(request),
                    "fields" => Fields(request),
                    "query" => Query(request),
                    _ => Unknown(request.Command)
                };
                // Optionally, you can break on error, but for now, keep looping
            }
            catch (Exception ex)
            {
                Write(new BridgeResponse(false, Error: ex.Message));
            }
        }
        CloseAllDbs();
        return 0;
    }

    private static LiteDatabase GetDb(string dbPath)
    {
        if (_dbCache.TryGetValue(dbPath, out var db))
        {
            return db;
        }
        var connectionString = $"Filename={dbPath};Mode=Shared";
        db = new LiteDatabase(connectionString);
        _dbCache[dbPath] = db;
        return db;
    }

    private static void CloseAllDbs()
    {
        foreach (var db in _dbCache.Values)
        {
            db.Dispose();
        }
        _dbCache.Clear();
    }

    private static int Unknown(string command)
    {
        Write(new BridgeResponse(false, Error: $"Unsupported command: {command}"));
        return 1;
    }

    private static int Collections(BridgeRequest request)
    {
        var db = GetDb(request.DbPath);
        var names = db.GetCollectionNames().ToArray();
        Write(new BridgeResponse(true, Data: names));
        return 0;
    }

    private static int Fields(BridgeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
        {
            Write(new BridgeResponse(false, Error: "Collection name is required in Query field"));
            return 1;
        }

        var db = GetDb(request.DbPath);
        var collectionName = request.Query;
        // Check if collection exists
        if (!db.CollectionExists(collectionName))
        {
            Write(new BridgeResponse(false, Error: $"Collection '{collectionName}' does not exist"));
            return 1;
        }

        var collection = db.GetCollection(collectionName);
        // Get all distinct field names from the collection
        var fields = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var doc in collection.FindAll())
        {
            foreach (var key in doc.Keys)
            {
                fields.Add(key);
            }
        }
        Write(new BridgeResponse(true, Data: fields.OrderBy(f => f).ToArray()));
        return 0;
    }

    private static int Query(BridgeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
        {
            Write(new BridgeResponse(false, Error: "Query is required"));
            return 1;
        }

        var db = GetDb(request.DbPath);
        // execute query and normalize records into grid rows
        var result = db.Execute(request.Query).ToList();
        var rows = result
            .SelectMany(ExpandToRows)
            .ToList();

        var columns = rows
            .SelectMany(r => r.Keys)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        Write(new BridgeResponse(true, Data: new
        {
            columns,
            rows
        }));
        return 0;
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

        return new[] { new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { ["value"] = ToDisplayString(value) } };
    }

    private static IEnumerable<IDictionary<string, string>> ExpandDocument(BsonDocument doc)
    {
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
            row[key] = ToDisplayString(doc[key]);
        }

        return new[] { (IDictionary<string, string>)row };
    }

    private static string ToDisplayString(BsonValue value)
    {
        if (value.IsNull)
        {
            return string.Empty;
        }

        if (value.IsArray || value.IsDocument)
        {
            return JsonSerializer.Serialize(ToNative(value));
        }

        return BsonMapper.Global.Serialize(value).RawValue?.ToString() ?? string.Empty;
    }

    private static object? ToNative(BsonValue value)
    {
        if (value.IsNull)
        {
            return null;
        }

        if (value.IsDocument)
        {
            return value.AsDocument.ToDictionary(kvp => kvp.Key, kvp => ToNative(kvp.Value));
        }

        if (value.IsArray)
        {
            return value.AsArray.Select(ToNative).ToArray();
        }

        return BsonMapper.Global.Serialize(value).RawValue;
    }

    private static void Write(BridgeResponse response)
    {
        Console.WriteLine(JsonSerializer.Serialize(response, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        }));
    }
}
