using System.Net;
using System.Text;
using LinhaZero.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;

namespace LinhaZero.Tests;

/// <summary>The assistant against the compose Postgres (TEST_PG): the stream passes through untouched and its cost is recorded.</summary>
public class AssistantUsageTests
{
    private static readonly NpgsqlDataSource Db = Pg.CreateDataSource(PostgresTests.ConnectionString);

    private const string Stream = """
        event: message_start
        data: {"type":"message_start","message":{"id":"m1","usage":{"input_tokens":200,"cache_creation_input_tokens":4000,"cache_read_input_tokens":0,"output_tokens":1}}}

        event: content_block_delta
        data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Olá"}}

        event: message_delta
        data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":30}}

        event: message_stop
        data: {"type":"message_stop"}


        """;

    /// <summary>Answers every request with <see cref="Stream"/>, and keeps the last request's body.</summary>
    private sealed class FakeAnthropic : HttpMessageHandler
    {
        public string? Body { get; private set; }
        public string? Key { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Body = await request.Content!.ReadAsStringAsync(ct);
            Key = request.Headers.GetValues("x-api-key").Single();
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Stream, Encoding.UTF8, "text/event-stream") };
        }
    }

    [PostgresFact]
    public async Task A_response_streams_through_and_its_cost_counts_toward_today()
    {
        var repo = new AssistantUsageRepository(Db);
        await using var insert = Db.CreateCommand("insert into users (issuer, subject, name) values ('test', $1, 'Assistente') returning id");
        insert.Parameters.Add(new() { Value = "assistant-" + Guid.NewGuid().ToString("N") });
        var userId = (Guid)(await insert.ExecuteScalarAsync())!;
        try
        {
            var settings = new AssistantOptions { ApiKey = "test-key" };
            var fake = new FakeAnthropic();
            var proxy = new AssistantProxy(
                new HttpClient(fake) { BaseAddress = AssistantProxy.BaseAddress },
                Options.Create(settings),
                repo,
                NullLogger<AssistantProxy>.Instance);
            var context = new DefaultHttpContext();
            context.Response.Body = new MemoryStream();

            Assert.Equal(0m, await repo.SpentTodayAsync(userId, default));
            var messages = System.Text.Json.JsonSerializer.Deserialize<List<System.Text.Json.JsonElement>>("""[{"role":"user","content":"Olá"}]""")!;
            Assert.Null(await proxy.ForwardAsync(userId, messages, context.Response, default));

            Assert.Equal("test-key", fake.Key);
            Assert.Contains("\"model\":\"claude-haiku-5-5\"", fake.Body);
            Assert.Equal("text/event-stream", context.Response.ContentType);
            context.Response.Body.Position = 0;
            var relayed = await new StreamReader(context.Response.Body).ReadToEndAsync();
            Assert.Equal(Stream.ReplaceLineEndings("\n"), relayed);

            var expected = settings.CostUsd(new AssistantUsage(200, 4000, 0, 30));
            Assert.Equal(expected, await repo.SpentTodayAsync(userId, default));
        }
        finally
        {
            foreach (var sql in new[] { "delete from assistant_usage where user_id = $1", "delete from users where id = $1" })
            {
                await using var cmd = Db.CreateCommand(sql);
                cmd.Parameters.Add(new() { Value = userId });
                await cmd.ExecuteNonQueryAsync();
            }
        }
    }
}
