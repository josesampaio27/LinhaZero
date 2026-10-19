namespace LinhaZero.Core.Geo;

public static class Distance
{
    private const double EarthRadiusKm = 6371;

    /// <summary>Great-circle distance (haversine), in kilometres.</summary>
    public static double Km(GeoPoint from, GeoPoint to)
    {
        var dLat = ToRadians(to.Lat - from.Lat);
        var dLon = ToRadians(to.Lon - from.Lon);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
            + Math.Cos(ToRadians(from.Lat)) * Math.Cos(ToRadians(to.Lat)) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return 2 * EarthRadiusKm * Math.Asin(Math.Sqrt(a));
    }

    private static double ToRadians(double degrees) => degrees * Math.PI / 180;
}
