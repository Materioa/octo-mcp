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

function getSemanticMatchThreshold(): number {
  const value = Number(process.env.SEMANTIC_MATCH_THRESHOLD ?? 0.3);
  if (!Number.isFinite(value)) {
    throw new Error("SEMANTIC_MATCH_THRESHOLD must be a valid number.");
  }
  return value;
}

function normalizeSemester(semester: string): string {
  const match = semester.trim().match(/\d+/);
  return match ? match[0] : semester.trim();
}

async function resolveCanonicalSubject(
  client: SupabaseClient,
  semester: string,
  subject: string
): Promise<string> {
  const trimmedSubject = subject.trim();
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const requested = normalize(trimmedSubject);

  const { data, error } = await client
    .from("materio_chunks")
    .select("subject")
    .eq("semester", semester)
    .limit(1000);

  if (error || !data) {
    return trimmedSubject;
  }

  const subjects = [...new Set(data.map((row: any) => String(row.subject)))];
  return (
    subjects.find((candidate) => normalize(candidate) === requested) ||
    subjects.find((candidate) => normalize(candidate).includes(requested)) ||
    subjects.find((candidate) => requested.includes(normalize(candidate))) ||
    trimmedSubject
  );
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
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Perplexity embedding input is empty.");
  }
  const apiKey = getPerplexityKey();
  const url = "https://api.perplexity.ai/v1/contextualizedembeddings";

  const isValidNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

  const coerceEmbedding = (embedding: unknown): number[] | null => {
    if (Array.isArray(embedding)) {
      if (!embedding.every(isValidNumber)) return null;
      return embedding as number[];
    }

    if (typeof embedding === "string") {
      const buffer = Buffer.from(embedding, "base64");
      return Array.from(new Int8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
    }

    return null;
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: [[trimmed]],
      model: "pplx-embed-context-v1-0.6b",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as any;
  const embedding = coerceEmbedding(result?.data?.[0]?.data?.[0]?.embedding);
  if (embedding) {
    return embedding;
  }

  throw new Error("Could not extract embedding from Perplexity API response. Unexpected response format.");
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
  const normalizedSemester = normalizeSemester(semester);
  const canonicalSubject = await resolveCanonicalSubject(client, normalizedSemester, subject);

  // 1. Generate embedding for user query
  const queryEmbedding = await getPerplexityEmbedding(query);

  // 2. Perform vector search in Supabase using pgvector
  // Assumes an RPC function named 'match_documents' exists in Supabase.
  // The RPC should match the semester, subject, and order by inner product or cosine distance.
  const { data, error } = await client.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_threshold: getSemanticMatchThreshold(),
    match_count: matchCount,
    filter_semester: normalizedSemester,
    filter_subject: canonicalSubject
  });

  if (error) {
    throw new Error(`Supabase search error: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    content: row.chunk_text,
    topic: row.topic,
    subject: row.subject,
    similarity: row.similarity
  }));
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

  if ((!data || data.length === 0) && (semester || subject)) {
    const { data: fallbackData, error: fallbackError } = await client.rpc("search_vectorless", {
      query_text: query,
      filter_semester: null,
      filter_subject: null,
      match_count: matchCount
    });

    if (fallbackError) {
      throw new Error(`Supabase vectorless search error: ${fallbackError.message}`);
    }

    return (fallbackData || []).map((row: any) => ({
      content: row.chunk_text,
      topic: row.topic,
      subject: row.subject,
      similarity: row.similarity
    }));
  }

  return (data || []).map((row: any) => ({
    content: row.chunk_text,
    topic: row.topic,
    subject: row.subject,
    similarity: row.similarity
  }));
}
