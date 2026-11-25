// llm.ts — the LLM provider wrapper (backend-only; z-ai-web-dev-sdk).
//
// One door for every planner's LLM pass: a strict system prompt in, JSON
// out. THE LAW: this wrapper never throws and never returns a malformed
// shape — a failed pass surfaces as null so callers fall back to their
// declared deterministic path instead of poisoning the plan. Markdown code
// fences are tolerated; the first JSON object/array in the answer wins.

import ZAI from "z-ai-web-dev-sdk";

interface ChatCompletionShape {
  choices?: Array<{ message?: { content?: unknown } }>;
}

async function requestText(system: string, user: string): Promise<string | null> {
  const zai = await ZAI.create();
  const completion: unknown = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });
  if (typeof completion !== "object" || completion === null) return null;
  const content = (completion as ChatCompletionShape).choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim().length > 0 ? content : null;
}

/** Raw-text pass — the model's answer verbatim, or null on any failure. */
export async function chatText(system: string, user: string): Promise<string | null> {
  try {
    return await requestText(system, user);
  } catch {
    return null;
  }
}

/**
 * JSON pass — extracts the first JSON object/array in the answer (markdown
 * fences tolerated) and parses it. `maxItems` caps array results. Never
 * throws; any failure returns null.
 */
export async function chatJson<T>(
  system: string,
  user: string,
  opts?: { maxItems?: number },
): Promise<T | null> {
  try {
    const text = await requestText(system, user);
    if (text === null) return null;
    const parsed = parseLooseJson(text);
    if (parsed === null) return null;
    if (opts?.maxItems !== undefined && Array.isArray(parsed)) {
      return parsed.slice(0, opts.maxItems) as unknown as T;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

/** Strip markdown code-fence markers before slicing out the JSON payload. */
function stripFences(text: string): string {
  return text.replace(/```[a-zA-Z]*/g, "").replace(/```/g, "");
}

/**
 * Locate the first `{` or `[` and the matching last `}`/`]`, then parse.
 * Returns null when no balanced-looking payload exists or JSON.parse fails.
 */
function parseLooseJson(text: string): unknown {
  const stripped = stripFences(text);
  const brace = stripped.indexOf("{");
  const bracket = stripped.indexOf("[");
  let open = -1;
  let close = -1;
  if (brace >= 0 && (bracket < 0 || brace < bracket)) {
    open = brace;
    close = stripped.lastIndexOf("}");
  } else if (bracket >= 0) {
    open = bracket;
    close = stripped.lastIndexOf("]");
  }
  if (open < 0 || close <= open) return null;
  try {
    return JSON.parse(stripped.slice(open, close + 1)) as unknown;
  } catch {
    return null;
  }
}
