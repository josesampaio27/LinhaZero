using System.Globalization;
using System.Text.Json;

namespace LinhaZero.Tests;

public class WeatherTests
{
    // Guimarães centre. In the fixture (fetched 12:44 UTC) the "Guimarães" station (3.3 km) never reports wind, and
    // "Braga (CIM)" (14.8 km) has wind up to 11:00 but -99 at 12:00.
    private static readonly GeoPoint Guimaraes = new(41.45, -8.29);
    private static readonly Snapshot<IpmaStationsFile> Stations = Fixtures.Load<IpmaStationsFile>("stations");
    private static readonly Snapshot<IpmaObservationsFile> Observations = Fixtures.Load<IpmaObservationsFile>("observations");
    private static readonly Snapshot<IpmaFireRiskFile> FireRisk = Fixtures.Load<IpmaFireRiskFile>("rcm-d0");
    private static readonly Snapshot<IpmaWarningsFile> Warnings = Fixtures.Load<IpmaWarningsFile>("warnings_www");
    private static readonly Snapshot<IpmaDistrictsFile> Districts = Fixtures.Load<IpmaDistrictsFile>("distrits-islands");
    private static readonly Snapshot<OpenMeteoForecast> OpenMeteo = Fixtures.LoadForecast();
    private static readonly WeatherSnapshots All = new(Stations, Observations, FireRisk, Warnings, Districts, OpenMeteo);

    [Theory]
    [InlineData(1, 0)]
    [InlineData(2, 45)]
    [InlineData(8, 315)]
    [InlineData(9, 0)]
    public void Direction_codes_map_to_degrees(int code, double degrees) =>
        Assert.Equal(new WindDirection(true, degrees), WeatherBuilder.Direction(code, 2.0));

    [Fact]
    public void Calm_has_no_direction_and_code_zero_with_wind_is_invalid()
    {
        Assert.Equal(new WindDirection(true, null), WeatherBuilder.Direction(2, 0.0));
        Assert.Equal(new WindDirection(true, null), WeatherBuilder.Direction(0, 0.1));
        Assert.False(WeatherBuilder.Direction(0, 1.0).Valid);
    }

    [Fact]
    public void Guimaraes_point_skips_the_station_without_wind_and_uses_Braga_CIM_at_11h()
    {
        var observed = WeatherBuilder.PickWindStation(Stations.Data!, Observations.Data!, Guimaraes, Observations.FetchedAt!.Value);
        Assert.NotNull(observed);
        Assert.Equal(6212124, observed.Station.Id);
        Assert.Equal("Braga (CIM)", observed.Station.Name);
        Assert.InRange(observed.Station.DistanceKm, 14, 15.5);
        Assert.Equal(3.1, observed.SpeedMs);
        Assert.Equal(new DateTime(2026, 10, 17, 11, 0, 0, DateTimeKind.Utc), observed.ObservedAt);
    }

    [Fact]
    public void Guimaraes_point_takes_humidity_and_temperature_from_the_Guimaraes_station()
    {
        var air = WeatherBuilder.PickAirStation(Stations.Data!, Observations.Data!, Guimaraes, Observations.FetchedAt!.Value);
        Assert.NotNull(air);
        Assert.Equal(1210625, air.Station.Id);
        Assert.InRange(air.Station.DistanceKm, 3, 3.6);
    }

    // Guimarães (1210625, 3.3 km) has no anemometer; Braga (CIM) (6212124, 14.8 km) and Merelim (1210622, 18.6 km) do.
    private static readonly DateTime At1230 = new(2026, 10, 17, 12, 30, 0, DateTimeKind.Utc);

    [Fact]
    public void A_station_whose_newest_hour_has_no_wind_answers_from_the_hour_before()
    {
        var observations = IpmaObservationsFile.Parse("""
            {"2026-10-17T11:00": {"6212124": {"intensidadeVento": 2.6, "idDireccVento": 3}, "1210622": {"intensidadeVento": 1.8, "idDireccVento": 3}},
             "2026-10-17T12:00": {"6212124": {"intensidadeVento": -99.0, "idDireccVento": 0}, "1210622": {"intensidadeVento": 1.9, "idDireccVento": 3}}}
            """);
        var observed = WeatherBuilder.PickWindStation(Stations.Data!, observations, Guimaraes, At1230);
        Assert.NotNull(observed);
        Assert.Equal("Braga (CIM)", observed.Station.Name);
        Assert.Equal(2.6, observed.SpeedMs);
        Assert.Equal(90, observed.DirectionDeg);
        Assert.Equal(new DateTime(2026, 10, 17, 11, 0, 0, DateTimeKind.Utc), observed.ObservedAt);
    }

