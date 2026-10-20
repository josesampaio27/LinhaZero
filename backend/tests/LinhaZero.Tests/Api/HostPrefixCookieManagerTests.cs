using LinhaZero.Api.Auth;
using Microsoft.AspNetCore.Http;

namespace LinhaZero.Tests;

/// <summary>The session cookie keeps its __Host- prefix on https and drops it on plain http (`npm run dev`).</summary>
public class HostPrefixCookieManagerTests
{
    private static string SetCookieFor(bool https)
    {
        var context = new DefaultHttpContext();
        context.Request.IsHttps = https;
        new HostPrefixCookieManager().AppendResponseCookie(context, AuthSetup.CookieName, "v", new CookieOptions { Secure = true, HttpOnly = true });
        return context.Response.Headers.SetCookie.ToString();
    }

    [Fact]
    public void Https_keeps_the_host_prefix() => Assert.StartsWith("__Host-lz_session=v", SetCookieFor(https: true));

    [Fact]
    public void Plain_http_drops_it() => Assert.StartsWith("lz_session=v", SetCookieFor(https: false));

    [Fact]
    public void Reads_the_name_it_wrote()
    {
        var context = new DefaultHttpContext();
        context.Request.Headers.Cookie = "lz_session=v";
        Assert.Equal("v", new HostPrefixCookieManager().GetRequestCookie(context, AuthSetup.CookieName));
    }
}
