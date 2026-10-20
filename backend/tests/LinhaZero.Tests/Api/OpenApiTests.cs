using System.Net;
using System.Text.Json;

namespace LinhaZero.Tests;

/// <summary>The OpenAPI document lists exactly the endpoints the web and the smoke test use, and Swagger UI is served.</summary>
public class OpenApiTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _http = factory.CreateClient();

    private async Task<JsonElement> Document()
    {
        var res = await _http.GetAsync("/api/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return JsonSerializer.Deserialize<JsonElement>(await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Lists_every_endpoint_and_nothing_else()
    {
        var doc = await Document();
        var endpoints = doc.GetProperty("paths").EnumerateObject()
            .SelectMany(p => p.Value.EnumerateObject().Select(m => $"{m.Name.ToUpperInvariant()} {p.Name}"))
            .Order()
            .ToList();
        Assert.Equal(new[]
        {
            "GET /api/v1/access-requests",
            "GET /api/v1/health",
            "GET /api/v1/incidents/active",
            "GET /api/v1/me",
            "GET /api/v1/runs/{id}",
            "GET /api/v1/runs/{id}/events",
            "GET /api/v1/runs/{id}/rasters/{decision}/{layer}",
            "GET /api/v1/weather",
            "POST /api/v1/access-requests",
            "POST /api/v1/access-requests/{id}/approve",
            "POST /api/v1/access-requests/{id}/reject",
            "POST /api/v1/runs",
        }.Order(), endpoints);
    }

    [Fact]
    public async Task Post_runs_documents_the_request_body_it_reads_by_hand()
    {
        var doc = await Document();
        var body = doc.GetProperty("paths").GetProperty("/api/v1/runs").GetProperty("post").GetProperty("requestBody");
        Assert.True(body.GetProperty("required").GetBoolean());
        Assert.True(body.GetProperty("content").TryGetProperty("application/json", out var json));
        Assert.Equal("#/components/schemas/RunRequest", json.GetProperty("schema").GetProperty("$ref").GetString());
        var runRequest = doc.GetProperty("components").GetProperty("schemas").GetProperty("RunRequest");
        Assert.True(runRequest.GetProperty("properties").TryGetProperty("ensemble", out _));
    }

    [Fact]
    public async Task Every_operation_is_named_controller_and_action()
    {
        var doc = await Document();
        var ids = doc.GetProperty("paths").EnumerateObject()
            .SelectMany(p => p.Value.EnumerateObject().Select(m => m.Value.GetProperty("operationId").GetString()))
            .Order()
            .ToList();
        Assert.Equal(new[]
        {
            "AccessRequests_Approve", "AccessRequests_Create", "AccessRequests_List", "AccessRequests_Reject", "Health_Get", "Incidents_Active", "Me_Get", "Runs_Create", "Runs_Events", "Runs_Get", "Runs_Raster", "Weather_Get",
        }.Order(), ids);
    }

    [Fact]
    public async Task Swagger_ui_is_served_at_api_docs()
    {
        var res = await _http.GetAsync("/api/docs/index.html");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains("swagger", await res.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
    }
}
