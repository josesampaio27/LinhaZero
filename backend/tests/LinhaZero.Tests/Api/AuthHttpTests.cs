using System.Net;
using System.Text;
using System.Text.Json;

namespace LinhaZero.Tests;

/// <summary>What the login guards (Auth/AuthSetup.cs): sessions, the CSRF header and the login's return address.</summary>
public class AuthHttpTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static async Task<string> ErrorOf(HttpResponseMessage res) =>
        JsonSerializer.Deserialize<JsonElement>(await res.Content.ReadAsStringAsync()).GetProperty("error").GetString()!;

    [Theory]
    [InlineData("/api/v1/weather?lat=41.45&lon=-8.29")]
    [InlineData("/api/v1/incidents/active?bbox=-9,41,-8,42")]
    [InlineData("/api/v1/me")]
    [InlineData("/api/v1/assistant/status")]
    [InlineData("/api/v1/runs/7f8a3c1e-0000-4000-8000-000000000000")]
    public async Task Without_a_session_the_api_answers_401_json(string url)
    {
        var res = await factory.CreateAnonymousClient().GetAsync(url);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal("É preciso entrar.", await ErrorOf(res));
    }

    [Fact]
    public async Task Health_needs_no_session()
    {
        var res = await factory.CreateAnonymousClient().GetAsync("/api/v1/health");
        Assert.NotEqual(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Me_returns_the_signed_in_user()
    {
        var me = JsonSerializer.Deserialize<JsonElement>(await factory.CreateClient().GetStringAsync("/api/v1/me"));
        Assert.Equal("Utilizador de teste", me.GetProperty("name").GetString());
        Assert.Equal("teste@linhazero.localhost", me.GetProperty("email").GetString());
    }

    [Fact]
    public async Task A_post_without_the_csrf_header_is_403_even_with_a_session()
    {
        var http = factory.CreateClient();
        http.DefaultRequestHeaders.Remove("X-LinhaZero");
        var res = await http.PostAsync("/api/v1/runs", new StringContent("{}", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Equal("Falta o cabeçalho X-LinhaZero.", await ErrorOf(res));
    }

    [Theory]
    [InlineData("https://evil.example/")]
    [InlineData("//evil.example/")]
    [InlineData("/\\evil.example")]
    public async Task Login_refuses_a_return_address_off_the_site(string returnUrl)
    {
        var res = await factory.CreateAnonymousClient().GetAsync("/api/auth/login?returnUrl=" + Uri.EscapeDataString(returnUrl));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Login_when_already_signed_in_goes_straight_back()
    {
        var http = factory.CreateClient(new() { AllowAutoRedirect = false });
        var res = await http.GetAsync("/api/auth/login?returnUrl=%2F%3Fscenario%3Dx");
        Assert.Equal(HttpStatusCode.Redirect, res.StatusCode);
        Assert.Equal("/?scenario=x", res.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Logout_without_a_session_still_says_where_to_go()
    {
        var http = factory.CreateAnonymousClient();
        http.DefaultRequestHeaders.Add("X-LinhaZero", "1");
        var res = await http.PostAsync("/api/auth/logout", null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.True(JsonSerializer.Deserialize<JsonElement>(await res.Content.ReadAsStringAsync()).TryGetProperty("redirect", out _));
    }
}
