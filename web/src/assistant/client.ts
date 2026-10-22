// The assistant's conversation loop, in the browser (docs/decisoes/0074). The Anthropic SDK talks to our API, which
// adds the key, the model, the system prompt and the tools and streams Anthropic's answer back; tools run here,
// where the app state is. The history is append-only: every assistant message goes back exactly as it came
// (thinking blocks included), which Claude Haiku 5.5 requires.
import Anthropic from "@anthropic-ai/sdk";
import { CSRF_HEADER } from "../lib/session";
import type { AssistantContext } from "./context";
import { stateDigest } from "./digest";
import { CHANGING_TOOLS, runTool, settle, toolLabel } from "./tools";

/** Tool rounds per user message: enough to copy, place, simulate and check; stops a loop that goes nowhere. */
export const MAX_ROUNDS = 12;

/** Past this, the panel asks for a new conversation (the API refuses bodies over 1 MB). */
export const MAX_HISTORY_CHARS = 700_000;

export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; label: string; status: "running" | "done" | "error"; detail?: string }
  | { type: "notice"; text: string };

let client: Anthropic | null = null;

/** Created on first use: the page address is only there in a browser. */
function anthropic(): Anthropic {
  client ??= new Anthropic({
    baseURL: `${location.origin}/api/v1/assistant`,
    // The real key is on the server, which ignores this one.
    apiKey: "linhazero-proxy",
    dangerouslyAllowBrowser: true,
    defaultHeaders: CSRF_HEADER,
    maxRetries: 1,
  });
  return client;
}

/** The message the API answered with when it refused (our { error } body), else the SDK's own. */
export function errorText(e: unknown): string {
  if (e instanceof Anthropic.APIUserAbortError) return "Interrompido.";
  if (e instanceof Anthropic.APIError) {
    const body = e.error as { error?: unknown } | undefined;
    if (body && typeof body.error === "string") return body.error;
    if (e.status === 401) return "A sessão terminou: entrar de novo.";
    return `O assistente não respondeu (${e.status ?? "sem ligação"}).`;
  }
  return e instanceof Error ? e.message : String(e);
}

/** The user's message: what they wrote, then the app state they are looking at. */
export function userMessage(text: string, context: AssistantContext): Anthropic.MessageParam {
  return {
    role: "user",
    content: [
      { type: "text", text },
      { type: "text", text: `<estado>\n${stateDigest(context.snapshot)}\n</estado>` },
    ],
  };
}

export interface TurnResult {
  /** The history with this turn appended (also on error or stop: whatever completed is kept). */
  history: Anthropic.MessageParam[];
  /** A tool that changes the app ran. */
  changed: boolean;
  error: string | null;
}

/**
 * One user turn: sends it, streams the answer, runs the tools the model asks for and sends their results back, until
 * the model answers without tools. Tools run one at a time, each after React applied the previous one's changes.
 */
export async function runTurn(
  history: Anthropic.MessageParam[],
  text: string,
  context: () => AssistantContext,
  onEvent: (e: TurnEvent) => void,
  signal: AbortSignal,
): Promise<TurnResult> {
  const messages = [...history, userMessage(text, context())];
  let changed = false;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      // The model, system prompt, tools and limits are set by the server; these two only satisfy the SDK's types.
      const stream = anthropic().messages.stream({ model: "claude-haiku-5-5", max_tokens: 4096, messages }, { signal });
      stream.on("text", (delta) => onEvent({ type: "text", text: delta }));
      const message = await stream.finalMessage();
      if (message.content.length) messages.push({ role: "assistant", content: message.content });
      if (message.stop_reason === "refusal") {
        onEvent({ type: "notice", text: "O assistente recusou este pedido." });
        return { history: messages, changed, error: null };
      }
      const calls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || !calls.length) return { history: messages, changed, error: null };

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        // Stopped in the middle: the remaining calls still need a result, or the conversation cannot go on.
        if (signal.aborted) {
          results.push({ type: "tool_result", tool_use_id: call.id, content: "Interrompido pelo utilizador.", is_error: true });
          continue;
        }
        onEvent({ type: "tool", id: call.id, label: toolLabel(call.name, call.input), status: "running" });
        const outcome = await runTool(call.name, call.input, context);
        if (!outcome.isError && CHANGING_TOOLS.has(call.name)) changed = true;
        await settle();
        onEvent({
          type: "tool",
          id: call.id,
          label: toolLabel(call.name, call.input),
          status: outcome.isError ? "error" : "done",
          detail: outcome.isError ? outcome.content : undefined,
        });
        results.push({ type: "tool_result", tool_use_id: call.id, content: outcome.content, ...(outcome.isError && { is_error: true }) });
      }
      messages.push({ role: "user", content: results });
      if (signal.aborted) return { history: messages, changed, error: "Interrompido." };
    }
    onEvent({ type: "notice", text: "Parei: o pedido precisou de demasiados passos. Pedir de outra forma ou por partes." });
    return { history: messages, changed, error: null };
  } catch (e) {
    return { history: withResults(messages), changed, error: errorText(e) };
  }
}

/**
 * The history made valid again after a failure: an assistant message whose tool calls never got results gets
 * error results, so the next request is accepted.
 */
function withResults(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant" || typeof last.content === "string") return messages;
  const calls = last.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlockParam[];
  if (!calls.length) return messages;
  return [
    ...messages,
    { role: "user", content: calls.map((c) => ({ type: "tool_result" as const, tool_use_id: c.id, content: "Interrompido.", is_error: true })) },
  ];
}
