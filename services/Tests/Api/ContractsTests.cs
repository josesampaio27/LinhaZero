using System.Text.Json;

namespace LinhaZero.Tests;

/// <summary>Every contracts/examples/*.json must deserialize into the C# records that read it, with no required field missing.</summary>
public class ContractsTests
{
    private static readonly string Dir = Path.Combine(AppContext.BaseDirectory, "contracts");
    private static string Read(string name) => File.ReadAllText(Path.Combine(Dir, name));

    [Fact]
    public void Run_request_example_has_every_field_the_api_reads()
    {
        var request = RunRequestParser.Parse(Read("run-request.json")).Request;
        Assert.Equal("guimaraes", request.Grid);
        Assert.Equal(new Cell(103, 92), request.Ignition);
        Assert.Equal(45, request.Wind.DirectionDeg);
        Assert.Equal(240, request.DurationMin);
        Assert.Equal(200, request.Ensemble.Runs);
        Assert.Equal(2035, request.Ensemble.Seed);
        Assert.Equal(2, request.Decisions.A.Count);
        Assert.Equal(8, request.Decisions.A[0].Cells.Count);
        Assert.Empty(request.Decisions.B);
        Assert.Equal("ipma", request.Weather!.Value.GetProperty("source").GetString());
    }

    [Fact]
    public void Run_request_with_grid_variants_parses_and_keeps_the_variants_for_the_worker()
    {
        // The API does not read variants: the worker validates them with the engine (parseGridVariant, checkVariantBase).
        var (node, r) = RunRequestParser.Parse(Read("run-request-variant.json"));
        Assert.Equal("sintetica", r.Grid);
        Assert.Empty(r.Decisions.B);
        Assert.Equal("setFuel", node["variants"]!["B"]!["edits"]![0]!["kind"]!.GetValue<string>());
        Assert.Null(node["variants"]!["A"]);
    }

    [Fact]
    public void A_missing_required_field_fails()
    {
        Assert.ThrowsAny<JsonException>(() => RunRequestParser.Parse("""{"grid":"guimaraes","ignition":{"row":1,"col":1}}"""));
        Assert.ThrowsAny<JsonException>(() => RunRequestParser.Parse(Read("run-request.json").Replace("\"durationMin\": 240,", "")));
    }

    [Theory]
    [InlineData("\"grid\": \"guimaraes\"", "\"grid\": null")]
    [InlineData("\"ignition\": { \"row\": 103, \"col\": 92 }", "\"ignition\": null")]
    [InlineData("\"A\": [", "\"A\": null, \"X\": [")]
    [InlineData("\"cells\": [\n          { \"row\": 104, \"col\": 91 },", "\"cells\": null, \"x\": [")]
    public void A_null_field_fails(string from, string to)
    {
        var body = Read("run-request.json");
        Assert.Contains(from, body);
        Assert.ThrowsAny<JsonException>(() => RunRequestParser.Parse(body.Replace(from, to)));
    }

    [Fact]
    public void Duplicate_keys_and_non_objects_fail_before_anything_is_stored()
    {
        Assert.ThrowsAny<JsonException>(() => RunRequestParser.Parse(Read("run-request.json").Replace("\"durationMin\": 240,", "\"durationMin\": 240, \"durationMin\": 120,")));
        Assert.ThrowsAny<JsonException>(() => RunRequestParser.Parse("[1,2]"));
        Assert.ThrowsAny<JsonException>(() => RunRequestParser.Parse(""));
        Assert.ThrowsAny<JsonException>(() => RunRequestParser.Parse("null"));
        var (node, request) = RunRequestParser.Parse(Read("run-request.json"));
        Assert.Equal("guimaraes", node["grid"]!.GetValue<string>());
        Assert.Equal(240, request.DurationMin);
    }

    [Fact]
    public void Run_result_and_events_round_trip_as_opaque_json()
    {
        var result = JsonSerializer.Deserialize<JsonElement>(Read("run-result.json"));
        foreach (var f in new[] { "durationMin", "rows", "cols", "A", "B", "elapsedMs" }) Assert.True(result.TryGetProperty(f, out _), f);
        Assert.True(result.GetProperty("A").GetProperty("metrics").TryGetProperty("burnedHaByHour", out _));
        Assert.True(result.GetProperty("A").GetProperty("runs")[0].TryGetProperty("burnedHa", out _));

        var progress = JsonSerializer.Deserialize<RunEvent>(Read("run-event-progress.json"), RunRequestParser.Json)!;
        Assert.Equal(("progress", "running", 1, 2), (progress.Type, progress.Status, progress.Done, progress.Total));
        Assert.Equal("done", JsonSerializer.Deserialize<RunEvent>(Read("run-event-done.json"), RunRequestParser.Json)!.Type);
        Assert.Equal("falhou 3 vezes", JsonSerializer.Deserialize<RunEvent>(Read("run-event-failed.json"), RunRequestParser.Json)!.Error);
    }

    [Fact]
    public void Weather_and_incidents_examples_match_the_response_records()
    {
        var weatherExample = JsonSerializer.Deserialize<JsonElement>(Read("weather.json"));
        var record = JsonSerializer.Deserialize<JsonElement>(JsonSerializer.Serialize(
            new WeatherResponse(new(41.45, -8.29), "observed", null, null, null, [], null, [], "BRG", [], "IPMA observações"), JsonSerializerOptions.Web));
        Assert.Equal(record.EnumerateObject().Select(p => p.Name).Order(), weatherExample.EnumerateObject().Select(p => p.Name).Order());

        var incidentsExample = JsonSerializer.Deserialize<JsonElement>(Read("incidents.json"));
        var incidentsRecord = JsonSerializer.Deserialize<JsonElement>(JsonSerializer.Serialize(
            new IncidentsResponse([new("x", 1, 1, "p", "s", null, "n", new(0, 0, 0))], new("fogos.pt", null, false, null)), JsonSerializerOptions.Web));
        Assert.Equal(incidentsRecord.EnumerateObject().Select(p => p.Name), incidentsExample.EnumerateObject().Select(p => p.Name));
        Assert.Equal(
            incidentsRecord.GetProperty("incidents")[0].EnumerateObject().Select(p => p.Name),
            incidentsExample.GetProperty("incidents")[0].EnumerateObject().Select(p => p.Name));
    }
}
