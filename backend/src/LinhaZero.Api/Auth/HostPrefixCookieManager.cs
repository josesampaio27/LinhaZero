using Microsoft.AspNetCore.Authentication.Cookies;

namespace LinhaZero.Api.Auth;

/// <summary>
/// The session cookie is <c>__Host-lz_session</c>: browsers then refuse it unless it is Secure, host-only and on "/", so
/// no other subdomain can set or widen it. Browsers only accept the prefix from https pages, though, and `npm run dev`
/// is http://localhost:5173; on plain http (only localhost in practice) the same cookie goes without the prefix.
/// </summary>
public sealed class HostPrefixCookieManager : ICookieManager
{
    private const string Prefix = "__Host-";
    private readonly ChunkingCookieManager _inner = new();

    private static string NameFor(HttpContext context, string key) =>
        !context.Request.IsHttps && key.StartsWith(Prefix, StringComparison.Ordinal) ? key[Prefix.Length..] : key;

    public string? GetRequestCookie(HttpContext context, string key) => _inner.GetRequestCookie(context, NameFor(context, key));

    public void AppendResponseCookie(HttpContext context, string key, string? value, CookieOptions options) =>
        _inner.AppendResponseCookie(context, NameFor(context, key), value, options);

    public void DeleteCookie(HttpContext context, string key, CookieOptions options) =>
        _inner.DeleteCookie(context, NameFor(context, key), options);
}
