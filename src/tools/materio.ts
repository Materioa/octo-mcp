// ─────────────────────────────────────────────────────
//  Materio MCP Tools — Course Material Operations
// ─────────────────────────────────────────────────────

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listSemesters,
  listSubjects,
  listResources,
  searchResources,
  resolvePdfUrl,
  getFullIndex,
  generateMaskedUrl,
} from "../services/resources.js";
import { queryDeepThinkRAG, queryVectorlessRAG } from "../services/rag.js";
import { CHARACTER_LIMIT } from "../constants.js";
import { registerDiagramTools } from "./diagrams.js";
import { registerDiagramGeneratorTools } from "./diagram-generator.js";
import { lookupGfG } from "./gfg.js";
import fs from "fs";
import { fileURLToPath } from "url";

const PROMPT_FILES = [
  {
    name: "diagram-generation",
    title: "Accurate Diagram Generation",
    description: "Prompt templates and rules for reliable Mermaid/DOT diagram generation.",
    file: "diagram-generation.txt",
  },
  {
    name: "diagram-enhancements",
    title: "Diagram Tool Enhancements",
    description: "Architecture and usage notes for enhanced diagram rendering tools.",
    file: "diagram-enhancements.txt",
  },
  {
    name: "diagram-usage-examples",
    title: "Diagram Usage Examples",
    description: "End-to-end examples for generating and rendering supported diagram formats.",
    file: "diagram-usage-examples.txt",
  },
  {
    name: "share-link-policy",
    title: "Share Link Policy",
    description: "Rules for safely handling internal PDF URLs and masked share links.",
    file: "share-link-policy.txt",
  },
] as const;

function promptPath(fileName: string): string {
  return fileURLToPath(new URL(`../../prompts/${fileName}`, import.meta.url));
}

function readPromptFile(fileName: string): string {
  try {
    const path = promptPath(fileName);
    return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
  } catch {
    return "";
  }
}

function registerPromptFiles(server: McpServer): void {
  for (const prompt of PROMPT_FILES) {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
      },
      () => {
        const text = readPromptFile(prompt.file);
        return {
          description: prompt.description,
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: text || `Prompt file not found: prompts/${prompt.file}`,
              },
            },
          ],
        };
      }
    );
  }
}

// ── Load share-link policy prompt for tool descriptions ──
const SHARE_LINK_POLICY = readPromptFile("share-link-policy.txt");

// ────────── Schemas ──────────

const ListSemestersSchema = {} as const;

const ListSubjectsSchema = {
  semester: z
    .string()
    .describe('Semester number, e.g. "1", "2", "3", "4", "5", "6"'),
};

const ListResourcesSchema = {
  semester: z
    .string()
    .describe('Semester number, e.g. "1", "2", "3", "4", "5", "6"'),
  subject: z
    .string()
    .describe(
      "Subject name or partial match, e.g. 'Operating System', 'Maths', 'Java'"
    ),
};

const SearchResourcesSchema = {
  query: z
    .string()
    .min(2, "Query must be at least 2 characters")
    .describe(
      "Search query to match against subjects, section types, or topic names"
    ),
};

const GetPdfUrlSchema = {
  semester: z.string().describe("Semester number"),
  subject: z
    .string()
    .describe("Subject name (exact or partial match)"),
  topic: z
    .string()
    .describe("Topic / file name within the subject"),
};

const GetTopicContentSchema = {
  semester: z.string().describe("Semester number"),
  subject: z
    .string()
    .describe("Subject name (exact or partial match)"),
  topic: z
    .string()
    .describe("Topic / file name within the subject to explain"),
};

const DeepThinkSchema = {
  query: z.string().describe("The user's specific question that requires deep RAG search"),
  semester: z.string().describe("Semester number"),
  subject: z.string().describe("Subject name to scope the search context"),
};

const VectorlessSearchSchema = {
  query: z.string().describe("Keyword search query for finding specific text content across course materials"),
  semester: z.string().optional().describe("Optional semester to narrow search"),
  subject: z.string().optional().describe("Optional subject to narrow search")
};

const GenerateShareLinkSchema = {
  url: z.string().optional().describe("Direct raw CDN URL. If provided, semester/subject/topic are ignored."),
  semester: z.string().optional().describe("Semester number"),
  subject: z.string().optional().describe("Subject name"),
  topic: z.string().optional().describe("Topic / file name"),
};

