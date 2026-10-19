namespace LinhaZero.Tests;

public class LatticeTests
{
    // web/public/grids/guimaraes/header.json and sintetica/header.json (only the fields the services read).
    private static readonly GridHeader Guimaraes = new("guimaraes", -20700, 205700, 100, 157, 152);
    private static readonly GridHeader Sintetica = new("sintetica", -17500, 207500, 100, 150, 150);

    // gridCorners(header) from web/src/lib/projection.ts (proj4), copied once: NW, NE, SE, SW as [lng, lat].
    private static readonly double[][] BrowserCorners =
    [
        [-8.381101549577238, 41.52037490126934], [-8.199000526336645, 41.52062340264013],
        [-8.198857645283628, 41.37926179653551], [-8.380563805721671, 41.37901451965827],
    ];

    [Fact]
    public void Corners_match_the_browser_projection()
    {
        var corners = Lattice.Corners(Guimaraes);
        for (var i = 0; i < 4; i++)
        {
            Assert.Equal(BrowserCorners[i][0], corners[i].Lon, 1e-5);
            Assert.Equal(BrowserCorners[i][1], corners[i].Lat, 1e-5);
        }
    }

    [Fact]
    public void Nine_points_inside_the_bbox()
    {
        var points = Lattice.Points(Guimaraes);
        Assert.Equal(9, points.Count);
        Assert.Equal(9, points.Distinct().Count());
        Assert.All(points, point => Assert.True(Lattice.Contains(Guimaraes, point)));
        // About 5 km apart for Guimarães (15.2 km / 3 across).
        Assert.InRange(Distance.Km(points[0], points[1]), 4.5, 5.5);
    }

    [Fact]
    public void A_point_picks_its_nearest_lattice_point()
    {
        var lattice = Lattice.Points(Guimaraes)
            .Select(point => new OpenMeteoForecast { Latitude = point.Lat, Longitude = point.Lon })
            .ToList();

        // The Penha cell (103, 92): row 103 of 157 and col 92 of 152 fall in the middle third both ways → index 4.
        var penha = Lattice.ToLatLon(-20700 + 92.5 * 100, 205700 - 103.5 * 100);
        Assert.Equal(4, lattice.IndexOf(Lattice.Nearest(lattice, penha)!));
        // The NW corner → index 0.
        Assert.Equal(0, lattice.IndexOf(Lattice.Nearest(lattice, new GeoPoint(41.52, -8.38))!));
        Assert.Null(Lattice.Nearest([], new GeoPoint(41.45, -8.29)));
    }

    [Fact]
    public void Overlapping_grids_answer_with_the_one_whose_centre_is_nearest_whatever_their_order()
    {
        var guimaraesCentre = Lattice.Centre(Guimaraes);
        Assert.Equal("guimaraes", Lattice.Domain([Sintetica, Guimaraes], guimaraesCentre)!.Name);
        Assert.Equal("guimaraes", Lattice.Domain([Guimaraes, Sintetica], guimaraesCentre)!.Name);
        Assert.Equal("sintetica", Lattice.Domain([Guimaraes, Sintetica], Lattice.Centre(Sintetica))!.Name);
    }

    [Fact]
    public void Outside_every_domain_there_is_no_model()
    {
        GridHeader[] domains = [Guimaraes, Sintetica];
        Assert.Equal("guimaraes", Lattice.Domain(domains, new GeoPoint(41.45, -8.29))!.Name);
        Assert.Equal("sintetica", Lattice.Domain(domains, new GeoPoint(41.52, -8.17))!.Name);
        Assert.Null(Lattice.Domain(domains, new GeoPoint(38.72, -9.14))); // Lisbon
    }
}
