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

  const response = await fetch("https://api.perplexity.ai/v1/contextualizedembeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      // The user specified they index using context model. 
      // Usually queries might use pplx-embed-v1, but sticking to user's specified model
      model: "pplx-embed-context-v1-0.6b",
      input: text
    })
  });

  if (!response.ok) {
    throw new Error(`Perplexity API error: ${response.status} ${await response.text()}`);
  }

  const result = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return result.data[0].embedding;
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
