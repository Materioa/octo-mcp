import { useChatStore } from "@/stores/chat";
import type { ToolCall } from "@/types";

interface FormatToolIntentOptions {
  tense?: "present" | "past";
  status?: ToolCall["status"];
  currentPdfTitle?: string | null;
}

/**
 * Truncates a string to a max length and adds ellipsis if necessary.
 */
function truncate(str: string, maxLength: number = 36): string {
  if (!str) return "";
  const cleaned = str.replace(/[\r\n\t]+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trimEnd() + "…";
}

/**
 * Strips verbose file paths or ugly extensions from document titles for clean presentation.
 */
function cleanDocTitle(title?: string | null): string {
  if (!title) return "";
  let cleaned = title.trim();
  if (/pdf\.?js(\s+viewer)?/i.test(cleaned)) {
    return "document";
  }
  // Strip path if full path is passed
  cleaned = cleaned.split(/[/\\]/).pop() || cleaned;
  // If it ends with .pdf, we can keep or strip, keeping it is helpful for context
  return truncate(cleaned, 32);
}

/**
 * Safely parses tool arguments if they come as a JSON string.
 */
function parseArgs(args: any): Record<string, any> {
  if (!args) return {};
  if (typeof args === "object" && !Array.isArray(args)) return args;
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      if (typeof parsed === "object" && parsed !== null) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Normalizes tool names into distinct words (supports snake_case, kebab-case, camelCase).
 */
function splitToolNameWords(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Maps common action verbs into natural present continuous (-ing) and past (-ed) tenses.
 */
const VERB_MAP: Record<string, { present: string; past: string }> = {
  read: { present: "Reading", past: "Read" },
  search: { present: "Searching", past: "Searched" },
  find: { present: "Finding", past: "Found" },
  lookup: { present: "Looking up", past: "Looked up" },
  get: { present: "Fetching", past: "Fetched" },
  fetch: { present: "Fetching", past: "Fetched" },
  retrieve: { present: "Retrieving", past: "Retrieved" },
  load: { present: "Loading", past: "Loaded" },
  pull: { present: "Pulling", past: "Pulled" },
  create: { present: "Creating", past: "Created" },
  generate: { present: "Generating", past: "Generated" },
  build: { present: "Building", past: "Built" },
  make: { present: "Making", past: "Made" },
  add: { present: "Adding", past: "Added" },
  new: { present: "Creating", past: "Created" },
  update: { present: "Updating", past: "Updated" },
  edit: { present: "Editing", past: "Edited" },
  modify: { present: "Modifying", past: "Modified" },
  patch: { present: "Patching", past: "Patched" },
  change: { present: "Updating", past: "Updated" },
  set: { present: "Setting", past: "Set" },
  delete: { present: "Deleting", past: "Deleted" },
  remove: { present: "Removing", past: "Removed" },
  drop: { present: "Dropping", past: "Dropped" },
  clear: { present: "Clearing", past: "Cleared" },
  send: { present: "Sending", past: "Sent" },
  post: { present: "Posting", past: "Posted" },
  publish: { present: "Publishing", past: "Published" },
  dispatch: { present: "Dispatching", past: "Dispatched" },
  run: { present: "Running", past: "Ran" },
  exec: { present: "Executing", past: "Executed" },
  execute: { present: "Executing", past: "Executed" },
  calc: { present: "Calculating", past: "Calculated" },
  calculate: { present: "Calculating", past: "Calculated" },
  compute: { present: "Computing", past: "Computed" },
  check: { present: "Checking", past: "Checked" },
  verify: { present: "Verifying", past: "Verified" },
  validate: { present: "Validating", past: "Validated" },
  test: { present: "Testing", past: "Tested" },
  analyze: { present: "Analyzing", past: "Analyzed" },
  parse: { present: "Parsing", past: "Parsed" },
  process: { present: "Processing", past: "Processed" },
  list: { present: "Listing", past: "Listed" },
  query: { present: "Querying", past: "Queried" },
  download: { present: "Downloading", past: "Downloaded" },
  export: { present: "Exporting", past: "Exported" },
  upload: { present: "Uploading", past: "Uploaded" },
  import: { present: "Importing", past: "Imported" },
  ask: { present: "Asking", past: "Asked" },
  save: { present: "Saving", past: "Saved" },
  sync: { present: "Syncing", past: "Synced" },
  open: { present: "Opening", past: "Opened" },
  close: { present: "Closing", past: "Closed" },
  inspect: { present: "Inspecting", past: "Inspected" },
  synthesize: { present: "Synthesizing", past: "Synthesized" },
  browse: { present: "Browsing", past: "Browsed" },
  locate: { present: "Locating", past: "Located" },
  format: { present: "Formatting", past: "Formatted" },
  convert: { present: "Converting", past: "Converted" },
  scan: { present: "Scanning", past: "Scanned" },
};

/**
 * Inflects any verb token into natural present/past tense.
 */
function inflectVerb(verb: string, tense: "present" | "past"): string {
  const lower = verb.toLowerCase();
  if (VERB_MAP[lower]) {
    return VERB_MAP[lower][tense];
  }

  // General English heuristics
  if (tense === "present") {
    if (lower.endsWith("ie")) return lower.slice(0, -2) + "ying";
    if (lower.endsWith("e") && !lower.endsWith("ee")) return lower.slice(0, -1) + "ing";
    return lower + "ing";
  } else {
    if (lower.endsWith("e")) return lower + "d";
    return lower + "ed";
  }
}

/**
 * Converts a tool call and its actual arguments into a readable natural language task.
 * For example:
 * - `read_current_pdf` (action: "get_current_page") -> "Reading current page of Physics.pdf"
 * - `read_current_pdf` (action: "read_page", pageNumber: 4) -> "Reading page 4 of Physics.pdf"
 * - `read_current_pdf` (action: "search_text", query: "entropy") -> "Searching Physics.pdf for 'entropy'"
 * - `exa_web_search` (query: "react 19 features") -> "Searching web for 'react 19 features'"
 * - `execute_js` -> "Computing calculation" / "Running code sandbox"
 */
export function formatToolIntent(
  toolCall?: ToolCall | { name?: string; args?: any; status?: string } | null,
  options?: FormatToolIntentOptions
): string {
  if (!toolCall) {
    return options?.tense === "past" ? "Tool executed" : "Running tool";
  }
  const name = toolCall.name || "tool";
  const args = parseArgs(toolCall.args);
  const status = options?.status || toolCall.status;
  const isPast = options?.tense === "past" || status === "completed";
  const tense: "present" | "past" = isPast ? "past" : "present";

  // Check active PDF context (either passed in options or from chat store)
  const activePdfTitle = cleanDocTitle(
    options?.currentPdfTitle !== undefined
      ? options.currentPdfTitle
      : useChatStore.getState().currentPdf?.title
  );

  // 1. read_current_pdf tool
  if (name === "read_current_pdf") {
    let action = args.action;
    const pageNumber = args.pageNumber !== undefined ? args.pageNumber : args.page;
    const query = args.query || args.search;

    if (!action) {
      if (pageNumber !== undefined && pageNumber !== null && !isNaN(Number(pageNumber))) {
        action = "read_page";
      } else if (query) {
        action = "search_text";
      } else {
        action = "get_current_page";
      }
    }

    if (action === "get_current_page") {
      if (isPast) {
        return activePdfTitle ? `Read current page of ${activePdfTitle}` : "Read current page";
      }
      return activePdfTitle ? `Reading current page of ${activePdfTitle}` : "Reading current page";
    }

    if (action === "read_page") {
      if (pageNumber !== undefined && pageNumber !== null) {
        if (isPast) {
          return activePdfTitle
            ? `Read page ${pageNumber} of ${activePdfTitle}`
            : `Read page ${pageNumber}`;
        }
        return activePdfTitle
          ? `Reading page ${pageNumber} of ${activePdfTitle}`
          : `Reading page ${pageNumber}`;
      }
      if (isPast) {
        return activePdfTitle ? `Read page of ${activePdfTitle}` : "Read document page";
      }
      return activePdfTitle ? `Reading page of ${activePdfTitle}` : "Reading document page";
    }

    if (action === "search_text") {
      if (query) {
        const cleanQ = truncate(query, 30);
        if (isPast) {
          return activePdfTitle
            ? `Searched ${activePdfTitle} for "${cleanQ}"`
            : `Searched document for "${cleanQ}"`;
        }
        return activePdfTitle
          ? `Searching ${activePdfTitle} for "${cleanQ}"`
          : `Searching document for "${cleanQ}"`;
      }
      if (isPast) {
        return activePdfTitle ? `Searched ${activePdfTitle}` : "Searched document";
      }
      return activePdfTitle ? `Searching ${activePdfTitle}` : "Searching document";
    }

    if (action === "get_summary") {
      if (isPast) {
        return activePdfTitle ? `Inspected overview of ${activePdfTitle}` : "Inspected document overview";
      }
      return activePdfTitle ? `Inspecting overview of ${activePdfTitle}` : "Inspecting document overview";
    }

    // Default read_current_pdf
    if (isPast) {
      return activePdfTitle ? `Read ${activePdfTitle}` : "Read document";
    }
    return activePdfTitle ? `Reading ${activePdfTitle}` : "Reading document";
  }

  // 2. Web search tools (exa_web_search, etc.)
  if (name === "exa_web_search" || name.includes("web_search") || name === "google_search") {
    const q = args.query || args.q || args.search_query;
    if (q) {
      const cleanQ = truncate(q, 34);
      return isPast ? `Searched web for "${cleanQ}"` : `Searching web for "${cleanQ}"`;
    }
    return isPast ? "Searched the web" : "Searching the web";
  }

  // 3. execute_js / code interpreters
  if (name === "execute_js" || name === "run_code" || name === "code_interpreter") {
    const code = typeof args.code === "string" ? args.code : "";
    const isMath = /Math\.|\+|\*|\/|\^|calculate|sum|reduce|eval\(|average|formula/i.test(code);
    if (isMath) {
      return isPast ? "Calculated formula" : "Computing calculation";
    }
    return isPast ? "Executed code sandbox" : "Running code in sandbox";
  }

  // 4. generate_eraser_diagram
  if (name === "generate_eraser_diagram") {
    const title = args.title || args.description;
    if (title) {
      const cleanTitle = truncate(title, 30);
      return isPast ? `Generated diagram for "${cleanTitle}"` : `Creating diagram for "${cleanTitle}"`;
    }
    return isPast ? "Generated visual diagram" : "Generating visual diagram";
  }

  // 5. save_to_memory
  if (name === "save_to_memory") {
    return isPast ? "Saved key details to memory" : "Saving details to memory";
  }

  // 6. ask_user_input_v0
  if (name === "ask_user_input_v0") {
    const firstQ = Array.isArray(args.questions) && args.questions[0]?.question;
    if (firstQ) {
      return isPast ? "Awaited user input" : `Asking: "${truncate(firstQ, 32)}"`;
    }
    return isPast ? "Received user input" : "Awaiting your input";
  }

  // 7. skill_builder
  if (name === "skill_builder") {
    const skillName = args.name;
    if (skillName) {
      return isPast ? `Created skill "${skillName}"` : `Creating skill "${skillName}"`;
    }
    return isPast ? "Created skill" : "Creating skill";
  }

  // 8. Materio Core Tools
  if (name === "snap_search") {
    const q = args.query || args.q;
    if (q) {
      const cleanQ = truncate(q, 30);
      return isPast ? `Searched course materials for "${cleanQ}"` : `Searching course materials for "${cleanQ}"`;
    }
    return isPast ? "Searched course materials" : "Searching course materials";
  }

  if (name === "deep_think") {
    const q = args.query || args.topic;
    if (q) {
      const cleanQ = truncate(q, 30);
      return isPast ? `Synthesized concepts for "${cleanQ}"` : `Synthesizing concepts for "${cleanQ}"`;
    }
    return isPast ? "Reasoned through syllabus concepts" : "Deeply analyzing syllabus concepts";
  }

  if (name === "finder") {
    const q = args.query || args.topic || args.subject;
    if (q) {
      const cleanQ = truncate(q, 30);
      return isPast ? `Located syllabus topics for "${cleanQ}"` : `Locating syllabus topics for "${cleanQ}"`;
    }
    return isPast ? "Located syllabus topics" : "Locating syllabus topics";
  }

  if (name === "resource_library") {
    const subject = args.subject;
    const semester = args.semester;
    if (subject) {
      return isPast ? `Browsed resources for ${subject}` : `Browsing resources for ${subject}`;
    }
    if (semester) {
      return isPast ? `Browsed Semester ${semester} syllabus` : `Browsing Semester ${semester} syllabus`;
    }
    return isPast ? "Browsed course library" : "Browsing course resource library";
  }

  if (name === "lookup_external_sources") {
    const q = args.query;
    if (q) {
      const cleanQ = truncate(q, 30);
      return isPast ? `Searched reference sources for "${cleanQ}"` : `Searching reference sources for "${cleanQ}"`;
    }
    return isPast ? "Searched reference sources" : "Searching reference sources";
  }

  if (name === "check_current_exams") {
    return isPast ? "Checked active exam schedules" : "Checking active exam schedules";
  }

  if (name === "notifications") {
    return isPast ? "Checked academic announcements" : "Checking academic announcements";
  }

  if (name === "active_promotions" || name === "list_all_promotions") {
    return isPast ? "Checked promotions" : "Checking active promotions";
  }

  if (name === "read_insightroom_post") {
    const postTitle = args.title || args.slug;
    if (postTitle) {
      const cleanT = truncate(postTitle, 30);
      return isPast ? `Read article "${cleanT}"` : `Reading article "${cleanT}"`;
    }
    return isPast ? "Read InsightRoom article" : "Reading InsightRoom article";
  }

  if (name === "read_insightroom_posts") {
    return isPast ? "Listed InsightRoom articles" : "Listing InsightRoom articles";
  }

  if (name === "get_all_notebooks") {
    return isPast ? "Retrieved cloud notebooks" : "Loading cloud notebooks";
  }

  if (name === "create_notebook") {
    const notebookTitle = args.title;
    if (notebookTitle) {
      const cleanT = truncate(notebookTitle, 30);
      return isPast ? `Created notebook "${cleanT}"` : `Creating notebook "${cleanT}"`;
    }
    return isPast ? "Created cloud notebook" : "Creating cloud notebook";
  }

  if (name === "update_notebook") {
    return isPast ? "Updated notebook" : "Updating cloud notebook";
  }

  if (name === "delete_notebook") {
    return isPast ? "Deleted notebook" : "Deleting notebook";
  }

  if (name === "generate_document") {
    const docTitle = args.title;
    const format = args.format ? args.format.toUpperCase() : "document";
    if (docTitle) {
      const cleanT = truncate(docTitle, 26);
      return isPast ? `Generated ${format} for "${cleanT}"` : `Generating ${format} for "${cleanT}"`;
    }
    return isPast ? `Generated ${format}` : `Generating ${format}`;
  }

  if (name === "share_link_generator") {
    return isPast ? "Generated share link" : "Generating share link";
  }

  // 9. Intelligent Dynamic Decomposition for Any Generic / MCP Tool
  const words = splitToolNameWords(name);
  if (words.length > 0 && words[0]) {
    const firstWord = words[0];
    const verb = inflectVerb(firstWord, tense);
    const noun = words.slice(1).join(" ");

    // Look for salient arguments
    const queryArg = args.query || args.q || args.search || args.search_term || args.term || args.keyword || args.filter;
    const targetArg = args.title || args.name || args.filename || args.file || args.path || args.url || args.repo || args.repository || args.topic || args.id;

    if (queryArg && typeof queryArg === "string") {
      const cleanQ = truncate(queryArg, 28);
      return noun
        ? `${verb} ${noun} for "${cleanQ}"`
        : `${verb} for "${cleanQ}"`;
    }

    if (targetArg && typeof targetArg === "string") {
      const cleanT = truncate(targetArg, 28);
      return noun
        ? `${verb} ${noun} "${cleanT}"`
        : `${verb} "${cleanT}"`;
    }

    if (noun) {
      return `${verb} ${noun}`;
    }

    return `${verb} ${firstWord}`;
  }

  // Fallback
  return isPast ? `${name} completed` : `Running ${name}`;
}
