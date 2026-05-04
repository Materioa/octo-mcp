import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (supabase) return supabase;

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_KEY) are not set.");
  }

  supabase = createClient(supabaseUrl, supabaseKey);
  return supabase;
}

function getPerplexityKey(): string {
  const key = process.env.PERPLEXITY_API_KEY || "";
  if (!key) {
    throw new Error("PERPLEXITY_API_KEY environment variable is not set.");
  }
  return key;
}

export interface RagResult {
  content: string;
  topic: string;
  subject: string;
  similarity: number;
}

/**
 * Gets embeddings from Perplexity API
 */
async function getPerplexityEmbedding(text: string): Promise<number[]> {
  const apiKey = getPerplexityKey();
  const url = "https://api.perplexity.ai/v1/contextualizedembeddings";

  const candidateBodies = [
    { model: "pplx-embed-context-v1-0.6b", input: [[text]] },
    { model: "pplx-embed-context-v1-0.6b", input: [text] },
    { model: "pplx-embed-context-v1-0.6b", input: text },
    { model: "pplx-embed-context-v1-0.6b", inputs: [text] },
    { model: "pplx-embed-context-v1-0.6b", inputs: [[text]] },
  ];

  let lastErr: any = null;
  for (const body of candidateBodies) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        // try next variant on 4xx; surface other errors immediately
        const text = await response.text();
        const code = response.status;
        if (code >= 400 && code < 500) {
          lastErr = new Error(`Perplexity API (${code}): ${text}`);
          continue;
        }
        throw new Error(`Perplexity API error: ${code} ${text}`);
      }

      const result = (await response.json()) as any;
      // handle nested contextual response formats
      if (result.data && result.data[0] && Array.isArray(result.data[0].data)) {
        return result.data[0].data[0].embedding;
      }
      if (result.data && result.data[0] && result.data[0].embedding) {
        return result.data[0].embedding;
      }
      if (result.embedding) return result.embedding;
      // last fallback: try to find any numeric array in the response
      const flattened = JSON.stringify(result).match(/\[[-0-9.,\s]{50,}\]/m);
      if (flattened) {
        try {
          const arr = JSON.parse(flattened[0]);
          if (Array.isArray(arr) && typeof arr[0] === "number") return arr as number[];
        } catch {
          // ignore
        }
      }
      throw new Error("Could not extract embedding from Perplexity API response. Unexpected response format.");
    } catch (e: any) {
      lastErr = e;
      continue;
    }
  }

  throw lastErr || new Error("Perplexity embedding request failed with unknown error");
}

/**
 * Performs a vector search against Supabase pgvector
 */
export async function queryDeepThinkRAG(
  query: string,
  semester: string,
  subject: string,
  matchCount: number = 5
): Promise<RagResult[]> {
  const client = getSupabaseClient();

  // 1. Generate embedding for user query
  const queryEmbedding = await getPerplexityEmbedding(query);

  // 2. Perform vector search in Supabase using pgvector
  // Assumes an RPC function named 'match_documents' exists in Supabase.
  // The RPC should match the semester, subject, and order by inner product or cosine distance.
  const { data, error } = await client.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_threshold: 0.7, // Adjust threshold as needed
    match_count: matchCount,
    filter_semester: semester,
    filter_subject: subject
  });

  if (error) {
    throw new Error(`Supabase search error: ${error.message}`);
  }

  return (data || []) as RagResult[];
}

/**
 * Performs a fast text-based search using Supabase Full-Text Search (tsvector)
 */
export async function queryVectorlessRAG(
  query: string,
  semester?: string,
  subject?: string,
  matchCount: number = 10
): Promise<RagResult[]> {
  const client = getSupabaseClient();

  const { data, error } = await client.rpc("search_vectorless", {
    query_text: query,
    filter_semester: semester || null,
    filter_subject: subject || null,
    match_count: matchCount
  });

  if (error) {
    throw new Error(`Supabase vectorless search error: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    content: row.chunk_text,
    topic: row.topic,
    subject: row.subject,
    similarity: row.similarity
  }));
}
