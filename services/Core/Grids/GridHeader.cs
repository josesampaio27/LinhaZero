namespace LinhaZero.Core.Grids;

/// <summary>What the services read from a grid's header.json (the rest belongs to the engine).</summary>
public sealed record GridHeader(string Name, double OriginX, double OriginY, double CellSize, int Rows, int Cols);
