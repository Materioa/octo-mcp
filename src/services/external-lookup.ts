import { lookupGfG } from "../tools/gfg.js";

export interface ExternalLookupResult {
  topic: string;
  source: string | null;
  content: string;
  found: boolean;
  provider: "exa" | "gfg" | "wikipedia" | null;
  shouldAskUser: boolean;
  prompt?: string;
}

interface ExaSearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    text?: string;
    summary?: string;
    highlights?: string[];
  }>;
}

const DEFAULT_EXA_API_URL = "https://api.exa.ai/search";
const DEFAULT_EXTERNAL_LOOKUP_PROMPT = "No related material data was found - should I look for external sources?";

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getExternalLookupPrompt(): string {
  return DEFAULT_EXTERNAL_LOOKUP_PROMPT;
}

async function searchExa(topic: string): Promise<ExternalLookupResult> {
  const apiKey = toTrimmedString(process.env.EXA_API_KEY);

  if (!apiKey) {
    throw new Error("Exa API key is not configured");
  }

  const exaUrl = toTrimmedString(process.env.EXA_API_URL) || DEFAULT_EXA_API_URL;
  const response = await fetch(exaUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query: topic,
      type: "auto",
      numResults: 5,
      contents: {
        text: true,
        highlights: true,
        summary: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Exa search failed with status ${response.status}`);
  }

  const payload = (await response.json()) as ExaSearchResponse;
  const results = payload.results ?? [];
  const bestMatch = results[0];

  if (!bestMatch?.url) {
    return {
      topic,
      source: null,
      content: "",
      found: false,
      provider: "exa",
      shouldAskUser: true,
      prompt: getExternalLookupPrompt(),
    };
  }

  const content =
    toTrimmedString(bestMatch.summary) ||
    toTrimmedString(bestMatch.text) ||
    toTrimmedString(bestMatch.highlights?.[0]);

  return {
    topic,
    source: bestMatch.url,
    content,
    found: Boolean(content),
    provider: "exa",
    shouldAskUser: false,
  };
}

export async function lookupExternalSources(topic: string, useExa = false): Promise<ExternalLookupResult> {
  if (!useExa) {
    return {
      topic,
      source: null,
      content: "",
      found: false,
      provider: null,
      shouldAskUser: true,
      prompt: getExternalLookupPrompt(),
    };
  }

  try {
    const exaResult = await searchExa(topic);
    if (exaResult.found) {
      return exaResult;
    }
  } catch {
    // Fall through to legacy external sources.
  }

  const legacyResult = await lookupGfG(topic);

  if (legacyResult.found) {
    return {
      topic: legacyResult.topic,
      source: legacyResult.source,
      content: legacyResult.content,
      found: true,
      provider: legacyResult.source?.includes("geeksforgeeks.org") ? "gfg" : "wikipedia",
      shouldAskUser: false,
    };
  }

  return {
    topic,
    source: null,
    content: "",
    found: false,
    provider: null,
    shouldAskUser: true,
    prompt: getExternalLookupPrompt(),
  };
}