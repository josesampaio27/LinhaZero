using System.Globalization;
using LinhaZero.Core.Geo;
using LinhaZero.Core.Incidents.Fogos;
using LinhaZero.Core.Sources;

namespace LinhaZero.Core.Incidents;

/// <summary>Pure: the rural fires of a fogos.pt list that fall inside a box, normalised.</summary>
public static class IncidentParser
{
    private static readonly string[] RuralNatures = ["Mato", "Florestal", "Agrícola"];
    private static readonly TimeZoneInfo Lisbon = TimeZoneInfo.FindSystemTimeZoneById("Europe/Lisbon");

    public static IncidentsResponse Build(Snapshot<FogosActiveFile> fogos, BoundingBox box)
    {
        var incidents = fogos.Data is { } file ? Parse(file, box) : [];
        return new IncidentsResponse(incidents, SourceStatus.From("fogos.pt", fogos));
    }

    public static List<Incident> Parse(FogosActiveFile file, BoundingBox box)
    {
        var result = new List<Incident>();
        foreach (var incident in file.Incidents)
        {
            if (!IsRuralFire(incident) || incident.Lat is not { } lat || incident.Lon is not { } lon || !box.Contains(lat, lon))
            {
                continue;
            }

            var resources = new IncidentResources((int)(incident.People ?? 0), (int)(incident.Vehicles ?? 0), (int)(incident.Aerial ?? 0));
            result.Add(new Incident(
                incident.Id ?? string.Create(CultureInfo.InvariantCulture, $"{lat}_{lon}"),
                lat,
                lon,
                PlaceOf(incident),
                incident.Status ?? "",
                StartedAt(incident),
                incident.Nature ?? "",
                resources));
        }

        return result;
    }

    /// <summary>isFire when fogos.pt says so; otherwise the rural natures seen in the sample.</summary>
    private static bool IsRuralFire(FogosIncident incident)
    {
        if (incident.IsFire is { } isFire)
        {
            return isFire;
        }

        var nature = incident.Nature ?? "";
        return RuralNatures.Any(rural => nature.Contains(rural, StringComparison.OrdinalIgnoreCase));
    }

    private static string PlaceOf(FogosIncident incident)
    {
        if (incident.Location is { } location)
        {
            return location;
        }

        string?[] parts = [incident.Municipality, incident.Parish];
        return string.Join(", ", parts.Where(part => !string.IsNullOrEmpty(part)));
    }

    /// <summary>dateTime.sec (epoch seconds) when present; otherwise "date" + "hour", which are Lisbon local time.</summary>
    private static DateTime? StartedAt(FogosIncident incident)
    {
        if (incident.DateTime?.Seconds is { } seconds)
        {
            return DateTimeOffset.FromUnixTimeSeconds((long)seconds).UtcDateTime;
        }

        if (incident.Date is null || incident.Hour is null)
        {
            return null;
        }

        var isDate = DateTime.TryParseExact(
            $"{incident.Date} {incident.Hour}", "dd-MM-yyyy HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var local);
        return isDate ? TimeZoneInfo.ConvertTimeToUtc(local, Lisbon) : null;
    }
}
