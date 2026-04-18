// ─────────────────────────────────────────────────────
//  Resource Library Service
//  Fetches, caches, and queries the resource index
// ─────────────────────────────────────────────────────

import {
  CDN_BASE,
  API_BASE,
  RESOURCE_LIB_URL,
  POINTER_THRESHOLD,
  CACHE_TTL,
} from "../constants.js";
import type { ResourceLibrary, ResourceItem } from "../types.js";

let cachedLib: ResourceLibrary | null = null;
let cacheTimestamp = 0;

/**
 * Slugify a topic name to be used in the URL path.
 * Strips special characters and replaces spaces with hyphens or URL encodes.
 */
function slugify(text: string): string {
  return encodeURIComponent(text.trim());
}

/**
 * Fetch the resource library index with in-memory caching.
 */
export async function getResourceLibrary(): Promise<ResourceLibrary> {
  const now = Date.now();
  if (cachedLib && now - cacheTimestamp < CACHE_TTL) {
    return cachedLib;
  }

  const res = await fetch(RESOURCE_LIB_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch resource library: ${res.status} ${res.statusText}`
    );
  }
  cachedLib = (await res.json()) as ResourceLibrary;
  cacheTimestamp = now;
  return cachedLib;
}

/**
 * Build the correct PDF URL for a given resource item.
 * – Direct CDN path:  /pdfs/{sem}/{subject}/{topic}.pdf
 * – API proxy path:   /api/pdfs/{sem}/{subject}/{topic}.pdf  (for pointers / small files)
 *
 * We do a lightweight HEAD request to detect pointer files.
 */
export function buildPdfUrl(
  semester: string,
  subject: string,
  topic: string,
  useApi: boolean = false
): string {
  const base = useApi ? API_BASE : CDN_BASE;
  const prefix = useApi ? "/api/pdfs" : "/pdfs";
  if (semester === "9999") {
    return `${base}${prefix}/${semester}/${slugify(subject)}/vault/${slugify(topic)}.pdf`;
  }
  return `${base}${prefix}/${slugify(semester)}/${slugify(subject)}/${slugify(topic)}.pdf`;
}

export async function generateMaskedUrl(actualUrl: string): Promise<string> {
  try {
    const response = await fetch("https://materioa.vercel.app/api/v2/features?action=pdf-share&subAction=create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actualUrl })
    });
    if (response.ok) {
      const data = (await response.json()) as any;
      if (data && data.maskId) {
        return `https://materioa.vercel.app/?share=${data.maskId}`;
      }
    }
  } catch (err) { }
  // Fallback
  return actualUrl;
}

/**
 * Try direct CDN first; if the file is a pointer (≤ 1 KB), fall back to the API proxy.
 */
export async function resolvePdfUrl(
  semester: string,
  subject: string,
  topic: string
): Promise<string> {
  const directUrl = buildPdfUrl(semester, subject, topic, false);
  try {
    const head = await fetch(directUrl, { method: "HEAD" });
    const contentLength = Number(head.headers.get("content-length") ?? 0);
    if (!head.ok || contentLength <= POINTER_THRESHOLD) {
      return buildPdfUrl(semester, subject, topic, true);
    }
    return directUrl;
  } catch {
    // Network error — fall back to API proxy
    return buildPdfUrl(semester, subject, topic, true);
  }
}

/**
 * List all semesters available in the library.
 */
export async function listSemesters(): Promise<string[]> {
  const lib = await getResourceLibrary();
  return Object.keys(lib).sort((a, b) => Number(a) - Number(b));
}

/**
 * List all subjects for a given semester.
 */
export async function listSubjects(semester: string): Promise<string[]> {
  const lib = await getResourceLibrary();
  const sem = lib[semester];
  if (!sem) return [];
  return Object.keys(sem);
}

/**
 * List all resource sections for a given semester + subject.
 */
export async function listResources(
  semester: string,
  subject: string
): Promise<ResourceItem[]> {
  const lib = await getResourceLibrary();
  const sem = lib[semester];
  if (!sem) return [];

  // Fuzzy-match the subject name (case-insensitive, partial)
  const subKey = Object.keys(sem).find(
    (k) =>
      k.toLowerCase() === subject.toLowerCase() ||
      k.toLowerCase().includes(subject.toLowerCase()) ||
      subject.toLowerCase().includes(k.toLowerCase())
  );
  if (!subKey) return [];

  const sections = sem[subKey];
  const items: ResourceItem[] = [];

  for (const section of sections) {
    for (const topic of section.content) {
      items.push({
        semester,
        subject: subKey,
        sectionType: section.type,
        topic,
        pdfUrl: buildPdfUrl(semester, subKey, topic, false),
      });
    }
  }
  return items;
}

/**
 * Search across ALL semesters / subjects / topics for a query string.
 */
export async function searchResources(query: string): Promise<ResourceItem[]> {
  const lib = await getResourceLibrary();
  const q = query.toLowerCase();
  const results: ResourceItem[] = [];

  for (const [semester, subjects] of Object.entries(lib)) {
    for (const [subject, sections] of Object.entries(subjects)) {
      // Match subject name
      const subjectMatch =
        subject.toLowerCase().includes(q) ||
        q.includes(subject.toLowerCase());

      for (const section of sections) {
        // Match section type
        const typeMatch = section.type.toLowerCase().includes(q);

        for (const topic of section.content) {
          const topicMatch = topic.toLowerCase().includes(q);

          if (subjectMatch || typeMatch || topicMatch) {
            results.push({
              semester,
              subject,
              sectionType: section.type,
              topic,
              pdfUrl: buildPdfUrl(semester, subject, topic, false),
            });
          }
        }
      }
    }
  }
  return results;
}

/**
 * Get a flattened index of everything in the library.
 */
export async function getFullIndex(): Promise<
  Array<{
    semester: string;
    subject: string;
    sections: Array<{ type: string; count: number }>;
  }>
> {
  const lib = await getResourceLibrary();
  const result: Array<{
    semester: string;
    subject: string;
    sections: Array<{ type: string; count: number }>;
  }> = [];

  for (const [semester, subjects] of Object.entries(lib)) {
    for (const [subject, sections] of Object.entries(subjects)) {
      result.push({
        semester,
        subject,
        sections: sections.map((s) => ({ type: s.type, count: s.content.length })),
      });
    }
  }
  return result;
}
