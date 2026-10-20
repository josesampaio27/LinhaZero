using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LinhaZero.Api.Models;
using LinhaZero.Api.Validation;
using Microsoft.AspNetCore.Hosting;

namespace LinhaZero.Tests;

/// <summary>"Pedir acesso": the public form's checks and the admin-only answers (Controllers/AccessRequestsController.cs).</summary>
public class AccessRequestsHttpTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Url = "/api/v1/access-requests";

    private static AccessRequestCreate Valid(string? website = null) =>
        new("Maria Silva", "maria@bombeiros.pt", "Bombeiros Voluntários de Guimarães", "Bombeiros", null, website);

    private static async Task<string> ErrorOf(HttpResponseMessage res) =>
        JsonSerializer.Deserialize<JsonElement>(await res.Content.ReadAsStringAsync()).GetProperty("error").GetString()!;

    private HttpClient Landing()
    {
        var http = factory.CreateAnonymousClient();
        http.DefaultRequestHeaders.Add("X-LinhaZero", "1");
        return http;
    }

    [Fact]
    public async Task A_filled_trap_field_is_accepted_and_dropped()
    {
        var res = await Landing().PostAsJsonAsync(Url, Valid(website: "http://spam.example"));
        Assert.Equal(HttpStatusCode.Accepted, res.StatusCode);
    }

    [Theory]
    [InlineData("", "maria@bombeiros.pt", "Bombeiros GMR", "Bombeiros", "Indique o seu nome.")]
    [InlineData("Maria", "maria", "Bombeiros GMR", "Bombeiros", "Indique um email válido.")]
    [InlineData("Maria", "maria@bombeiros", "Bombeiros GMR", "Bombeiros", "Indique um email válido.")]
    [InlineData("Maria", "maria@bombeiros.pt", " ", "Bombeiros", "Indique a entidade.")]
    [InlineData("Maria", "maria@bombeiros.pt", "Bombeiros GMR", "Marinha", "Escolha o tipo de entidade.")]
    public async Task An_incomplete_form_is_400_with_the_reason(string name, string email, string organization, string type, string error)
    {
        var res = await Landing().PostAsJsonAsync(Url, new AccessRequestCreate(name, email, organization, type, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(error, await ErrorOf(res));
    }

    [Fact]
    public async Task One_address_gets_a_few_tries_an_hour_then_429()
    {
        using var limited = factory.WithWebHostBuilder(b => b.UseSetting("ACCESS_REQUESTS_PER_HOUR", "2"));
        var http = limited.CreateClient();
        HttpResponseMessage last = null!;
        for (var i = 0; i < 3; i++)
        {
            last = await http.PostAsJsonAsync(Url, Valid(website: "trap"));
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, last.StatusCode);
        Assert.Equal("Demasiados pedidos. Tente mais tarde.", await ErrorOf(last));
    }

    [Fact]
    public void Valid_forms_are_trimmed_and_the_email_lowercased()
    {
        var (request, error) = AccessRequestValidator.Validate(new("  Maria  ", " Maria@Bombeiros.PT ", " BV ", "Outra", "  ", null));
        Assert.Null(error);
        Assert.Equal(("Maria", "maria@bombeiros.pt", "BV", null as string), (request!.Name, request.Email, request.Organization, request.Message));
    }

    [Fact]
    public async Task The_landing_may_post_but_another_site_may_not()
    {
        async Task<string?> AllowedOrigin(string origin)
        {
            using var preflight = new HttpRequestMessage(HttpMethod.Options, Url);
            preflight.Headers.Add("Origin", origin);
            preflight.Headers.Add("Access-Control-Request-Method", "POST");
            preflight.Headers.Add("Access-Control-Request-Headers", "content-type,x-linhazero");
            var res = await factory.CreateAnonymousClient().SendAsync(preflight);
            return res.Headers.TryGetValues("Access-Control-Allow-Origin", out var values) ? values.Single() : null;
        }

        Assert.Equal(ApiFactory.LandingOrigin, await AllowedOrigin(ApiFactory.LandingOrigin));
        Assert.Null(await AllowedOrigin("https://evil.example"));
    }

    [Theory]
    [InlineData("GET", Url)]
    [InlineData("POST", Url + "/7f8a3c1e-0000-4000-8000-000000000000/approve")]
    [InlineData("POST", Url + "/7f8a3c1e-0000-4000-8000-000000000000/reject")]
    public async Task Only_admins_see_and_answer_requests(string method, string url)
    {
        var anonymous = await Landing().SendAsync(new HttpRequestMessage(new HttpMethod(method), url));
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        var user = await factory.CreateClient().SendAsync(new HttpRequestMessage(new HttpMethod(method), url));
        Assert.Equal(HttpStatusCode.Forbidden, user.StatusCode);
    }

    [Fact]
    public async Task Me_says_who_is_admin()
    {
        static async Task<bool> IsAdmin(HttpClient http) =>
            JsonSerializer.Deserialize<JsonElement>(await http.GetStringAsync("/api/v1/me")).GetProperty("isAdmin").GetBoolean();

        Assert.False(await IsAdmin(factory.CreateClient()));
        Assert.True(await IsAdmin(factory.CreateAdminClient()));
    }
}