    [Fact]
    public void Wind_older_than_2_hours_does_not_count()
    {
        var observations = IpmaObservationsFile.Parse("""
            {"2026-10-17T10:00": {"6212124": {"intensidadeVento": 2.6, "idDireccVento": 3}},
             "2026-10-17T12:00": {"1210622": {"intensidadeVento": 1.9, "idDireccVento": 3}}}
            """);
        Assert.Equal("Braga, Merelim", WeatherBuilder.PickWindStation(Stations.Data!, observations, Guimaraes, At1230)!.Station.Name);
    }

    [Fact]
    public void Humidity_and_temperature_come_from_the_nearest_station_even_without_wind()
    {
        var observations = IpmaObservationsFile.Parse("""
            {"2026-10-17T12:00": {"1210625": {"intensidadeVento": -99.0, "idDireccVento": 0, "humidade": 47.0, "temperatura": 13.7},
                                  "1210622": {"intensidadeVento": 1.9, "idDireccVento": 3, "humidade": 80.0, "temperatura": 10.2}}}
            """);
        var air = WeatherBuilder.PickAirStation(Stations.Data!, observations, Guimaraes, At1230);
        Assert.NotNull(air);
        Assert.Equal("Guimarães", air.Station.Name);
        Assert.Equal((47.0, 13.7), (air.HumidityPct, air.TemperatureC));
        Assert.Equal("Braga, Merelim", WeatherBuilder.PickWindStation(Stations.Data!, observations, Guimaraes, At1230)!.Station.Name);
    }

    [Fact]
    public void Missing_humidity_or_temperature_becomes_null_and_a_station_with_neither_is_skipped()
    {
        var observations = IpmaObservationsFile.Parse("""
            {"2026-10-17T12:00": {"1210625": {"humidade": -99.0, "temperatura": -99.0},
                                  "6212124": {"humidade": -99.0, "temperatura": 15.1}}}
            """);
        var air = WeatherBuilder.PickAirStation(Stations.Data!, observations, Guimaraes, At1230);
        Assert.NotNull(air);
        Assert.Equal("Braga (CIM)", air.Station.Name);
        Assert.Null(air.HumidityPct);
        Assert.Equal(15.1, air.TemperatureC);
    }

    [Fact]
    public void Without_a_station_the_model_is_used()
    {
        // Observations older than 2 h before asOf: no station qualifies.
        var fourHoursLater = Observations.FetchedAt!.Value.AddHours(4);
        Assert.Null(WeatherBuilder.PickWindStation(Stations.Data!, Observations.Data!, Guimaraes, fourHoursLater));

        // No station within 25 km (Atlantic, west of Peniche).
        var answer = WeatherBuilder.Build(new GeoPoint(39.4, -9.9), All);
        Assert.Null(answer.Observed);
        Assert.Equal("model", answer.Use);
        Assert.Equal("Open-Meteo", answer.WindSource);
        Assert.NotNull(answer.Model);
    }

    [Fact]
    public void Result_depends_only_on_fixtures_and_their_fetchedAt()
    {
        // Build takes no clock, so a recording made days ago gives the same answer as when it was recorded.
        Assert.Equal(JsonSerializer.Serialize(WeatherBuilder.Build(Guimaraes, All)), JsonSerializer.Serialize(WeatherBuilder.Build(Guimaraes, All)));
        var answer = WeatherBuilder.Build(Guimaraes, All);
        Assert.Equal("observed", answer.Use);
        Assert.Equal(6212124, answer.Observed!.Station.Id);
        Assert.Equal(1210625, answer.Air!.Station.Id);
        Assert.Equal(6, answer.Forecast.Count);
        Assert.All(answer.Sources, source => Assert.False(source.Stale));
    }

    [Fact]
    public void No_station_and_no_model_reports_no_wind()
    {
        var answer = WeatherBuilder.Build(Guimaraes, WeatherSnapshots.AllMissing);
        Assert.Null(answer.Use);
        Assert.Null(answer.WindSource);
        Assert.Equal(6, answer.Sources.Count);
        Assert.All(answer.Sources, source => Assert.Equal("sem dados", source.Error));
    }

    [Fact]
    public void Fire_risk_is_the_nearest_municipality()
    {
        var risk = WeatherBuilder.ParseRcm(FireRisk.Data!, Guimaraes);
        Assert.NotNull(risk);
        Assert.Equal("0308", risk.Municipality);
        var expectedLabel = risk.Level switch { 1 => "Reduzido", 2 => "Moderado", 3 => "Elevado", 4 => "Muito elevado", _ => "Máximo" };
        Assert.Equal(expectedLabel, risk.Label);
        Assert.Equal("2026-10-17", risk.Date);
    }

