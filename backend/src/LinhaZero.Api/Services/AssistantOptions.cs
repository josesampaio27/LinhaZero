namespace LinhaZero.Api.Services;

/// <summary>
/// The assistant (docs/decisoes/0079), from ANTHROPIC_API_KEY, ASSISTANT_MODEL, ASSISTANT_EFFORT, ASSISTANT_MAX_TOKENS
/// and ASSISTANT_DAILY_BUDGET_USD (infra/README.md). No key: the assistant is off and the app hides its panel.
/// </summary>
public sealed class AssistantOptions
{
    public string? ApiKey { get; set; }

    /// <summary>Claude Haiku 5.5: the cheapest current model, fast enough for a side panel.</summary>
    public string Model { get; set; } = "claude-haiku-5-5";

    /// <summary>low, medium or high. medium is Haiku 5.5's default; it keeps several tool calls per turn reliable.</summary>
    public string Effort { get; set; } = "medium";

    /// <summary>Per response. Answers are a few sentences; the rest is room for thinking and tool calls.</summary>
    public int MaxTokens { get; set; } = 4096;

    /// <summary>What one user may spend per day (Lisbon time), in US dollars at the prices below.</summary>
    public decimal DailyBudgetUsd { get; set; } = 0.50m;

    /// <summary>
    /// Haiku 5.5 prices per million tokens, for prompts up to 100k tokens (docs.anthropic.com pricing, 2026-10).
    /// Limitation: longer prompts cost 5 times more; the app starts a new conversation well before that.
    /// </summary>
    public decimal InputUsdPerMTok { get; set; } = 0.10m;
    public decimal OutputUsdPerMTok { get; set; } = 0.50m;
    public decimal CacheWriteUsdPerMTok { get; set; } = 0.125m;
    public decimal CacheReadUsdPerMTok { get; set; } = 0.01m;

    public bool Enabled => !string.IsNullOrEmpty(ApiKey);

    public void ReadFrom(IConfiguration config)
    {
        ApiKey = config["ANTHROPIC_API_KEY"] is { Length: > 0 } key ? key : null;
        Model = config["ASSISTANT_MODEL"] is { Length: > 0 } model ? model : Model;
        Effort = config["ASSISTANT_EFFORT"] is "low" or "medium" or "high" ? config["ASSISTANT_EFFORT"]! : Effort;
        MaxTokens = int.TryParse(config["ASSISTANT_MAX_TOKENS"], out var maxTokens) && maxTokens > 0 ? maxTokens : MaxTokens;
        DailyBudgetUsd = decimal.TryParse(config["ASSISTANT_DAILY_BUDGET_USD"], System.Globalization.CultureInfo.InvariantCulture, out var budget)
            && budget >= 0
            ? budget
            : DailyBudgetUsd;
    }

    /// <summary>The cost of one response, from the token counts Anthropic reports.</summary>
    public decimal CostUsd(AssistantUsage usage) =>
        (usage.InputTokens * InputUsdPerMTok
            + usage.CacheWriteTokens * CacheWriteUsdPerMTok
            + usage.CacheReadTokens * CacheReadUsdPerMTok
            + usage.OutputTokens * OutputUsdPerMTok) / 1_000_000m;
}

/// <summary>Tokens of one response; input excludes the cached parts, which are counted apart.</summary>
public sealed record AssistantUsage(int InputTokens, int CacheWriteTokens, int CacheReadTokens, int OutputTokens);
