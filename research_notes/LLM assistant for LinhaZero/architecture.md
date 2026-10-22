# Technical architecture for a Claude-based assistant in LinhaZero (PoC, API key only)

> Scope note: the user narrowed the scope partway through. This is a proof of concept that calls a cloud LLM with an API key. EU data residency, Bedrock, Vertex, Azure hosting and regulation/compliance are deliberately left out.
>
> Source note: most facts come from official Anthropic pages fetched on 2026-10-22: pricing, models overview, C# SDK, structured outputs, vision and rate limits. Facts marked **[skill ref]** come from Anthropic's bundled `claude-api` reference (cached 2026-10-06). It mirrors platform.claude.com, but I did not re-fetch those pages in this session.
>
> Repo facts used here: `contracts/examples/run-request.json` (interventions are `{kind, startMin, endMin?, cells:[{row,col}], rateFactor?, litCells?}` with A/B decisions, wind, ensemble config, weather provenance); `contracts/examples/run-result.json` (per-decision `burnedHaByHour`, `buildingsReached`, `villages[{id,name,firstArrivalMin}]`, per-run results); the Guimarães 100 m grid is 157 × 152 cells; grids are in `web/public/grids/` (`guimaraes`, `guimaraes-30m`, `sintetica`, `replay-alijo-24072019`, `replay-vieiradominho-10082016`); the API already streams SSE (`backend/src/LinhaZero.Api/Controllers/RunsController.cs`); ADR 0070 is titled "incerteza sempre no servidor" (uncertainty always on the server); ADR 0072 covers the explanation of results.

## Q1. Where should the LLM call live (browser vs .NET proxy), which SDK, and how to stream to the browser?

### Takeaway
Put the Claude call and the agent loop in the .NET 10 API. The API key stays server-side, Keycloak sessions gate access, usage is logged and per-user limits are enforced there. Use the official `Anthropic` NuGet package; it supports .NET Standard 2.0+, has `CreateStreaming` returning `IAsyncEnumerable` and an optional `IChatClient` adapter, so there is no need to hand-roll an `HttpClient` + SSE parser. The API relays the result to the browser as SSE, the same pattern `RunsController` already uses for job progress.

