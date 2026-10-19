using LinhaZero.Core.Geo;
using LinhaZero.Core.Weather.OpenMeteo;
using ProjNet.CoordinateSystems;
using ProjNet.CoordinateSystems.Transformations;

namespace LinhaZero.Core.Grids;

/// <summary>
/// Open-Meteo answers for points, so ingest pulls a fixed lattice of points per grid and the API answers with the
/// nearest one. Grid coordinates are EPSG:3763 metres, converted with the same transverse Mercator parameters as
/// web/src/lib/projection.ts. Limitation: 3×3 points per grid; national coverage needs a coarse national lattice.
/// </summary>
public static class Lattice
{
    public const int Side = 3;
    private static readonly MathTransform ToWgs84 = CreatePtTm06ToWgs84();

    /// <summary>EPSG:3763 metres to latitude/longitude.</summary>
    public static GeoPoint ToLatLon(double x, double y)
    {
        var (lon, lat) = ToWgs84.Transform(x, y);
        return new GeoPoint(lat, lon);
    }

    /// <summary>The grid corners, as in the browser's gridCorners: NW, NE, SE, SW.</summary>
    public static GeoPoint[] Corners(GridHeader grid)
    {
        var west = grid.OriginX;
        var east = grid.OriginX + grid.Cols * grid.CellSize;
        var north = grid.OriginY;
        var south = grid.OriginY - grid.Rows * grid.CellSize;
        return [ToLatLon(west, north), ToLatLon(east, north), ToLatLon(east, south), ToLatLon(west, south)];
    }

    /// <summary>Side × Side points spread evenly across the grid, row by row from the north-west.</summary>
    public static List<GeoPoint> Points(GridHeader grid)
    {
        var width = grid.Cols * grid.CellSize;
        var height = grid.Rows * grid.CellSize;
        var points = new List<GeoPoint>();
        for (var row = 0; row < Side; row++)
        {
            for (var col = 0; col < Side; col++)
            {
                var x = grid.OriginX + (col + 0.5) * width / Side;
                var y = grid.OriginY - (row + 0.5) * height / Side;
                points.Add(ToLatLon(x, y));
            }
        }

        return points;
    }

    /// <summary>True when the point falls inside the grid's latitude/longitude bounding box.</summary>
    public static bool Contains(GridHeader grid, GeoPoint point)
    {
        var corners = Corners(grid);
        var box = new BoundingBox(corners.Min(c => c.Lon), corners.Min(c => c.Lat), corners.Max(c => c.Lon), corners.Max(c => c.Lat));
        return box.Contains(point.Lat, point.Lon);
    }

    /// <summary>
    /// The grid whose lattice answers for the point: of the grids that contain it, the one whose centre is nearest, so
    /// overlapping grids do not depend on the order of index.json. Null outside every grid (then there is no model).
    /// </summary>
    public static GridHeader? Domain(IEnumerable<GridHeader> grids, GeoPoint point) =>
        grids.Where(grid => Contains(grid, point)).MinBy(grid => Distance.Km(point, Centre(grid)));

    /// <summary>The middle of the grid.</summary>
    public static GeoPoint Centre(GridHeader grid) =>
        ToLatLon(grid.OriginX + grid.Cols * grid.CellSize / 2, grid.OriginY - grid.Rows * grid.CellSize / 2);

    /// <summary>The lattice point nearest to <paramref name="point"/>; each forecast carries its own coordinates.</summary>
    public static OpenMeteoForecast? Nearest(IEnumerable<OpenMeteoForecast> lattice, GeoPoint point) =>
        lattice
            .Where(forecast => forecast.Location is not null)
            .MinBy(forecast => Distance.Km(point, forecast.Location!));

    private static MathTransform CreatePtTm06ToWgs84()
    {
        var factory = new CoordinateSystemFactory();
        var etrs89 = factory.CreateGeographicCoordinateSystem(
            "ETRS89",
            AngularUnit.Degrees,
            HorizontalDatum.ETRF89,
            PrimeMeridian.Greenwich,
            new AxisInfo("Lon", AxisOrientationEnum.East),
            new AxisInfo("Lat", AxisOrientationEnum.North));
        var transverseMercator = factory.CreateProjection("Transverse_Mercator", "Transverse_Mercator",
        [
            new ProjectionParameter("latitude_of_origin", 39.66825833333333),
            new ProjectionParameter("central_meridian", -8.133108333333334),
            new ProjectionParameter("scale_factor", 1),
            new ProjectionParameter("false_easting", 0),
            new ProjectionParameter("false_northing", 0),
        ]);
        var ptTm06 = factory.CreateProjectedCoordinateSystem(
            "PT-TM06",
            etrs89,
            transverseMercator,
            LinearUnit.Metre,
            new AxisInfo("East", AxisOrientationEnum.East),
            new AxisInfo("North", AxisOrientationEnum.North));
        return new CoordinateTransformationFactory().CreateFromCoordinateSystems(ptTm06, GeographicCoordinateSystem.WGS84).MathTransform;
    }
}
