using System.Security.Claims;
using System.Threading.RateLimiting;
using LinhaZero.Api.Models;
using LinhaZero.Api.Repositories;
using LinhaZero.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Npgsql;

namespace LinhaZero.Api.Auth;

/// <summary>
/// The login (docs/decisoes/0061): the API is the OpenID Connect client of Keycloak (account.&lt;domain&gt;) and keeps the
/// session in its own encrypted cookie, so the browser never holds a token. Settings come from the environment
/// (infra/README.md): OIDC_AUTHORITY, OIDC_METADATA_ADDRESS, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, LANDING_URL.
/// </summary>
public static class AuthSetup
{
    public const string CookieName = "__Host-lz_session";

    /// <summary>The header every non-GET request must carry. A cross-site form cannot set it, so it stops CSRF.</summary>
    public const string CsrfHeader = "X-LinhaZero";

    /// <summary>The claim with our own users.id (infra/db/002_users.sql), set at login.</summary>
    public const string UserIdClaim = "lz_user";

    /// <summary>The Keycloak realm role of the people who answer access requests (docs/decisoes/0062).</summary>
    public const string AdminRole = "linhazero-admin";

    public const string AdminPolicy = "admin";

    /// <summary>The CORS policy that lets the landing (another subdomain) post an access request.</summary>
    public const string LandingCors = "landing";

    /// <summary>The rate limit on access requests: ACCESS_REQUESTS_PER_HOUR (5 by default) from one address.</summary>
    public const string AccessRequestLimit = "access-requests";

    /// <summary>The rate limit on problem reports and suggestions: FEEDBACK_PER_HOUR (20 by default) per user.</summary>
    public const string FeedbackLimit = "feedback";

    /// <summary>Our users.id for the signed-in person (null for the test user, who is not in the table).</summary>
    public static Guid? UserId(ClaimsPrincipal user) => Guid.TryParse(user.FindFirst(UserIdClaim)?.Value, out var id) ? id : null;

    /// <summary>The id_token, handed from the logout action to the sign-out redirect below.</summary>
    public const string IdTokenItem = "lz.id_token";

    private static readonly TimeSpan Idle = TimeSpan.FromHours(8);
    private static readonly TimeSpan Absolute = TimeSpan.FromHours(12);
    private const string StartedItem = "lz.started";

