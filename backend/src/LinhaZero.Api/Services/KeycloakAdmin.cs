using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace LinhaZero.Api.Services;

/// <summary>Where Keycloak's admin API is and how the API signs in to it (KEYCLOAK_URL, KEYCLOAK_ADMIN_CLIENT_*, APP_URL).</summary>
public sealed class KeycloakAdminOptions
{
    /// <summary>Keycloak inside the network (http://keycloak:8080), not the public address.</summary>
    public string BaseUrl { get; set; } = "http://localhost:8080";

    public string Realm { get; set; } = "linhazero";

    /// <summary>The API's own client (client credentials), allowed only to manage users.</summary>
    public string ClientId { get; set; } = "linhazero-api-admin";

    public string? ClientSecret { get; set; }

    /// <summary>The app, where the invite's "back to the application" link leads (through the login).</summary>
    public string AppUrl { get; set; } = "https://app.linhazero.localhost/";

    /// <summary>The client the invite belongs to, so Keycloak shows the link back to the app.</summary>
    public string AppClientId { get; set; } = "linhazero-app";

    public TimeSpan InviteLifespan { get; set; } = TimeSpan.FromDays(7);
}

/// <summary>Creates accounts in Keycloak. An interface so the HTTP tests can stand in for Keycloak.</summary>
public interface IKeycloakAdmin
{
    /// <summary>
    /// Creates the user (or finds the one with this email) and has Keycloak email them a link to set their password.
    /// Returns the Keycloak user id.
    /// </summary>
    Task<string> InviteAsync(string email, string name, CancellationToken ct);
}

/// <summary>Keycloak's admin REST API, signed in with the client credentials of linhazero-api-admin.</summary>
public sealed class KeycloakAdmin(HttpClient http, IOptions<KeycloakAdminOptions> options, ILogger<KeycloakAdmin> log) : IKeycloakAdmin
{
    private readonly KeycloakAdminOptions _options = options.Value;
    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private string? _token;
    private DateTimeOffset _tokenExpires;

    private string Admin => $"{_options.BaseUrl.TrimEnd('/')}/admin/realms/{_options.Realm}";

    public async Task<string> InviteAsync(string email, string name, CancellationToken ct)
    {
        var userId = await CreateOrFindAsync(email, name, ct);

        // The invite: a link to set the password, valid for InviteLifespan, then back to the app through the login.
        var redirect = new Uri(new Uri(_options.AppUrl), "api/auth/login").ToString();
        var url = $"{Admin}/users/{userId}/execute-actions-email?client_id={Uri.EscapeDataString(_options.AppClientId)}"
            + $"&redirect_uri={Uri.EscapeDataString(redirect)}&lifespan={(int)_options.InviteLifespan.TotalSeconds}";
        using var send = await SendAsync(HttpMethod.Put, url, JsonContent.Create(new[] { "UPDATE_PASSWORD" }), ct);
        await EnsureAsync(send, "enviar o convite", ct);
        log.LogInformation("Convite enviado para {Email} (utilizador {UserId})", email, userId);
        return userId;
    }

    private async Task<string> CreateOrFindAsync(string email, string name, CancellationToken ct)
    {
        var space = name.IndexOf(' ', StringComparison.Ordinal);
        var user = new
        {
            username = email,
            email,
            enabled = true,
            emailVerified = true,
            firstName = space < 0 ? name : name[..space],
            lastName = space < 0 ? "" : name[(space + 1)..],
        };
        using var create = await SendAsync(HttpMethod.Post, $"{Admin}/users", JsonContent.Create(user), ct);
        if (create.StatusCode == HttpStatusCode.Created && create.Headers.Location is { } location)
        {
            return location.Segments[^1];
        }

        if (create.StatusCode != HttpStatusCode.Conflict)
        {
            await EnsureAsync(create, "criar o utilizador", ct);
        }

        // Already there (asked twice, or created by hand): invite the existing account.
        using var find = await SendAsync(HttpMethod.Get, $"{Admin}/users?email={Uri.EscapeDataString(email)}&exact=true", null, ct);
        await EnsureAsync(find, "procurar o utilizador", ct);
        var found = await find.Content.ReadFromJsonAsync<List<KeycloakUser>>(ct);
        return found is [{ Id: { } id }, ..] ? id : throw new KeycloakAdminException("O Keycloak diz que o utilizador existe mas não o encontra.");
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, HttpContent? content, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, url) { Content = content };
        request.Headers.Authorization = new("Bearer", await TokenAsync(ct));
        return await http.SendAsync(request, ct);
    }

    private async Task<string> TokenAsync(CancellationToken ct)
    {
        await _tokenLock.WaitAsync(ct);
        try
        {
            if (_token is not null && DateTimeOffset.UtcNow < _tokenExpires)
            {
                return _token;
            }

            using var form = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = _options.ClientId,
                ["client_secret"] = _options.ClientSecret ?? "",
            });
            using var res = await http.PostAsync($"{_options.BaseUrl.TrimEnd('/')}/realms/{_options.Realm}/protocol/openid-connect/token", form, ct);
            await EnsureAsync(res, "entrar na administração do Keycloak", ct);
            var token = await res.Content.ReadFromJsonAsync<TokenResponse>(ct) ?? throw new KeycloakAdminException("Resposta vazia do Keycloak.");
            _token = token.AccessToken;
            _tokenExpires = DateTimeOffset.UtcNow.AddSeconds(Math.Max(0, token.ExpiresIn - 30));
            return _token;
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    private async Task EnsureAsync(HttpResponseMessage res, string what, CancellationToken ct)
    {
        if (res.IsSuccessStatusCode)
        {
            return;
        }

        var body = await res.Content.ReadAsStringAsync(ct);
        log.LogError("Keycloak falhou a {What}: {Status} {Body}", what, (int)res.StatusCode, body);
        throw new KeycloakAdminException($"Não foi possível {what} ({(int)res.StatusCode}).");
    }

    private sealed record TokenResponse([property: JsonPropertyName("access_token")] string AccessToken, [property: JsonPropertyName("expires_in")] int ExpiresIn);

    private sealed record KeycloakUser(string? Id);
}

/// <summary>Keycloak refused or did not answer; the message is Portuguese and shown to the admin.</summary>
public sealed class KeycloakAdminException(string message) : Exception(message);
