import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_MODEL = "claude-haiku-4-5";

const INFERENCE_PARAMS = {
  max_tokens: 60,
  temperature: 0.3,
  top_p: 1.0,
  stop_sequences: ["\n"],
};

// Provider-agnostic prompt. Both Claude and OpenAI implementations send
// this verbatim — no divergent prompts.
function buildSummaryPrompt({
  user_query,
  localities,
  results_count,
  suggestions_count,
  nearby,
  nouns = { singular: "rental", plural: "rentals" },
}) {
  const localitiesStr =
    Array.isArray(localities) && localities.length > 0
      ? localities.join(", ")
      : "";
  const { singular, plural } = nouns;
  return `You are a copywriter for OGHomes, a real-estate marketplace in Bangalore, India. Write ONE short, friendly sentence (max 18 words) describing the search result set below. The sentence appears directly under the search bar on the listings page.

Output rules:
- Output ONLY the sentence. No quotes, no markdown, no preamble, no labels, no trailing newline. Do NOT ask for clarification.
- Use sentence case and correct English grammar.
- Use correct singular/plural: "1 ${singular}" / "2 ${plural}". Never write "1 ${plural}" or "${singular}(s)".
- Title-case locality names ("indiranagar" -> "Indiranagar", "hsr layout" -> "HSR Layout").
- Mention the localities only if the list is non-empty below. Do NOT mention the city, Bangalore, or India.
- When multiple localities are listed, join naturally: 2 → "X and Y", 3+ → "X, Y, and Z". Do NOT list more than 4; if the list has 5+ say "X, Y, and N other areas".
- Do NOT invent details (price, BHK, amenities, furnishing) unless they appear verbatim in user_query.
- Do NOT add emojis.

Tone guidance:
- If results_count > 0 and nearby is false: results are literally in the listed locality/localities — say "in {Localities}". Keep it warm and direct.
- If results_count > 0 and nearby is true: results are from nearby localities, not the exact ones the user asked for — say "near {Localities}" (or "around"). Do NOT say "in {Localities}" — that would mislead the user.
- If results_count == 0 and suggestions_count > 0: acknowledge no exact match in the listed localities and gently mention we're showing similar nearby options.
- If results_count == 0 and suggestions_count == 0: acknowledge nothing matched and suggest widening filters. You may address the user as "you" only in this case.

Vary the phrasing — don't reuse the same wording every time. Be natural, not robotic.

Inputs:
- user_query: ${user_query}
- localities: ${localitiesStr}
- results_count: ${results_count}
- suggestions_count: ${suggestions_count}
- nearby: ${nearby}

Now output the single sentence and nothing else.`;
}

class ClaudeClient {
  constructor() {
    this.provider = "claude";
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async generateSummary(input) {
    const prompt = buildSummaryPrompt(input);
    const t0 = Date.now();
    const response = await this.client.messages.create({
      model: CLAUDE_MODEL,
      ...INFERENCE_PARAMS,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim();
    return {
      text,
      latency_ms: Date.now() - t0,
      prompt_tokens: response.usage?.input_tokens ?? null,
      completion_tokens: response.usage?.output_tokens ?? null,
    };
  }
}

class OpenAIClient {
  constructor() {
    this.provider = "openai";
  }

  // Stub — fill in when the GPT key is wired up. Throwing here causes the
  // summary builder to fall through to the deterministic fallback.
  async generateSummary() {
    throw new Error("OpenAIClient not implemented");
  }
}

let cachedClient = null;
let cachedProviderKey = null;

export function getLLMClient() {
  const provider = (process.env.LLM_PROVIDER || "claude").toLowerCase();
  if (cachedClient && cachedProviderKey === provider) return cachedClient;
  cachedClient =
    provider === "openai" ? new OpenAIClient() : new ClaudeClient();
  cachedProviderKey = provider;
  return cachedClient;
}

export { ClaudeClient, OpenAIClient, buildSummaryPrompt };
