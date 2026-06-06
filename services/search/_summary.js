import { getLLMClient } from "../_shared/llmClient.js";

const AI_TIMEOUT_MS = 2000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SUMMARY_LEN = 140;
const FORBIDDEN_CHARS = ['"', "`", "*", "_", "#"];

const cache = new Map();
const counters = { ai_summary_fallback_total: 0 };

export function fallbackSummary(
  results_count,
  suggestions_count,
  localities,
  { nearby = false } = {},
) {
  const names = (Array.isArray(localities) ? localities : [])
    .map((l) => (l && l.trim() ? titleCase(l.trim()) : null))
    .filter(Boolean);
  const place = names.length > 0 ? ` ${joinNames(names)}` : "";

  if (results_count > 0) {
    const noun = results_count === 1 ? "rental" : "rentals";
    const prep = place ? ` ${nearby ? "near" : "in"}${place}` : "";
    return `Found ${results_count} ${noun}${prep}.`;
  }
  if (suggestions_count > 0) {
    return place
      ? `No exact matches in${place} — showing similar rentals nearby.`
      : "No exact matches — showing similar rentals you might like.";
  }
  return place
    ? `No rentals found in${place}. Try widening the filters.`
    : "No rentals match your search. Try widening the filters.";
}

function joinNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function titleCase(s) {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

export function validateSummary(text) {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > MAX_SUMMARY_LEN) return false;
  if (trimmed.includes("\n")) return false;
  if (FORBIDDEN_CHARS.some((c) => trimmed.includes(c))) return false;
  const lower = trimmed.toLowerCase();
  if (lower.includes("bangalore") || lower.includes("india")) return false;
  return true;
}

function cacheKey(
  provider,
  localities,
  results_count,
  suggestions_count,
  nearby,
) {
  const locs = (localities || [])
    .map((l) => (l || "").trim().toLowerCase())
    .sort()
    .join(",");
  return `${provider}|${locs}|${results_count}|${suggestions_count}|${nearby ? 1 : 0}`;
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("llm_timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function logSummary(fields) {
  // One-line structured log; intentionally omits the prompt and response body.
  console.log(`[summary] ${JSON.stringify(fields)}`);
}

export async function buildSummary({
  user_query,
  filters,
  results_count,
  suggestions_count,
  nearby = false,
}) {
  const localities = Array.isArray(filters?.localities)
    ? filters.localities
        .map((l) => (l && l.trim() ? l.trim() : null))
        .filter(Boolean)
    : [];
  const client = getLLMClient();
  const provider = client.provider;
  const key = cacheKey(
    provider,
    localities,
    results_count,
    suggestions_count,
    nearby,
  );

  const cached = cacheGet(key);
  if (cached) {
    logSummary({
      provider,
      cache_hit: true,
      fallback_used: false,
      results_count,
      suggestions_count,
    });
    return cached;
  }

  try {
    const { text, latency_ms, prompt_tokens, completion_tokens } =
      await withTimeout(
        client.generateSummary({
          user_query: user_query ?? "",
          localities,
          results_count,
          suggestions_count,
          nearby,
        }),
        AI_TIMEOUT_MS,
      );
    const cleaned = (text || "").trim();
    if (validateSummary(cleaned)) {
      cacheSet(key, cleaned);
      logSummary({
        provider,
        cache_hit: false,
        fallback_used: false,
        latency_ms,
        prompt_tokens,
        completion_tokens,
        results_count,
        suggestions_count,
      });
      return cleaned;
    }
    counters.ai_summary_fallback_total += 1;
    logSummary({
      provider,
      cache_hit: false,
      fallback_used: true,
      reason: "validation_failed",
      latency_ms,
      prompt_tokens,
      completion_tokens,
      results_count,
      suggestions_count,
    });
  } catch (err) {
    counters.ai_summary_fallback_total += 1;
    console.warn(`[summary] llm call failed: ${err.message}`);
    logSummary({
      provider,
      cache_hit: false,
      fallback_used: true,
      reason: err.message === "llm_timeout" ? "timeout" : "exception",
      results_count,
      suggestions_count,
    });
  }

  const fb = fallbackSummary(results_count, suggestions_count, localities, {
    nearby,
  });
  cacheSet(key, fb);
  return fb;
}

export const __metrics = counters;