    public static IServiceCollection AddLinhaZeroAuth(this IServiceCollection services, IConfiguration config)
    {
        var landingUrl = config["LANDING_URL"] ?? "/";

        services.Configure<ForwardedHeadersOptions>(forwarded =>
        {
            // Caddy locally, the ingress in the cluster: the API is only reachable through them (and on loopback).
            forwarded.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
            forwarded.KnownIPNetworks.Clear();
            forwarded.KnownProxies.Clear();
        });

        // The cookie keys live in Postgres, so every API replica reads every cookie and a restart logs nobody out.
        services.AddDataProtection().SetApplicationName("linhazero-api");
        services.AddSingleton<IConfigureOptions<KeyManagementOptions>>(provider =>
            new ConfigureOptions<KeyManagementOptions>(keys => keys.XmlRepository = new PgXmlRepository(provider.GetRequiredService<NpgsqlDataSource>())));

        services
            .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(cookie =>
            {
                cookie.Cookie.Name = CookieName;
                cookie.CookieManager = new HostPrefixCookieManager();
                cookie.Cookie.HttpOnly = true;
                cookie.Cookie.SecurePolicy = CookieSecurePolicy.Always;
                cookie.Cookie.SameSite = SameSiteMode.Lax;
                cookie.Cookie.Path = "/";
                cookie.ExpireTimeSpan = Idle;
                cookie.SlidingExpiration = true;
                cookie.Events.OnRedirectToLogin = context => WriteError(context.Response, StatusCodes.Status401Unauthorized, "É preciso entrar.");
                cookie.Events.OnRedirectToAccessDenied = context => WriteError(context.Response, StatusCodes.Status403Forbidden, "Sem acesso.");
                cookie.Events.OnSigningIn = context =>
                {
                    context.Properties.Items[StartedItem] = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
                    return Task.CompletedTask;
                };
                cookie.Events.OnValidatePrincipal = async context =>
                {
                    // Sliding renewal keeps an active session alive, but never past 12 h from the login.
                    if (!context.Properties.Items.TryGetValue(StartedItem, out var started)
                        || !long.TryParse(started, out var seconds)
                        || DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeSeconds(seconds) > Absolute)
                    {
                        context.RejectPrincipal();
                        await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                    }
                };
            })
            .AddOpenIdConnect(oidc =>
            {
                oidc.Authority = config["OIDC_AUTHORITY"] ?? "https://account.linhazero.localhost/realms/linhazero";
                if (config["OIDC_METADATA_ADDRESS"] is { Length: > 0 } metadata)
                {
                    // Inside the network the discovery document is read over plain HTTP from the Keycloak service;
                    // the issuer in it is still the public https one, and that is what the tokens are checked against.
                    oidc.MetadataAddress = metadata;
                    oidc.RequireHttpsMetadata = metadata.StartsWith("https://", StringComparison.Ordinal);
                }

                oidc.ClientId = config["OIDC_CLIENT_ID"] ?? "linhazero-app";
                oidc.ClientSecret = config["OIDC_CLIENT_SECRET"];
                oidc.ResponseType = OpenIdConnectResponseType.Code;
                oidc.UsePkce = true;
                oidc.CallbackPath = "/api/auth/callback";
                oidc.SignedOutCallbackPath = "/api/auth/signout-callback";
                oidc.Scope.Clear();
                oidc.Scope.Add("openid");
                oidc.Scope.Add("profile");
                oidc.Scope.Add("email");
                oidc.MapInboundClaims = false;
                oidc.GetClaimsFromUserInfoEndpoint = false;
                oidc.SaveTokens = false;
                oidc.TokenValidationParameters.NameClaimType = "name";
                // When Keycloak's signing keys change (rotation, a reset realm), fetch them again after 30 s, not 5 min.
                oidc.RefreshInterval = TimeSpan.FromSeconds(30);

                oidc.Events.OnTokenValidated = async context =>
                {
                    var principal = context.Principal!;
                    string? Claim(string type) => principal.FindFirst(type)?.Value;
                    var issuer = Claim("iss")!;
                    var subject = Claim("sub")!;
                    var email = Claim("email");
                    var name = Claim("name") ?? email ?? subject;

                    var users = context.HttpContext.RequestServices.GetRequiredService<UserRepository>();
                    var isAdmin = principal.FindAll("roles").Any(role => role.Value == AdminRole);
                    var userId = await users.UpsertOnLoginAsync(issuer, subject, email, name, isAdmin, context.HttpContext.RequestAborted);

                    // Only what the API needs goes in the cookie: who it is, and the id_token for a clean logout.
                    var identity = new ClaimsIdentity(
                        [
                            new Claim(UserIdClaim, userId.ToString()),
                            new Claim("sub", subject),
                            new Claim("name", name),
                            .. email is null ? Array.Empty<Claim>() : [new Claim("email", email)],
                            // Realm roles (the "roles" claim of the client's mapper): read again at each login.
                            .. principal.FindAll("roles").Select(role => new Claim("role", role.Value)),
                        ],
                        context.Principal!.Identity!.AuthenticationType,
                        "name",
                        "role");
                    context.Principal = new ClaimsPrincipal(identity);
                    // In the code flow the id_token comes in the token endpoint's answer, not in the callback itself.
                    var idToken = context.TokenEndpointResponse?.IdToken ?? context.ProtocolMessage.IdToken;
                    context.Properties!.StoreTokens([new AuthenticationToken { Name = "id_token", Value = idToken }]);
                };

                // Logout is a fetch from the app: answer with where to go instead of a redirect fetch cannot follow.
                oidc.Events.OnRedirectToIdentityProviderForSignOut = async context =>
                {
                    context.ProtocolMessage.PostLogoutRedirectUri = landingUrl;
                    if (context.Properties.Items.TryGetValue(IdTokenItem, out var idToken) && idToken is not null)
                    {
                        context.ProtocolMessage.IdTokenHint = idToken;
                    }

                    context.HandleResponse();
                    context.Response.StatusCode = StatusCodes.Status200OK;
                    await context.Response.WriteAsJsonAsync(new LogoutResponse(context.ProtocolMessage.CreateLogoutRequestUrl()));
                };

                // A cancelled or broken login (expired state, Keycloak error) goes back to the landing, not to an error page.
                oidc.Events.OnRemoteFailure = context =>
                {
                    context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>()
                        .CreateLogger("LinhaZero.Api.Auth").LogWarning(context.Failure, "Login falhou");
                    context.Response.Redirect(landingUrl);
                    context.HandleResponse();
                    return Task.CompletedTask;
                };
            });

        // Every endpoint needs a session unless it says [AllowAnonymous].
        services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
            .AddPolicy(AdminPolicy, policy => policy.RequireAuthenticatedUser().RequireRole(AdminRole));

        // The landing posts access requests from its own subdomain: only its origins, only that endpoint.
        var landingOrigins = (config["CORS_ORIGINS"] ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        services.AddCors(cors => cors.AddPolicy(LandingCors, policy =>
            policy.WithOrigins(landingOrigins).WithMethods("POST").WithHeaders("content-type", CsrfHeader)));

        var perHour = int.TryParse(config["ACCESS_REQUESTS_PER_HOUR"], out var limit) && limit > 0 ? limit : 5;
        var feedbackPerHour = int.TryParse(config["FEEDBACK_PER_HOUR"], out var feedbackLimit) && feedbackLimit > 0 ? feedbackLimit : 20;
        services.AddRateLimiter(limiter =>
        {
            limiter.AddPolicy(AccessRequestLimit, context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "?",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = perHour, Window = TimeSpan.FromHours(1) }));
            // Per signed-in user (the rate limiter runs after authentication); by name for test sessions without a users row.
            limiter.AddPolicy(FeedbackLimit, context => RateLimitPartition.GetFixedWindowLimiter(
                UserId(context.User)?.ToString() ?? context.User.Identity?.Name ?? "?",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = feedbackPerHour, Window = TimeSpan.FromHours(1) }));
            limiter.OnRejected = (context, _) =>
                new ValueTask(WriteError(context.HttpContext.Response, StatusCodes.Status429TooManyRequests, "Demasiados pedidos. Tente mais tarde."));
        });

        services.AddSingleton<UserRepository>();
        services.AddSingleton<AccessRequestRepository>();
        services.AddSingleton<FeedbackRepository>();
        services.Configure<KeycloakAdminOptions>(keycloak =>
        {
            keycloak.BaseUrl = config["KEYCLOAK_URL"] ?? keycloak.BaseUrl;
            keycloak.ClientId = config["KEYCLOAK_ADMIN_CLIENT_ID"] ?? keycloak.ClientId;
            keycloak.ClientSecret = config["KEYCLOAK_ADMIN_CLIENT_SECRET"];
            keycloak.AppUrl = config["APP_URL"] ?? keycloak.AppUrl;
        });
        services.AddHttpClient<IKeycloakAdmin, KeycloakAdmin>(http => http.Timeout = TimeSpan.FromSeconds(20));

        // The email to every admin on each access request (docs/decisoes/0067).
        services.Configure<SmtpOptions>(smtp => smtp.ReadFrom(config));
        services.Configure<AccessRequestEmailOptions>(email =>
        {
            email.PerDay = int.TryParse(config["ACCESS_REQUEST_EMAILS_PER_DAY"], out var perDay) && perDay >= 0 ? perDay : email.PerDay;
            email.AppUrl = config["APP_URL"] ?? email.AppUrl;
        });
        services.AddSingleton<IEmailSender, SmtpEmailSender>();
        services.AddSingleton<AccessRequestNotifier>();
        return services;
    }

    /// <summary>Forwarded headers, CORS, the CSRF check, authentication, authorization and rate limits, in that order.</summary>
    public static WebApplication UseLinhaZeroAuth(this WebApplication app)
    {
        app.UseForwardedHeaders();
        app.UseCors();
        app.Use(async (context, next) =>
        {
            var request = context.Request;
            var safe = HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method) || HttpMethods.IsOptions(request.Method);
            // The login callback is Keycloak's form post (protected by its own state and nonce), the only exception.
            var callback = request.Path.StartsWithSegments("/api/auth/callback");
            if (!safe && !callback && request.Headers[CsrfHeader] != "1")
            {
                await WriteError(context.Response, StatusCodes.Status403Forbidden, $"Falta o cabeçalho {CsrfHeader}.");
                return;
            }

            await next();
        });
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        return app;
    }

    private static Task WriteError(HttpResponse response, int status, string message)
    {
        response.StatusCode = status;
        return response.WriteAsJsonAsync(new ErrorResponse(message));
    }
}
