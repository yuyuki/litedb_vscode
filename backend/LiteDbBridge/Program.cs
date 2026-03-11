using System.Text.Json;
using LiteDB;

public sealed record BridgeRequest(string Command, string DbPath, string? Query);
public sealed record BridgeResponse(bool Success, object? Data = null, string? Error = null);

public static class Program
{
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0)
            {
                Write(new BridgeResponse(false, Error: "Missing request payload"));
                return 1;
            }

            var request = JsonSerializer.Deserialize<BridgeRequest>(args[0], new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (request is null)
            {
                Write(new BridgeResponse(false, Error: "Invalid request payload"));
                return 1;
            }

            return request.Command.ToLowerInvariant() switch
            {
                "collections" => Collections(request),
                "query" => Query(request),
                _ => Unknown(request.Command)
            };
        }
        catch (Exception ex)
        {
            Write(new BridgeResponse(false, Error: ex.Message));
            return 1;
        }
    }

    private static int Unknown(string command)
    {
        Write(new BridgeResponse(false, Error: $"Unsupported command: {command}"));
        return 1;
    }

    private static int Collections(BridgeRequest request)
    {
        using var db = new LiteDatabase(request.DbPath);
        var names = db.GetCollectionNames().ToArray();
        Write(new BridgeResponse(true, Data: names));
        return 0;
    }

    private static int Query(BridgeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
        {
            Write(new BridgeResponse(false, Error: "Query is required"));
            return 1;
        }

        using var db = new LiteDatabase(request.DbPath);
        var result = db.Execute(request.Query);
        var rows = result.Select(doc => doc.RawValue.AsDocument)
            .Select(doc => doc.Keys.ToDictionary(k => k, k => BsonMapper.Global.Serialize(doc[k]).RawValue?.ToString() ?? string.Empty))
            .Cast<IDictionary<string, string>>()
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

    private static void Write(BridgeResponse response)
    {
        Console.WriteLine(JsonSerializer.Serialize(response, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        }));
    }
}