### Cited Findings
- **Calling Claude directly from the browser is possible but discouraged.** Anthropic enabled CORS in 2024, but the browser must send the header `anthropic-dangerous-direct-browser-access: true`, and the TypeScript SDK refuses to run in a browser without `dangerouslyAllowBrowser: true`. A key embedded in client code can be read and stolen by anyone who can load the page. The pattern is meant for trusted internal tools or bring-your-own-key apps. — [Simon Willison, "Claude's API now supports CORS requests"](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access)
- **There is an official C# SDK.** "As of version 10+, the `Anthropic` package is now the official Anthropic SDK for C#." Versions 3.x and below were the community tryAGI SDK, now published as `tryAGI.Anthropic`. Install with `dotnet add package Anthropic`; it requires .NET Standard 2.0 or later. — [Anthropic C# SDK docs](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/csharp); [GitHub anthropics/anthropic-sdk-csharp](https://github.com/anthropics/anthropic-sdk-csharp)
- **Streaming in the C# SDK.** "A streaming method always has a `Streaming` suffix", e.g. `client.Messages.CreateStreaming(parameters)`, which returns `IAsyncEnumerable`. — [C# SDK docs](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/csharp)
- **Retries, timeouts and errors in the C# SDK:**
  - It retries twice by default with exponential backoff, on connection errors, 408, 409, 429 and 5xx.
  - The default timeout is 10 minutes; change it with `Timeout`/`MaxRetries` or per call with `WithOptions`.
  - Errors are typed: `AnthropicRateLimitException` (429), `Anthropic5xxException`, `AnthropicSseException` (mid-stream errors), etc.
  - Source: [C# SDK docs](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/csharp)
- **Configuration.** The client reads `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL` from the environment or takes `new AnthropicClient { ApiKey = ... }`. — [C# SDK docs](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/csharp)
- **Microsoft.Extensions.AI integration.** "The SDK provides an implementation of the `IChatClient` interface from the `Microsoft.Extensions.AI.Abstractions` library." The example is `client.AsIChatClient("claude-opus-5-5").AsBuilder().UseFunctionInvocation().Build()`, and MCP C# SDK tools can be passed in via `ChatOptions.Tools`. — [C# SDK docs](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/csharp)
- **What Microsoft.Extensions.AI provides.** It is a provider-neutral `IChatClient` abstraction. The `Microsoft.Extensions.AI` package adds middleware: "automatic function tool invocation, telemetry, and caching", plus `UseOpenTelemetry`. — [Microsoft Learn: Microsoft.Extensions.AI](https://learn.microsoft.com/en-us/dotnet/ai/microsoft-extensions-ai)
- **Tool runner.** The C# SDK also has a beta `BetaToolRunner` (`client.Beta.Messages.ToolRunner(...)`) that runs the tool-call loop with raw JSON-schema tools. **[skill ref]**
- **Rate and spend limits are per organization, by tier.**
  - Start tier: 1,000 RPM, 2,000,000 input tokens/min and 400,000 output tokens/min each for Opus 5.5, Sonnet 5.5 and Haiku 5.5. Fable 5.x: 1,000 RPM, 500k ITPM, 100k OTPM.
  - Monthly spend caps: Start $500, Build $1,000, Scale $200,000.
  - You can set your own lower spend limit, and per-workspace rate/spend limits. Responses carry `anthropic-ratelimit-*` headers and 429s carry `retry-after`.
  - Source: [Rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- **Cache reads don't count toward the input-token rate limit.** "For most Claude models, only uncached input tokens count toward your ITPM rate limits." — [Rate limits](https://platform.claude.com/docs/en/api/rate-limits)

### Inferences
- **Recommended flow:** browser → `POST /api/assistant/conversations/{id}/turns` (Keycloak session cookie, as for other API calls) → the .NET `AssistantController` runs the Claude loop with `CreateStreaming` → it re-emits a small, app-specific SSE event set to the browser:
  - `text_delta`
  - `tool_started` / `tool_finished` (e.g. "a simular decisão B…")
  - `proposal` (a validated intervention set)
  - `done` / `error`
  - Don't forward Anthropic's raw event stream; translating it keeps the browser contract in `contracts/examples/*.json`, consistent with the "contracts are source of truth" rule.
- **Why server-side fits the stack:**
  - The key lives only in the `api` container env.
  - Per-user quotas and an audit log go in Postgres via Dapper. Log `usage` fields, the conversation id and tool calls.
  - A global cost guard comes from the Anthropic Console spend limit.
  - Keycloak gives a user id for attribution.
- **Raw API vs `IChatClient`:** prefer the `Anthropic` SDK's own types over `IChatClient` for the main loop. LinhaZero needs Anthropic-specific features: `cache_control`, `output_config.effort`, `strict` tools, structured outputs and thinking display. Whether `IChatClient` exposes all of these is unverified (see Gaps). `IChatClient` is a reasonable choice if provider-neutrality matters more than those knobs. Both fit the backend style rule (no extra interfaces, concrete singleton): register one `AnthropicClient` singleton and one `AssistantService`.
- **Plain `HttpClient`** is only worth it if you want zero dependencies. You would re-implement SSE parsing, tool-block typing and retries that the SDK already provides.
- **Caddy:** the existing SSE for runs already works through Caddy, so a second SSE endpoint should need no new proxy config. Verify that responses are not buffered.

### Gaps
- I did not fetch the exact current NuGet version of `Anthropic`. The docs mention that major 13.0.0 is the first to send API version `2026-10-21`.
- I did not verify which Anthropic-specific request options (cache_control, effort, strict, output_config) pass through `AsIChatClient`.
- I found no official time-to-first-token or latency numbers for any model; the docs give only relative latency (see Q4).

## Q2. Tool use design: which tools, structured outputs for interventions, engine-as-verifier loop, server vs client tools, MCP?

### Takeaway
Give Claude a small set of typed tools. Most are read-only "context" tools, plus one or two engine-running tools and one proposal tool. Use `strict: true` on the proposal tool so interventions always validate against the scenario schema. Run the loop on the server: engine runs go to the existing NATS engine-worker, which matches ADR 0070 (uncertainty on the server). The UI holds the proposal as a draft decision B that the coordinator must accept, never auto-applied. MCP is overkill for the PoC: there is one host (our API) and one tool provider (our engine), so plain tool definitions do the job with less machinery.

### Cited Findings
- **Strict tool use:** `"strict": true` on a tool definition "guarantees schema validation on tool names and inputs". The schema needs `additionalProperties: false` and `required`. — [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- **JSON outputs:** `output_config.format` with `type: "json_schema"` makes the final text response valid JSON for a schema. It can be combined with strict tools. — [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- **Schema limits that matter for cell lists and minute ranges:**
  - Not supported: numerical constraints (`minimum`, `maximum`, `multipleOf`), string length constraints, recursive schemas, and array constraints beyond `minItems` 0/1.
  - Supported: `enum`, `const`, `anyOf`, `$ref`/`$defs`.
  - Across all strict schemas in a request: at most 20 strict tools, 24 optional parameters and 16 union-typed parameters. Beyond that the API may return 400 "Schema is too complex".
  - Source: [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- **Grammar compilation:** the first use of a schema adds compile latency. Compiled grammars are cached 24 h from last use. Changing a schema's structure, or the tool set when both features are used, invalidates that cache. Changing `output_config.format` invalidates the prompt cache for the thread. — [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- **Structured-output failure modes:** `stop_reason: "refusal"` or `"max_tokens"` can yield output that doesn't match the schema. Enum casing may differ, so compare case-insensitively. — [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- **No forced tool choice:** on Claude Opus 5.5, Sonnet 5.5 and Fable 5.1, `tool_choice` `{type:"any"}` / `{type:"tool"}` returns 400. Use `auto` plus a prompt instruction, `strict: true`, or structured outputs instead. **[skill ref]** — mirrors [migration guide](https://platform.claude.com/docs/en/about-claude/models/migration-guide)
- **Parallel tool calls** are on by default. Return all `tool_result` blocks in one user message, and use `is_error: true` for failures. **[skill ref]**
- **Tool-use overhead:** each request with tools carries a tool-use system prompt of 286 tokens on Opus 5.5, Sonnet 5.5 and Haiku 5.5 (with `tool_choice` auto/none). — [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- **Dedicated vs generic tools:** Anthropic's agent-design guidance says to promote an action to a dedicated tool when you need to "gate, render, audit, or parallelize" it. Typed arguments give the harness "an action-specific hook … it can intercept, gate, render, or audit". **[skill ref]** (`shared/agent-design.md`)
- **MCP** is an open JSON-RPC 2.0 protocol between hosts (LLM apps), clients and servers that expose resources, prompts and tools. It is meant to standardize integrations "into the ecosystem of AI applications". The spec requires explicit user consent before invoking tools. Current spec version: 2026-07-28. — [MCP specification](https://modelcontextprotocol.io/specification/latest)
- **MCP is available if needed later:** the C# SDK can pass MCP C# SDK tools straight into an `IChatClient`. — [C# SDK docs](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/csharp). The Messages API also has a beta MCP connector (`mcp_servers` + `mcp_toolset`, beta `mcp-client-2025-11-20`). **[skill ref]**

### Inferences
- **Proposed tool set** (names in English, user-facing text in pt-PT; read-only tools first):
  1. `get_scenario()`: compact summary of the current scenario. Ignition (row/col plus nearest place name), wind, duration, weather provenance, and decisions A and B as intervention summaries (kind, start/end, cell count, bounding box, nearest place names). No raw cell lists unless asked.
  2. `get_results(decision?)`: `burnedHaByHour`, `buildingsReached`, villages with `firstArrivalMin`, and the ensemble win counts (e.g. "B wins in 143/200 wind scenarios").
  3. `get_place_arrival(placeName | villageId)`: arrival time under A and B, plus the "explain" critical path for that place (dominant fuel/wind/slope speed factors).
  4. `explain_cell(row, col)` or `explain_place(...)`: wraps the existing `engine/src/explain.ts` output.
  5. `describe_area(bbox | placeName, resolution)`: coarse text raster of fuel, slope or arrival for a window (see Q3).
  6. `propose_interventions(decision: "B", interventions[], rationale_pt)`: `strict: true`. The schema mirrors `run-request.json`: `kind` enum `containmentLine | suppression | protectZone | aerialDrop | backfire`, `startMin`, `endMin`, `rateFactor`, and `cells` given either as explicit `{row,col}` or, better, as a geometry the server rasterizes (see below). The server validates bounds the schema can't express (minutes ≤ duration, cells inside the grid, backfire needs `litCells`) and returns an `is_error` tool_result with a pt-PT message when validation fails.
  7. `run_simulation(decisionDraftId)` → deterministic single run. `run_ensemble(decisionDraftId, runs)` → paired ensemble via NATS. Both return only the metrics deltas versus the current A/B.
- **Engine-as-verifier loop:** let the model call `propose_interventions` and then `run_simulation`/`run_ensemble`, and iterate a bounded number of times (e.g. ≤3 proposals, ≤1 ensemble per user turn). It must report the engine's numbers, not its own guesses. The system prompt should require that any claim about outcomes cite a tool result. Cap loop iterations and engine wall-clock in the controller.
- **Geometry instead of cell lists:** asking the model to emit dozens of `{row,col}` cells is token-heavy and error-prone. A better design:
  - The model emits a polyline or polygon in grid coordinates, or anchored to named features (`{"along": "estrada N206", "from": "Aldeias", "lengthM": 800}`), or as `{"line": [[r,c],[r,c],...]}`.
  - The server rasterizes it with the same rasterizer the UI drawing tools use.
  - This keeps strict schemas small and stays under the optional/union parameter limits.
- **Server vs client tools:** all tools run server-side.
  - The browser already POSTs its current scenario on each turn, or the API reads the saved scenario.
  - Engine runs go to engine-worker over NATS, the same path as 200–500-run ensembles.
  - A "client tool" design (stream a tool call over SSE, run it in the browser Web Worker, POST the result back) would save server CPU. But it adds a round trip, a pause/resume state machine and failure modes (tab closed mid-loop). It is only worth it if the server engine is the bottleneck.
  - Single deterministic runs are fast enough in Node: run-result.json shows `elapsedMs` 8123 for an ensemble.
- **Human in the loop:** proposals become a draft decision B shown on the B map with an "Aceitar proposta" button. The assistant never overwrites the user's decisions; this fits "Users must retain control" (MCP security principles) and emergency-tool expectations.
- **MCP verdict:** skip it for the PoC. Revisit only to expose LinhaZero's engine to external AI hosts, e.g. Claude Desktop or another agency's assistant. That case is a thin MCP server in front of the same tool handlers, so designing the handlers as plain functions keeps the option open.
- **Managed Agents / Claude Agent SDK:** unnecessary here. The loop is short and the tools are ours, so a manual loop or the SDK tool runner in .NET is the simplest fit. **[skill ref]** guidance: "Start simple … only reach for agents when the task genuinely requires open-ended, model-driven exploration."

### Gaps
- I did not test whether strict schemas with nested `cells` arrays of `{row,col}` objects stay under the complexity limits. Count the optional/union parameters once the schema is written.
- I found no Anthropic guidance specific to geospatial tool design; the geometry-first design above is my recommendation, not a documented pattern.

## Q3. How to give spatial context compactly (text summaries, GeoJSON, place names, screenshots) and token budgets?

### Takeaway
Lead with semantic text: place names, distances and bearings, metrics, and the engine's "explain" breakdown. Use coarse text rasters only for small windows on demand, through tools rather than the system prompt. A map screenshot is cheap in tokens (about 1.3–1.5k for a ~1 MP image) and good for gestalt questions ("where is the fire heading?"). It is not reliable for exact cell coordinates, so never let the model read intervention cells off an image.

### Cited Findings
- **Image token cost:** an image costs `⌈width/28⌉ × ⌈height/28⌉` visual tokens. 1000×1000 px ≈ 1,296 tokens; 1092×1092 ≈ 1,521; 1920×1080 ≈ 2,691 on the high-resolution tier (Claude 4.7+). Max long edge on that tier is 2,576 px, max 4,784 visual tokens. — [Vision](https://platform.claude.com/docs/en/build-with-claude/vision)
- **Image cost example:** "At Claude Opus 5.5's $4 USD per million (high-resolution tier), the same [1000×1000] image costs about $5.18 USD per thousand." — [Vision](https://platform.claude.com/docs/en/build-with-claude/vision)
- **Vision limitations:** "Claude's coordinate and localization outputs are approximate … verify outputs before relying on them". Counting of many small objects "might not always be precisely accurate". — [Vision](https://platform.claude.com/docs/en/build-with-claude/vision)
- **Image placement:** images before text work best. In multi-turn chats, base64 images are re-sent every turn; the Files API (`file_id`) keeps payloads small. — [Vision](https://platform.claude.com/docs/en/build-with-claude/vision)
- **Tokenizer density:** on the current tokenizer (introduced with Opus 4.7), 1M tokens ≈ 555k words or 2.5M Unicode characters. — [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- **Context window:** all current models (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5) have a 1M-token context and 128K max output. — [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- **Long-context pricing:** Opus 5.5 and Sonnet 5.5 charge the same rate per token up to 1M. Haiku 5.5's price rises for prompts over 100k tokens ($0.50/$2.50 instead of $0.10/$0.50). — [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)

### Inferences
- **Grid size and raw-raster cost** (my estimate): the 100 m Guimarães grid is 157 × 152 = 23,864 cells. A one-character-per-cell text map is about 24k characters. At ~2.5 chars/token that is roughly 10k tokens per layer, and several layers (fuel, slope, arrival A, arrival B) would be 40k+ tokens and add little. The 30 m grid is roughly 11× more cells. So never put whole rasters in the prompt.
- **Recommended context layers:**
  1. **Always-on, cached** (~3–6k tokens):
     - Role and pt-PT instructions.
     - Glossary of intervention kinds with LinhaZero semantics, from `docs/modelo/o-motor-explicado.md`.
     - Rules: cite tool results, never invent numbers, emergency tone.
     - Tool definitions.
  2. **Per-session scenario digest** (~1–2k tokens):
     - Grid name and cell size.
     - Ignition with nearest village and bearing/distance.
     - Wind, duration, weather source and time.
     - A and B as intervention summaries with place anchors.
     - Headline results and ensemble win count.
     - Top-5 places by risk with arrival times under A/B.
  3. **On-demand detail through tools:** `describe_area` returns a downsampled character raster for a requested window, e.g. 4×4 cells (400 m) per character over a 10×10 km window ≈ 25×25 = 625 chars ≈ 300 tokens, with a legend. `explain_place` returns the critical path as a list of segments with fuel, slope, wind alignment and speed.
- **Place-name anchoring:**
  - Precompute a gazetteer per zone: villages already exist in `village.u16` and the results, plus OSM roads and rivers from data-prep.
  - Expose features as "Aldeias (r 120, c 88), 2.1 km NE of ignition".
  - Let the model refer to places by name; the server resolves names to cells.
  - This cuts tokens and grounds the pt-PT text in names coordinators know.
- **GeoJSON:** convenient but verbose (float coordinate pairs). Use it only for small features such as the fire perimeter at time T, and simplified (Douglas-Peucker to ~20–50 vertices). The model works fine with integer grid coordinates, which also match the scenario contract.
- **Screenshots:**
  - Optional: send one ~1000×1000 px composite of both maps (labelled "Imagem 1: decisão A", "Imagem 2: decisão B") when the user asks a visual question. About 1.3k tokens per image, roughly $0.005 on Opus 5.5 at the documented image rate.
  - Capture with MapLibre `map.getCanvas().toDataURL()`; this needs `preserveDrawingBuffer` or a render-then-capture step (unverified detail).
  - Don't rely on images for coordinates.

### Gaps
- No measured token counts for LinhaZero-specific digests. Measure with the token-counting endpoint (`POST /v1/messages/count_tokens`) during the PoC.
- No published benchmark of Claude reading ASCII rasters versus images for spatial reasoning. Treat the format choice as something to evaluate (Q5).

## Q4. Model choice, cost, prompt caching and latency for an emergency tool

### Takeaway
- **Default for the PoC:** Claude Sonnet 5.5 (`claude-sonnet-5-5`, $2/$10 per MTok, "Fast", 1M context). Run it at `low`/`medium` effort for chat turns and higher effort for "propose decision B".
- **Opus 5.5** (`claude-opus-5-5`, $4/$20, "Moderate" latency): use it as the "deep analysis" option, or as the default if evals show Sonnet's plans are worse.
- **Haiku 5.5** ($0.10/$0.50, "Fastest"): fits sub-tasks such as summarizing results to pt-PT text or the LLM-judge in evals.
- **Fable 5.1** ($10/$50, "Slower"): not appropriate for an interactive emergency tool.
- **Estimated cost:** with prompt caching, a realistic ~30-request session costs about $0.03 (Haiku), $0.6 (Sonnet) or $1.2 (Opus).
- All four model IDs in the brief are confirmed on Anthropic's official models page.

### Cited Findings
- **Models (official), with pricing per MTok:**

  | Model | ID | Use case per Anthropic | Latency | Input / output | Default effort | Thinking |
  |---|---|---|---|---|---|---|
  | Fable 5.1 | `claude-fable-5-1` | "demanding reasoning and long-horizon agentic work" | Slower | $10 / $50 | `high` | always on |
  | Opus 5.5 | `claude-opus-5-5` | "long-running agentic coding and knowledge work" | Moderate | $4 / $20 | `medium` | always on |
  | Sonnet 5.5 | `claude-sonnet-5-5` | "The best combination of speed and intelligence" | Fast | $2 / $10 | `high` | adaptive |
  | Haiku 5.5 | `claude-haiku-5-5` | "high-volume, latency-sensitive tasks" | Fastest | from $0.10 / from $0.50 | `medium` | adaptive |

  All four have a 1M context window, 128K max output and a reliable knowledge cutoff of Jun 2026. Anthropic says "start with Claude Opus 5.5 for most workloads". — [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- **Prompt caching prices** (per MTok):

  | Model | 5-min cache write | 1-h cache write | Cache read |
  |---|---|---|---|
  | Opus 5.5 | $5 | $8 | $0.20 |
  | Sonnet 5.5 | $2.50 | $4 | $0.10 (0.05× base) |
  | Haiku 5.5 (≤100k prompt) | $0.125 | $0.20 | $0.01 |
  | Fable 5.1 | $12.50 | $20 | $0.25 |

  Source: [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
  - **Discrepancy:** the bundled `claude-api` skill text says Sonnet 5.5 cache reads are $0.20. The official pricing page says $0.10 (and both the pricing page and the models overview say 0.05× base). Trust the official page.
- **Other pricing modifiers:**
  - Batch API: 50% off (e.g. Opus 5.5 $2/$10, Sonnet 5.5 $1/$5).
  - Fast mode for Opus 5.5: $8/$40 per MTok, Claude API only. — [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
  - Fast mode runs "up to 2.5x higher output tokens per second", needs beta `fast-mode-2026-02-01` and `speed: "fast"`, and has its own rate limit. **[skill ref]**
- **Caching mechanics:**
  - Caching is a prefix match in the order tools → system → messages; any byte change invalidates everything after it.
  - At most 4 breakpoints per request.
  - The minimum cacheable prefix is 512 tokens on the newest models.
  - Writes cost 1.25× (5 min) or 2× (1 h).
  - Check `usage.cache_read_input_tokens` to confirm hits.
  - **[skill ref]** — mirrors [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching); write/read multipliers confirmed on the [Pricing](https://platform.claude.com/docs/en/about-claude/pricing) page.
- **Opus 5.5 thinking and effort:** thinking cannot be disabled; `{type:"disabled"}` returns 400 and effort is the only control. **[skill ref]** "Adaptive (always on)" and the default effort `medium` are confirmed on the [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview).
- **Sonnet 5.5 thinking:** to turn it off, send `{type:"between_tools"}` (at effort `high` or below). Anthropic suggests starting at `low` effort for chat and `medium` for multistep tool use. **[skill ref]**
- **Thinking display:** by default, thinking is "omitted" (blank thinking blocks), which looks like a pause. Set `display: "summarized"` or `"updates"` (beta) to show progress. **[skill ref]**
- **Mid-conversation system messages:** `{role:"system"}` entries in `messages` are supported on Opus 5.5 and Sonnet 5.5. They let you inject "the scenario changed" notes without breaking the cached prefix. **[skill ref]**
- **Preserved thinking:** thinking blocks are tied to the model and conversation that produced them. Accounts created on/after 2026-08-31 get a 400 if earlier turns are edited, so the conversation store must be append-only. **[skill ref]**
- **Refusals:** check `stop_reason: "refusal"`. Server-side `fallbacks` (beta) are available on Opus 5.5 and Sonnet 5.5 on the Claude API. **[skill ref]**

### Inferences
- **Session cost estimate** (my assumptions, not measured):
  - A coordinator session has ~10 user turns with ~3 model requests each (tool calls) → ~30 requests.
  - Average context per request ~20k tokens (6k cached prefix plus growing history and tool results) → ~600k input tokens per session, ~85% cache reads, ~15% new or cache-write.
  - ~1k output tokens per request including thinking → ~30k output tokens.

  | Model | Cache reads (510k) | Writes (90k) | Output (30k) | Total, cached | Total, no caching |
  |---|---|---|---|---|---|
  | Sonnet 5.5 | ≈ $0.05 | ≈ $0.23 | ≈ $0.30 | **≈ $0.58** | ≈ $1.50 |
  | Opus 5.5 | ≈ $0.10 | ≈ $0.45 | ≈ $0.60 | **≈ $1.15** | — |
  | Haiku 5.5 | — | — | — | **≈ $0.03** | — |
  | Fable 5.1 | — | — | — | **≈ $2.75** | — |

  - A screenshot adds about $0.003–0.005 per image.
  - Engine compute (our own infrastructure) is separate.
  - At Start tier, the $500/month cap allows roughly 800 Sonnet sessions. Set a lower Console spend limit plus per-user quotas in the API.
- **Latency for an emergency tool:**
  - Stream everything and show tool activity ("a correr 200 cenários de vento…").
  - Use Sonnet 5.5 at low/medium effort for Q&A.
  - Keep the cached prefix warm: requests less than 5 min apart keep the 5-min cache alive, so use a 1-h TTL or a keep-alive only for idle gaps.
  - Fast mode on Opus 5.5 is an option if Opus quality is needed at lower latency, at 2× price.
  - Ensemble runs will dominate wall-clock (seconds), not the LLM.
- **Model routing:** keep one model per conversation, because caches are model-scoped. Offer a "análise aprofundada (Opus)" toggle that starts a fresh request rather than switching models mid-thread.
- **Contract with the UI:** the system prompt and tool list must be byte-stable (sorted JSON, no timestamps) to get cache hits. Put the scenario digest after the cached prefix, or inject updates as mid-conversation system messages.

### Gaps
- No official absolute latency figures (time to first token, tokens/second) for any of the four models; only relative labels. Measure in the PoC.
- Real token usage per session is unknown until instrumented. The estimate above is illustrative.
- I did not verify whether the `fallbacks` and `display: "updates"` betas are exposed as typed properties in the C# SDK.

## Q5. Testing and evaluating the assistant (eval sets, replaying real PT-FireSprd fires)

### Takeaway
Grade what can be checked with code against the engine, and use an LLM judge only for the pt-PT explanation quality. Build cases from the real-fire replays already in the repo (`replay-alijo-24072019`, `replay-vieiradominho-10082016`), from the PT-FireSprd validation fires, and from synthetic scenarios on `sintetica`.

Two main checks:
- **Proposals:** run the assistant's proposed decision B through the paired ensemble and check that it is valid and beats a baseline.
- **Explanations:** check that every number the assistant quotes matches a tool result.

### Cited Findings
- **Grading approaches** (Anthropic's eval guidance):
  - Prefer a programmatic check whenever the output is constrained (JSON validates, a value is in a closed set, a test passes). For agents that act on an environment, the programmatic check "should read the *end state*, not the transcript".
  - Use a model-graded rubric for open-ended prose, with "concrete, checkable claims" rather than vague 1–5 scales.
  - Don't use the model under test as its own judge.
  - Use structured outputs for the judge's verdict.
  - Run an "oracle" and a "null" through the harness before paid runs.
  - **[skill ref]** (`shared/evals/build-eval.md`)
- **Judge model choice:** Haiku 5.5 is "cheap and fast enough to run on every PR", Sonnet 5.5 is "a balanced middle", and Opus 5.5 is for nuanced criteria. **[skill ref]**
- **Batch API for offline runs:** 50% off, so nightly batch evals cost half. Batches suit offline evals (asynchronous, results in any order). — [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- **Usage logging:** the `usage` fields (`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`) give per-case cost. — [Rate limits](https://platform.claude.com/docs/en/api/rate-limits)

### Inferences
- **Eval case types** (store as JSON next to `contracts/examples`, e.g. `engine/evals/assistant/*.json` or `backend/tests/...`):
  1. **Explain the comparison:** given a fixed run-result, ask "porque é que B é melhor para Aldeias?".
     - Programmatic: every number in the answer (ha, minutes, building counts, win counts) appears in the tool results, within rounding; no village not in the results is mentioned.
     - Judge rubric: names the dominant factor from the explain output; written in pt-PT, not pt-BR (e.g. "autocarro", not "ônibus"); states uncertainty when the win rate is near 50%.
  2. **Propose decision B:** given A and the scenario, ask for a better B with fixed resources.
     - Programmatic: the proposal validates against the scenario schema; cells are inside the grid and not on barriers; timing is feasible (startMin ≥ arrival delay).
     - Win rate over A in the paired ensemble ≥ a threshold, and at least as good as a simple heuristic baseline (e.g. a containment line perpendicular to the wind 1 km ahead of the head).
  3. **Critique a plan:**
     - Seed A with known-bad plans: a line behind the fire front, a backfire upwind, an aerial drop after arrival.
     - Programmatic: the assistant flags the seeded flaw (keyword/enum check via a structured critique schema).
  4. **Robustness:** prompt injection in user text; questions outside scope (should decline, not invent); missing data (no weather).
- **Real-fire replays:**
  - Use the PT-FireSprd fires (80 validated, per `docs/modelo/validacao-resumo.md`) with observed progressions.
  - Set up the scenario at T0, ask the assistant for a plan, and compare the engine-predicted outcome of its plan against the no-action run.
  - This tests whether proposals are sensible in the engine. It does not test real-world effectiveness, because the engine "simulates the fire with no suppression except what the user draws", and that caveat must appear in the docs.
- **Regression and CI:**
  - A small fixed set (~20–40 cases) runs on PRs touching the assistant prompt or tools with Haiku as judge.
  - A larger nightly set runs via the Batch API.
  - Track pass rate, cost per case and latency per case. Store results under `engine/reports/` as for engine calibration.
- **Determinism:** fix ensemble seeds (`run-request.json` has `seed: 2035`) so engine-verified metrics are reproducible across eval runs. Only the LLM side varies; run 3 repetitions per case to get a noise floor.

### Gaps
- I did not check the PT-FireSprd dataset's licence or structure for this purpose. Rely on what `data-prep/` and `docs/modelo/validacao-resumo.md` already use.
- I found no published eval benchmarks for LLM assistants in wildfire decision support to compare against.