    [Fact]
    public void Warnings_use_the_nearest_mainland_area_and_drop_green_and_expired()
    {
        Assert.Equal("BRG", WeatherBuilder.WarningArea(Districts.Data!, Guimaraes));
        // The recorded file has only green warnings for BRG.
        Assert.Empty(WeatherBuilder.ParseWarnings(Warnings.Data!, "BRG", Warnings.FetchedAt!.Value));

        var warnings = IpmaWarningsFile.Parse("""
            [{"idAreaAviso":"BRG","awarenessTypeName":"Tempo Quente","awarenessLevelID":"yellow","startTime":"2026-10-17T09:00:00","endTime":"2026-10-17T21:00:00","text":"a"},
             {"idAreaAviso":"BRG","awarenessTypeName":"Vento","awarenessLevelID":"orange","startTime":"2026-10-16T09:00:00","endTime":"2026-10-17T06:00:00","text":"expirado"},
             {"idAreaAviso":"BRG","awarenessTypeName":"Nevoeiro","awarenessLevelID":"green","startTime":"2026-10-17T09:00:00","endTime":"2026-10-20T00:00:00","text":""},
             {"idAreaAviso":"BRG","awarenessTypeName":"Frio","awarenessLevelID":"yellow","startTime":"2026-10-19T09:00:00","endTime":"2026-10-20T00:00:00","text":"longe"},
             {"idAreaAviso":"PTO","awarenessTypeName":"Tempo Quente","awarenessLevelID":"red","startTime":"2026-10-17T09:00:00","endTime":"2026-10-17T21:00:00","text":"outra área"}]
            """);
        var kept = WeatherBuilder.ParseWarnings(warnings, "BRG", new DateTime(2026, 10, 17, 12, 0, 0, DateTimeKind.Utc));
        var only = Assert.Single(kept);
        Assert.Equal("Tempo Quente", only.Type);
        Assert.Equal("yellow", only.Level);
        Assert.Equal(new DateTime(2026, 10, 17, 9, 0, 0, DateTimeKind.Utc), only.Start);
    }

    [Fact]
    public void Forecast_keeps_six_hours_after_fetchedAt()
    {
        var asOf = OpenMeteo.FetchedAt!.Value;
        var (model, forecast) = WeatherBuilder.ParseOpenMeteo(OpenMeteo.Data!, asOf);
        Assert.NotNull(model);
        Assert.Equal(6, forecast.Count);
        Assert.All(forecast, hour => Assert.True(hour.Time > asOf));
        Assert.Equal(DateTimeKind.Utc, forecast[0].Time.Kind);

        // A model value older than 3 h is dropped; the forecast then holds nothing in the future either.
        var (old, _) = WeatherBuilder.ParseOpenMeteo(OpenMeteo.Data!, asOf.AddHours(4));
        Assert.Null(old);
    }

    [Fact]
    public void Forecast_hours_carry_temperature_and_cloud_cover_when_the_answer_has_them()
    {
        var forecast = UpstreamJson.Deserialize<OpenMeteoForecast>("""
            {"current":{"time":"2026-10-17T12:45","wind_speed_10m":4.7,"wind_direction_10m":91,"temperature_2m":20.3,"cloud_cover":35},
             "hourly":{"time":["2026-10-17T13:00","2026-10-17T14:00"],"wind_speed_10m":[4.6,5.0],"wind_direction_10m":[91,95],
                       "relative_humidity_2m":[56,50],"temperature_2m":[21.0,22.5],"cloud_cover":[40,10]}}
            """);
        var reading = WeatherBuilder.ParseOpenMeteo(forecast, new DateTime(2026, 10, 17, 12, 50, 0, DateTimeKind.Utc));

        Assert.Equal(35, reading.Current!.CloudPct);
        Assert.Equal([21.0, 22.5], reading.Forecast.Select(h => h.TemperatureC!.Value));
        Assert.Equal([40.0, 10.0], reading.Forecast.Select(h => h.CloudPct!.Value));
    }

    [Fact]
    public void Open_Meteo_path_uses_a_dot_whatever_the_culture()
    {
        // A culture with a comma decimal separator (pt-PT would do, but needs ICU; a clone works on every machine).
        var comma = (CultureInfo)CultureInfo.InvariantCulture.Clone();
        comma.NumberFormat.NumberDecimalSeparator = ",";
        var before = CultureInfo.CurrentCulture;
        CultureInfo.CurrentCulture = comma;
        try
        {
            Assert.Equal("41,45", 41.45.ToString("F2"));
            var path = OpenMeteoClient.ForecastPath([new GeoPoint(41.45, -8.29), new GeoPoint(41.5, -8.3)]);
            Assert.Contains("latitude=41.4500,41.5000&longitude=-8.2900,-8.3000", path);
            Assert.Contains($"forecast_hours={WeatherBuilder.ForecastHours + 1}", path);
        }
        finally
        {
            CultureInfo.CurrentCulture = before;
        }
    }
}
