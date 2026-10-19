using System.Globalization;

namespace LinhaZero.Core.Geo;

/// <summary>A longitude/latitude box, edges included.</summary>
public sealed record BoundingBox(double MinLon, double MinLat, double MaxLon, double MaxLat)
{
    public bool Contains(double lat, double lon) => lat >= MinLat && lat <= MaxLat && lon >= MinLon && lon <= MaxLon;

    /// <summary>Reads "minLon,minLat,maxLon,maxLat" (dot decimals, as in the query string).</summary>
    public static bool TryParse(string? text, out BoundingBox box)
    {
        box = new BoundingBox(0, 0, 0, 0);
        var parts = (text ?? "").Split(',');
        if (parts.Length != 4)
        {
            return false;
        }

        var numbers = new double[4];
        for (var i = 0; i < 4; i++)
        {
            var isNumber = double.TryParse(parts[i], NumberStyles.Float, CultureInfo.InvariantCulture, out numbers[i]);
            if (!isNumber || !double.IsFinite(numbers[i]))
            {
                return false;
            }
        }

        box = new BoundingBox(numbers[0], numbers[1], numbers[2], numbers[3]);
        return true;
    }
}