const LookupExternalSourcesSchema = {
  topic: z.string().describe("The topic or question to look up on GeeksforGeeks"),
};

// ────────── Register all tools ──────────

export function registerMaterioTools(server: McpServer): void {
  registerPromptFiles(server);

  // Register diagram generation tools (Mermaid, Graphviz)
  registerDiagramTools(server);
  registerDiagramGeneratorTools(server);
  // ──── 1. SemesterNavigator ────
  server.registerTool(
    "SemesterNavigator",
    {
      title: "List Available Semesters",
      description: `List all semesters available in the Materio course library.

Returns an array of semester numbers (e.g. ["1", "2", "3", "4", "5", "6", "9"]).
Use this as the first step to discover what content is available.

Returns:
  JSON array of semester identifiers sorted numerically.

Examples:
  - "What semesters are available?" → call with no params
  - "Show me all semesters" → call with no params`,
      inputSchema: ListSemestersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const semesters = await listSemesters();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  semesters,
                  count: semesters.length,
                  hint: "Use CourseDirectory with a semester number to see its subjects.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing semesters: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ──── 2. CourseDirectory ────
  server.registerTool(
    "CourseDirectory",
    {
      title: "List Subjects for a Semester",
      description: `List all subjects available in a specific semester of the Materio library.

Args:
  - semester (string): The semester number, e.g. "1", "2", "3", "4", "5", "6"

Returns:
  JSON with the semester, an array of subject names, and count.

Examples:
  - "What subjects are in semester 4?" → semester="4"
  - "Show me sem 3 courses" → semester="3"`,
      inputSchema: ListSubjectsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ semester }) => {
      try {
        const subjects = await listSubjects(semester);
        if (subjects.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No subjects found for semester "${semester}". Use SemesterNavigator to see available semesters.`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  semester,
                  subjects,
                  count: subjects.length,
                  hint: "Use ResourceLibrary with semester + subject to see available materials.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing subjects: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ──── 3. ResourceLibrary ────
  server.registerTool(
    "ResourceLibrary",
    {
      title: "List Resources for a Subject",
      description: `List all available course materials (chapters, assignments, question banks, previous year papers, etc.) for a specific subject in a semester.

Args:
  - semester (string): Semester number
  - subject (string): Subject name or partial match (case-insensitive fuzzy match)

Returns:
  JSON array of resource items grouped by section type, each with topic name and PDF URL.

Examples:
  - "Show me Operating System materials" → semester="4", subject="Operating System"
  - "What chapters are in DBMS?" → semester="3", subject="Database Management Systems"
  - "Get me Maths-2 tutorials" → semester="2", subject="Maths-2"`,
      inputSchema: ListResourcesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ semester, subject }) => {
      try {
        const items = await listResources(semester, subject);
        if (items.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No resources found for "${subject}" in semester ${semester}. Use CourseDirectory to see available subjects for this semester.`,
              },
            ],
          };
        }

        // Group by section type for readability
        const grouped: Record<string, Array<{ topic: string; pdfUrl: string }>> = {};
        for (const item of items) {
          if (!grouped[item.sectionType]) grouped[item.sectionType] = [];
          grouped[item.sectionType].push({
            topic: item.topic,
            pdfUrl: item.pdfUrl,
          });
        }

        const output = {
          semester,
          subject: items[0].subject,
          totalResources: items.length,
          sections: grouped,
        };

        let text = JSON.stringify(output, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          // Truncate to section summaries
          const summary = {
            semester,
            subject: items[0].subject,
            totalResources: items.length,
            sections: Object.entries(grouped).map(([type, topics]) => ({
              type,
              count: topics.length,
              firstFew: topics.slice(0, 3).map((t) => t.topic),
            })),
            truncated: true,
            hint: "Response truncated. Use GlobalSearch to find specific topics.",
          };
          text = JSON.stringify(summary, null, 2);
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing resources: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ──── 4. GlobalSearch ────
  server.registerTool(
    "GlobalSearch",
    {
      title: "Search Course Materials",
      description: `Search across ALL semesters, subjects, and topics in the Materio library.
Matches against subject names, section types (Chapters, Assignments, Question Banks, etc.), and topic names.
This is the PRIMARY tool for finding specific course content.

Args:
  - query (string): Search query (min 2 chars). Matches case-insensitively against subject names, section types, and topic names.

Returns:
  JSON array of matching resource items with semester, subject, section type, topic name, and PDF URL.

Examples:
  - "Find deadlocks material" → query="Deadlocks"
  - "Search for question banks" → query="Question Bank"
  - "Find Python content" → query="Python"
  - "Get previous year papers for OS" → query="Operating System"
  - "Find sorting algorithms" → query="Sorting"`,
      inputSchema: SearchResourcesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query }) => {
      try {
        const results = await searchResources(query);
        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No results found for "${query}". Try broader search terms or use SemesterNavigator to browse.`,
              },
            ],
          };
        }

        let output: any = {
          query,
          totalResults: results.length,
          results: results.map((r) => ({
            semester: r.semester,
            subject: r.subject,
            type: r.sectionType,
            topic: r.topic,
            pdfUrl: r.pdfUrl,
          })),
        };

        let text = JSON.stringify(output, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          output = {
            query,
            totalResults: results.length,
            showing: 30,
            truncated: true,
            results: results.slice(0, 30).map((r) => ({
              semester: r.semester,
              subject: r.subject,
              type: r.sectionType,
              topic: r.topic,
              pdfUrl: r.pdfUrl,
            })),
            hint: "Results truncated. Narrow your search query for more precise results.",
          };
          text = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ──── 5. ResourceAccess ────
  server.registerTool(
    "ResourceAccess",
    {
      title: "Get PDF Download URL (Internal Use Only)",
      description: `Get the resolved download URL for a specific PDF document.
Automatically detects pointer files (≤1KB) and returns the API proxy URL instead of the direct CDN URL.

## SHARE LINK POLICY (MANDATORY)
${SHARE_LINK_POLICY ? SHARE_LINK_POLICY.slice(0, 1500) : `
- NEVER expose the URL returned by this tool directly to the user in chat.
- If the user asks for a link, you MUST pass this URL into ShareLinkGenerator to generate a masked share link.
- You CAN use the raw URL for internal fetching/downloading if you need to read the PDF.
- Share links (materioa.vercel.app/?share=...) are UI pages, NOT raw PDFs. You CANNOT fetch/read PDFs via share links.
`}

Args:
  - semester (string): Semester number
  - subject (string): Subject name (exact or partial)
  - topic (string): Topic / file name

Returns:
  JSON with the resolved PDF URL (direct CDN or API proxy depending on file size).
  This URL is for INTERNAL use: fetching content, passing to ShareLinkGenerator, etc.

Examples:
  - "Get the PDF for Deadlocks in OS sem 4" → semester="4", subject="Operating System", topic="Deadlocks"
  - "Download link for Stacks chapter in DDS" → semester="3", subject="Design of Data Structures", topic="Stacks, Recursion and Queue"`,
      inputSchema: GetPdfUrlSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ semester, subject, topic }) => {
      try {
        // First try to find exact match in library for correct naming
        const items = await listResources(semester, subject);
        const match = items.find(
          (i) =>
            i.topic.toLowerCase() === topic.toLowerCase() ||
            i.topic.toLowerCase().includes(topic.toLowerCase())
        );

        let resolvedUrl: string;
        if (match) {
          resolvedUrl = await resolvePdfUrl(
            match.semester,
            match.subject,
            match.topic
          );
        } else {
          resolvedUrl = await resolvePdfUrl(semester, subject, topic);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  semester,
                  subject: match?.subject ?? subject,
                  topic: match?.topic ?? topic,
                  pdfUrl: resolvedUrl,
                  sectionType: match?.sectionType ?? "unknown",
                  _policy: "INTERNAL URL — do NOT show to user. Use ShareLinkGenerator for user-facing links. Use this URL only for fetching/reading PDF content.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error resolving PDF URL: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ──── 6. ConceptExplorer ────
  server.registerTool(
    "ConceptExplorer",
    {
      title: "Get Topic Content and Explanation",
      description: `Retrieve information about a specific topic from the Materio library and provide context for answering questions about it.
Returns the topic metadata, related resources (other chapters in the same subject), and the PDF URL for reference.

Use this when a user asks a question ABOUT a specific topic (e.g. "Explain deadlocks", "What is Laplace Transform?").
The response includes enough context for you to provide a helpful answer or direct the user to the right PDF.

Args:
  - semester (string): Semester number
  - subject (string): Subject name (exact or partial)
  - topic (string): The topic to explain / find content for

Returns:
  JSON with topic details, PDF URL, related topics in the same subject, and study context.

Examples:
  - "Explain deadlocks in OS" → semester="4", subject="Operating System", topic="Deadlocks"
  - "What is Laplace Transform?" → semester="2", subject="Maths-2", topic="Laplace Transform"
  - "Tell me about Inheritance in Java" → semester="3", subject="Object Oriented Programming with Java", topic="Inheritance"`,
      inputSchema: GetTopicContentSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ semester, subject, topic }) => {
      try {
        const items = await listResources(semester, subject);
        const match = items.find(
          (i) =>
            i.topic.toLowerCase() === topic.toLowerCase() ||
            i.topic.toLowerCase().includes(topic.toLowerCase())
        );

        // All chapters in the same subject for context
        const chapters = items.filter((i) => i.sectionType === "Chapters");
        const questionBanks = items.filter(
          (i) =>
            i.sectionType === "Question Banks" ||
            i.sectionType === "Important Questions"
        );
        const prevYearPapers = items.filter(
          (i) => i.sectionType === "Previous Year Papers"
        );

        let resolvedUrl = "";
        if (match) {
          resolvedUrl = await resolvePdfUrl(
            match.semester,
            match.subject,
            match.topic
          );
        }

        const output = {
          found: !!match,
          topic: match?.topic ?? topic,
          semester,
          subject: match?.subject ?? subject,
          sectionType: match?.sectionType ?? "unknown",
          pdfUrl: resolvedUrl || null,
          relatedChapters: chapters.map((c) => c.topic),
          availableQuestionBanks: questionBanks.map((q) => ({
            topic: q.topic,
            pdfUrl: q.pdfUrl,
          })),
          previousYearPapers: prevYearPapers.map((p) => ({
            topic: p.topic,
            pdfUrl: p.pdfUrl,
          })),
          studyAdvice: match
            ? `This topic "${match.topic}" is part of ${match.subject} (Semester ${match.semester}). The PDF is available for detailed study. Related chapters and question banks are listed above.`
            : `Topic "${topic}" was not found exactly, but here are all available chapters for ${subject} in semester ${semester}. Try browsing the chapter list or searching with different terms.`,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(output, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting topic content: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ──── 7. KnowledgeAtlas ────
  server.registerTool(
    "KnowledgeAtlas",
    {
      title: "Get Full Library Index",
      description: `Get a compact overview of the entire Materio course library.
Returns all semesters, subjects, and section types with resource counts.
Useful for understanding the full scope of available materials.

Returns:
  JSON array with semester, subject name, and array of section types with counts.

Examples:
  - "What's available in the entire library?" → call with no params
  - "Give me an overview of all materials" → call with no params`,
      inputSchema: {} as const,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const index = await getFullIndex();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  totalSubjects: index.length,
                  library: index,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting full index: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ──── 8. SnapSearch ────
  server.registerTool(
    "SnapSearch",
    {
      title: "Primary Vectorless Search (FTS)",
      description: `The new primary tool for extremely fast, non-semantic keyword matching across all course material text chunks. 
Uses Postgres Full-Text Search (TSVECTOR) to instantly find documents containing specific keywords or topics.
Use this for 90% of search queries before resorting to DeepThink.
Returns chunk texts, topic names, and pdf URLs.

Args:
  - query: Keywords to search for.
  - semester: (Optional) Limit search to semester.
  - subject: (Optional) Limit search to subject.
`,
      inputSchema: VectorlessSearchSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, semester, subject }) => {
      try {
        const results = await queryVectorlessRAG(query, semester, subject, 10);
        
        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No results found in the Vectorless Search. You may want to try broader terminology or use DeepThink as a fallback."
              }
            ]
          };
        }

        const contextText = results.map((r, i) => `[Result ${i + 1}] Topic: ${r.topic} (Similarity Score: ${r.similarity?.toFixed(2) ?? 'N/A'}) [Subject: ${r.subject}]
---
${r.content}`).join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Vectorless Full-Text Search Results:\n\n${contextText}\n\nUse this context to formulate a response to the user's question.`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Vectorless Search error: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );

  // ──── 9. DeepThink ────
  server.registerTool(
    "DeepThink",
    {
      title: "Deep Think RAG Tool",
      description: `Power tool for complex questions when PDF fetch fails or the document is OCR-unreadable.
This tool performs a semantic Deep RAG search over the Materio vector database (pgvector).
Use it when standard context retrieval isn't enough, or when an error occurs fetching standard PDFs.

Args:
  - query: Exact question being asked.
  - semester: The semester.
  - subject: The specific subject context.
`,
      inputSchema: DeepThinkSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, semester, subject }) => {
      try {
        const trimmedQuery = query.trim();
        if (!trimmedQuery || !semester.trim() || !subject.trim()) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Deep Think requires non-empty query, semester, and subject values.",
              },
            ],
          };
        }

        const results = await queryDeepThinkRAG(trimmedQuery, semester.trim(), subject.trim(), 5);
        
        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Deep Think failed to find any relevant context for the query based on the subject and semester provided."
              }
            ]
          };
        }

        const contextText = results.map((r, i) => `[Context ${i + 1}] Topic: ${r.topic} (Similarity: ${r.similarity?.toFixed(2) ?? 'N/A'})
${r.content}`).join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Deep Think Context Received:\n\n${contextText}\n\nUse this context to formulate a response to the user's question: "${query}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Deep Think Tool error: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );

  // ──── 10. ShareLinkGenerator ────
  server.registerTool(
    "ShareLinkGenerator",
    {
      title: "Generate Secure Share Link",
      description: `Generates a secure, masked share link for a Materio PDF document.
MANDATORY: If a user asks for ANY link to a file, ALWAYS use this tool. NEVER show raw CDN/API URLs in chat.
Returns a clean materioa.vercel.app/?share=... link that opens natively in the Materio UI.

CRITICAL: The generated share link is a UI web page, NOT a raw PDF.
- You CANNOT use the share link to download or fetch the PDF yourself.
- Use the share link EXCLUSIVELY to present to the user.
- To fetch/read a PDF internally, use the raw URL from ResourceAccess instead.

Args:
  - url: (Optional) Direct CDN URL of the PDF (from ResourceAccess).
  - semester: (Optional) Semester number
  - subject: (Optional) Subject name
  - topic: (Optional) Topic / file name
`,
      inputSchema: GenerateShareLinkSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ url, semester, subject, topic }) => {
      try {
        let rawUrl = url;
        if (!rawUrl) {
          if (!semester || !subject || !topic) {
            return {
              content: [{ type: "text", text: "Error: You must provide either a 'url' OR 'semester', 'subject', and 'topic'." }]
            };
          }

          const items = await listResources(semester, subject);
          const match = items.find(
            (i) =>
              i.topic.toLowerCase() === topic.toLowerCase() ||
              i.topic.toLowerCase().includes(topic.toLowerCase())
          );

          if (match) {
            rawUrl = await resolvePdfUrl(match.semester, match.subject, match.topic);
          } else {
            rawUrl = await resolvePdfUrl(semester, subject, topic);
          }
        }

        if (!rawUrl) {
          return {
            content: [{ type: "text", text: "Error: Could not resolve a PDF URL to generate a share link. Verify the semester, subject, and topic are correct." }]
          };
        }

        const shareLink = await generateMaskedUrl(rawUrl);
        return {
          content: [
            {
              type: "text",
              text: `Secure Share Link:\n${shareLink}\n\nPresent ONLY this masked share link to the user. Do NOT expose the direct CDN URL.`
            }
          ]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error generating share link: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // ──── 11. LookupExternalSources ────
  server.registerTool(
    "LookupExternalSources",
    {
      title: "Lookup External Sources (GeeksforGeeks)",
      description: "Look up any topic or question on GeeksforGeeks to extract relevant educational context. Use this if the answer is not found in the regular Materio library or SnapSearch/DeepThink yield insufficient context.",
      inputSchema: LookupExternalSourcesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ topic }) => {
      try {
        const result = await lookupGfG(topic);

        if (!result.found) {
          return {
            content: [{ type: "text" as const, text: "No relevant GeeksforGeeks article found for the topic." }]
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Source: ${result.source}\n\nExtracted Content:\n${result.content}\n\nUse this context to answer the user's question.`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `External lookup error: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
}
