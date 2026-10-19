using System.Text.Json;
using Microsoft.Extensions.Options;

namespace LinhaZero.Core.Grids;

/// <summary>The grids listed in index.json: the domains of the system. Read on each call, so a regenerated grid is seen at once.</summary>
public sealed class GridCatalog(IOptions<GridOptions> options)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public string Directory => options.Value.Directory;

    public List<string> Names()
    {
        var index = Path.Combine(Directory, "index.json");
        if (!File.Exists(index))
        {
            return [];
        }

        var entries = JsonSerializer.Deserialize<List<GridIndexEntry>>(File.ReadAllText(index), Json) ?? [];
        return entries.Select(entry => entry.Name).ToList();
    }

    /// <summary>The header of one grid, or null when it does not exist (or the name tries to leave the directory).</summary>
    public GridHeader? Load(string name)
    {
        if (name.Contains('/') || name.Contains('\\') || name.Contains(".."))
        {
            return null;
        }

        var file = Path.Combine(Directory, name, "header.json");
        return File.Exists(file) ? JsonSerializer.Deserialize<GridHeader>(File.ReadAllText(file), Json) : null;
    }

    public List<GridHeader> All() => Names().Select(Load).OfType<GridHeader>().ToList();

    private sealed record GridIndexEntry(string Name);
}
