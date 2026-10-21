using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LinhaZero.Api.Models;
using LinhaZero.Api.Validation;
using Microsoft.AspNetCore.Hosting;

namespace LinhaZero.Tests;

/// <summary>"Reportar problema ou sugestão": signed-in only, the form's checks, admin-only reading (Controllers/FeedbackController.cs).</summary>
public class FeedbackHttpTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Url = "/api/v1/feedback";

    private static FeedbackCreate Valid(string kind = "bug", string message = "O mapa não carrega.") =>
        new(kind, message, true, new FeedbackContext("/#/", null, null, "dev", "test", "800x600"));

    private static async Task<string> ErrorOf(HttpResponseMessage res) =>
        JsonSerializer.Deserialize<JsonElement>(await res.Content.ReadAsStringAsync()).GetProperty("error").GetString()!;

    [Fact]
    public async Task Without_a_session_it_is_401()
    {
        var http = factory.CreateAnonymousClient();
        http.DefaultRequestHeaders.Add("X-LinhaZero", "1");
        var res = await http.PostAsJsonAsync(Url, Valid());
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Theory]
    [InlineData("bug", "  ", "Escreva a mensagem.")]
    [InlineData("elogio", "Gosto muito.", "Escolha o tipo: problema, sugestão ou outro.")]
    [InlineData("", "Gosto muito.", "Escolha o tipo: problema, sugestão ou outro.")]
    public async Task An_incomplete_report_is_400_with_the_reason(string kind, string message, string error)
    {
        var res = await factory.CreateClient().PostAsJsonAsync(Url, Valid(kind, message));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(error, await ErrorOf(res));
    }

    [Fact]
    public async Task A_message_over_the_limit_is_400()
    {
        var res = await factory.CreateClient().PostAsJsonAsync(Url, Valid(message: new string('a', FeedbackValidator.MaxMessage + 1)));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task A_session_without_a_users_row_is_403()
    {
        // The test user has no users.id (real sessions always do), so a valid report stops before the database.
        var res = await factory.CreateClient().PostAsJsonAsync(Url, Valid());
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task One_user_gets_a_few_reports_an_hour_then_429()
    {
        using var limited = factory.WithWebHostBuilder(b => b.UseSetting("FEEDBACK_PER_HOUR", "2"));
        var http = limited.CreateClient();
        HttpResponseMessage last = null!;
        for (var i = 0; i < 3; i++)
        {
            last = await http.PostAsJsonAsync(Url, Valid(message: "")); // 400s still count
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, last.StatusCode);
    }

    [Fact]
    public async Task Only_admins_read_and_close_reports()
    {
        var user = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync(Url)).StatusCode);
        var close = await user.PostAsJsonAsync($"{Url}/{Guid.NewGuid()}/status", new FeedbackStatusChange("done"));
        Assert.Equal(HttpStatusCode.Forbidden, close.StatusCode);
    }

    [Fact]
    public async Task An_unknown_status_is_400()
    {
        var res = await factory.CreateAdminClient().PostAsJsonAsync($"{Url}/{Guid.NewGuid()}/status", new FeedbackStatusChange("lost"));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("Estado inválido.", await ErrorOf(res));
    }

    [Fact]
    public void Valid_reports_are_trimmed_and_long_context_cut()
    {
        var body = new FeedbackCreate(" suggestion ", "  Mais cenários.  ", false, new FeedbackContext(" ", null, null, null, new string('x', 900), null));
        var (report, error) = FeedbackValidator.Validate(body);
        Assert.Null(error);
        Assert.Equal(("suggestion", "Mais cenários."), (report!.Kind, report.Message));
        Assert.Null(report.Context!.Page);
        Assert.Equal(FeedbackValidator.MaxContextField, report.Context.UserAgent!.Length);
    }

    [Fact]
    public void A_report_without_context_gets_an_empty_one()
    {
        var (report, _) = FeedbackValidator.Validate(new FeedbackCreate("other", "Olá", false, null));
        Assert.NotNull(report!.Context);
    }
}
