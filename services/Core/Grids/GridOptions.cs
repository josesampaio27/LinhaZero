namespace LinhaZero.Core.Grids;

/// <summary>Where the grids are: GRIDS_DIR, the read-only mount of web/public/grids in the containers.</summary>
public sealed class GridOptions
{
    /// <summary>Relative to the repo root, which is where `dotnet run` starts the services.</summary>
    public string Directory { get; set; } = "web/public/grids";
}
