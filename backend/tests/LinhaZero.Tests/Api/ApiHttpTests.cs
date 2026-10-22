using System.Net;
using System.Text;
using System.Text.Json;

namespace LinhaZero.Tests;

/// <summary>The HTTP answers that need neither Postgres nor NATS: routes, status codes and the { error } bodies.</summary>
public class ApiHttpTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _http = factory.CreateClient();

    private static string Example(string name) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "contracts", name));

    private static async Task<string> ErrorOf(HttpResponseMessage res) =>
        JsonSerializer.Deserialize<JsonElement>(await res.Content.ReadAsStringAsync()).GetProperty("error").GetString()!;

    private Task<HttpResponseMessage> PostRun(string body) =>
        _http.PostAsync("/api/v1/runs", new StringContent(body, Encoding.UTF8, "application/json"));

    [Theory]
    [InlineData("/api/v1/weather")]
    [InlineData("/api/v1/weather?lat=0&lon=0")]
    [InlineData("/api/v1/weather?lat=41.45")]
    [InlineData("/api/v1/weather?lat=abc&lon=-8.29")]
    public async Task Weather_outside_mainland_or_missing_is_400(string url)
    {
        var res = await _http.GetAsync(url);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.StartsWith("lat e lon obrigatórios", await ErrorOf(res));
    }

    [Theory]
    [InlineData("/api/v1/incidents/active")]
    [InlineData("/api/v1/incidents/active?bbox=1,2,3")]
    [InlineData("/api/v1/incidents/active?bbox=a,b,c,d")]
    public async Task Incidents_without_a_valid_bbox_is_400(string url)
    {
        var res = await _http.GetAsync(url);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("bbox=minLon,minLat,maxLon,maxLat obrigatório", await ErrorOf(res));
    }

    [Theory]
    [InlineData("{")]
    [InlineData("[1,2]")]
    [InlineData("""{"grid":"guimaraes","grid":"sintetica"}""")]
    public async Task Malformed_run_request_is_400(string body)
    {
        var res = await PostRun(body);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(RunRequestParser.InvalidBody, await ErrorOf(res));
    }

    [Fact]
    public async Task Run_request_with_an_unknown_grid_is_400()
    {
        var res = await PostRun(Example("run-request.json").Replace("\"guimaraes\"", "\"nada\""));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("grelha \"nada\" desconhecida", await ErrorOf(res));
    }

    [Fact]
    public async Task Valid_run_request_without_the_queue_is_503_so_the_web_runs_in_the_browser()
    {
        var res = await PostRun(Example("run-request.json"));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
        Assert.Equal(RunService.QueueUnavailable, await ErrorOf(res));
    }

    [Theory]
    [InlineData("C", "arrival")]
    [InlineData("A", "speed")]
    public async Task Raster_with_an_unknown_decision_or_layer_is_400(string decision, string layer)
    {
        var res = await _http.GetAsync($"/api/v1/runs/{Guid.NewGuid()}/rasters/{decision}/{layer}");
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("decisão A ou B; camada arrival ou probability", await ErrorOf(res));
    }

    [Fact]
    public async Task Run_ids_that_are_not_guids_are_404()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await _http.GetAsync("/api/v1/runs/123")).StatusCode);
    }

    [Fact]
    public async Task History_of_a_session_without_a_users_row_is_empty()
    {
        // The test user has no users.id (real sessions always do), so it has no runs and the list stops before the database.
        var res = await _http.GetAsync("/api/v1/runs");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("[]", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Everyone_s_history_is_for_admins_only()
    {
        var res = await _http.GetAsync("/api/v1/runs?all=true");
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Equal("só os administradores veem as simulações de todos", await ErrorOf(res));
    }

    [Fact]
    public async Task History_without_a_session_is_401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateAnonymousClient().GetAsync("/api/v1/runs")).StatusCode);
    }

    [Fact]
    public async Task Scenario_of_a_run_is_404_for_a_session_that_did_not_start_it()
    {
        var res = await _http.GetAsync($"/api/v1/runs/{Guid.NewGuid()}/scenario");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Equal("cenário indisponível", await ErrorOf(res));
    }

    [Fact]
    public async Task Health_is_503_and_says_what_is_down()
    {
        var res = await _http.GetAsync("/api/v1/health");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
        Assert.Equal("application/json; charset=utf-8", res.Content.Headers.ContentType?.ToString());
        Assert.Equal("""{"postgres":false,"nats":false,"idleWorkers":0}""", await res.Content.ReadAsStringAsync());
    }
}
