using System.Net;
using System.Net.Http.Headers;

namespace LinhaZero.Tests;

/// <summary>The pure part of a pull: what is saved, what is rejected, and how long to wait after a failure.</summary>
public class PullerTests
{
    private static readonly DateTime Now = new(2026, 10, 17, 12, 0, 0, DateTimeKind.Utc);

    private static HttpResponseMessage Ok(string body) => new(HttpStatusCode.OK) { Content = new StringContent(body) };

    /// <summary>A file type that accepts any body, to test the generic rules (valid, non-empty JSON) on their own.</summary>
    private sealed class AnyJson : IUpstreamFile<AnyJson>
    {
        public bool IsUsable => true;

        public static AnyJson Parse(string json) => new();
    }

    [Fact]
    public async Task A_good_body_is_returned_as_text()
    {
        var outcome = await Puller.ReadAsync<AnyJson>(Ok("""{"a":1}"""), Now, default);
        Assert.Equal("""{"a":1}""", outcome.Body);
        Assert.Null(outcome.Error);
    }

    [Fact]
    public async Task Retry_after_on_429_wins_over_the_minimum_backoff()
    {
        var seconds = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
        seconds.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(3600));
        var outcome = await Puller.ReadAsync<AnyJson>(seconds, Now, default);
        Assert.Equal("HTTP 429", outcome.Error);
        Assert.Equal(TimeSpan.FromHours(1), outcome.Backoff);

        var date = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
        date.Headers.RetryAfter = new RetryConditionHeaderValue(new DateTimeOffset(Now.AddMinutes(10)));
        Assert.Equal(TimeSpan.FromMinutes(10), (await Puller.ReadAsync<AnyJson>(date, Now, default)).Backoff);

        // A short Retry-After never goes below the minimum.
        var shortWait = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
        shortWait.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(5));
        Assert.Equal(Puller.MinBackoff, (await Puller.ReadAsync<AnyJson>(shortWait, Now, default)).Backoff);
    }

    [Fact]
    public async Task Any_other_failure_backs_off_60_seconds()
    {
        var outcome = await Puller.ReadAsync<AnyJson>(new HttpResponseMessage(HttpStatusCode.InternalServerError), Now, default);
        Assert.Equal("HTTP 500", outcome.Error);
        Assert.Equal(TimeSpan.FromSeconds(60), outcome.Backoff);
    }

    [Fact]
    public async Task Empty_or_invalid_bodies_are_rejected()
    {
        foreach (var body in new[] { "{}", "[]", "", "not json", "42" })
        {
            var outcome = await Puller.ReadAsync<AnyJson>(Ok(body), Now, default);
            Assert.Null(outcome.Body);
            Assert.Equal(Puller.InvalidBody, outcome.Error);
        }
    }

    [Fact]
    public void Every_fixture_is_usable_as_its_source_type()
    {
        Assert.True(Puller.IsUsable<IpmaStationsFile>(Fixtures.Text("stations")));
        Assert.True(Puller.IsUsable<IpmaObservationsFile>(Fixtures.Text("observations")));
        Assert.True(Puller.IsUsable<IpmaFireRiskFile>(Fixtures.Text("rcm-d0")));
        Assert.True(Puller.IsUsable<IpmaWarningsFile>(Fixtures.Text("warnings_www")));
        Assert.True(Puller.IsUsable<IpmaDistrictsFile>(Fixtures.Text("distrits-islands")));
        Assert.True(Puller.IsUsable<FogosActiveFile>(Fixtures.Text("fogos-active")));
        // The lattice answer is an array of per-point forecasts, each with its own coordinates.
        Assert.True(Puller.IsUsable<OpenMeteoLatticeFile>($"[{Fixtures.Text("open-meteo")}]"));
    }

    [Fact]
    public void The_wrong_shape_is_rejected()
    {
        Assert.False(Puller.IsUsable<OpenMeteoLatticeFile>(Fixtures.Text("open-meteo"))); // a single object is the old per-point shape
        Assert.False(Puller.IsUsable<FogosActiveFile>("""{"data":"x"}"""));
        Assert.False(Puller.IsUsable<IpmaStationsFile>("""[{"x":1}]"""));
        Assert.False(Puller.IsUsable<IpmaFireRiskFile>("""{"dataPrev":"2026-10-17"}"""));
        Assert.False(Puller.IsUsable<IpmaObservationsFile>("""{"2026-10-17T12:00": null}"""));
    }
}
