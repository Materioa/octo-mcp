/**
 * Auto-Memory: Client-side detection of memorable user messages.
 *
 * Instead of relying on the AI model to call `save_to_memory` (which free/small
 * models almost always ignore), this module runs heuristic pattern matching on
 * the user's message and silently saves detected facts to the memory store in
 * the background.
 */

import { getMemoryManager } from "@/lib/memory";

// ── Patterns that indicate a personal fact / preference ────────────────────
// Each pattern returns a cleaned-up memory string if it matches.
interface MemoryPattern {
  regex: RegExp;
  /** Build the memory string from the match. Return null to skip. */
  extract: (match: RegExpMatchArray, fullMsg: string) => string | null;
}

const PATTERNS: MemoryPattern[] = [
  // "I like / love / enjoy / prefer X"
  {
    regex: /\b(?:i\s+(?:really\s+)?(?:like|love|enjoy|adore|prefer))\s+(.{2,80})/i,
    extract: (m) => `User likes ${m[1]!.replace(/[.!?,;]+$/, "").trim()}`,
  },
  // "I don't like / hate / dislike X"
  {
    regex: /\b(?:i\s+(?:really\s+)?(?:don'?t\s+like|hate|dislike|can'?t\s+stand))\s+(.{2,80})/i,
    extract: (m) => {
      const thing = m[1]!.replace(/[.!?,;]+$/, "").trim();
      if (/^(it|this|that|them|him|her|you|me|us)$/i.test(thing)) return null;
      if (thing.toLowerCase().includes("anymore")) return null;
      return `User dislikes ${thing}`;
    },
  },
  // "I use / work with X"
  {
    regex: /\b(?:i\s+(?:use|work\s+with|develop\s+(?:in|with)|code\s+in|program\s+in))\s+(.{2,60})/i,
    extract: (m) => `User uses ${m[1]!.replace(/[.!?,;]+$/, "").trim()}`,
  },
  // "I'm a / I am a [role]"
  {
    regex: /\b(?:i'?m\s+a|i\s+am\s+a)\s+(.{2,60})/i,
    extract: (m) => `User is a ${m[1]!.replace(/[.!?,;]+$/, "").trim()}`,
  },
  // "I work at / for X"
  {
    regex: /\b(?:i\s+work\s+(?:at|for))\s+(.{2,60})/i,
    extract: (m) => `User works at ${m[1]!.replace(/[.!?,;]+$/, "").trim()}`,
  },
  // "I'm from / I live in X"
  {
    regex: /\b(?:i'?m\s+from|i\s+live\s+in|i\s+am\s+from)\s+(.{2,60})/i,
    extract: (m) => `User is from ${m[1]!.replace(/[.!?,;]+$/, "").trim()}`,
  },
  // "My name is X"
  {
    regex: /\bmy\s+name\s+is\s+(.{2,40})/i,
    extract: (m) => `User's name is ${m[1]!.replace(/[.!?,;]+$/, "").trim()}`,
  },
  // "My favorite X is Y"
  {
    regex: /\bmy\s+fav(?:ou?rite)?\s+(.{2,30})\s+is\s+(.{2,60})/i,
    extract: (m) => `User's favorite ${m[1]!.trim()} is ${m[2]!.replace(/[.!?,;]+$/, "").trim()}`,
  },
  // "I'm interested in X"
  {
    regex: /\b(?:i'?m\s+interested\s+in|i\s+am\s+interested\s+in)\s+(.{2,80})/i,
    extract: (m) => `User is interested in ${m[1]!.replace(/[.!?,;]+$/, "").trim()}`,
  },
  // "I study / am studying X" or "I'm studying X"
  {
    regex: /\b(?:i\s+(?:study|am\s+studying)|i'?m\s+studying)\s+(.{2,60})/i,
    extract: (m) => `User studies ${m[1]!.replace(/[.!?,;]+$/, "").trim()}`,
  },
  // "I'm learning X"
  {
    regex: /\b(?:i'?m\s+learning|i\s+am\s+learning)\s+(.{2,60})/i,
    extract: (m) => `User is learning ${m[1]!.replace(/[.!?,;]+$/, "").trim()}`,
  },
  // "I'm X years old" or "I am X"
  {
    regex: /\b(?:i'?m|i\s+am)\s+(\d{1,3})\s*(?:years?\s*old)?/i,
    extract: (m) => {
      const age = parseInt(m[1]!, 10);
      if (age > 3 && age < 120) return `User is ${age} years old`;
      return null;
    },
  },
  // "I prefer X over Y"
  {
    regex: /\bi\s+prefer\s+(.{2,40})\s+over\s+(.{2,40})/i,
    extract: (m) => `User prefers ${m[1]!.trim()} over ${m[2]!.replace(/[.!?,;]+$/, "").trim()}`,
  },
  // "remember that ..."
  {
    regex: /\b(?:remember\s+(?:that|this)?)\s*[:;]?\s*(.{3,120})/i,
    extract: (m) => m[1]!.replace(/[.!?,;]+$/, "").trim(),
  },
  // "save this: ..." or "note this: ..."
  {
    regex: /\b(?:save|note)\s+(?:this|that)\s*[:;]\s*(.{3,200})/i,
    extract: (m) => m[1]!.replace(/[.!?,;]+$/, "").trim(),
  },
  // "I have a X" (pet, car, etc.)
  {
    regex: /\bi\s+have\s+(?:a|an)\s+(dog|cat|pet|car|bike|house|apartment|brother|sister|child|kid|son|daughter)(?:\s+(?:named|called)\s+(.{2,30}))?/i,
    extract: (m) => {
      const thing = m[1]!.trim();
      const name = m[2]?.trim();
      return name
        ? `User has a ${thing} named ${name}`
        : `User has a ${thing}`;
    },
  },
  // "My X is Y" (generic but useful)
  {
    regex: /\bmy\s+(birthday|email|phone|number|address|school|university|college|major|hobby|pet|dog|cat)\s+is\s+(.{2,60})/i,
    extract: (m) => `User's ${m[1]!.trim()} is ${m[2]!.replace(/[.!?,;]+$/, "").trim()}`,
  },
];

// Messages shorter than this are usually greetings / single words — skip
const MIN_MSG_LENGTH = 6;

// Avoid saving duplicates within the same session
const savedThisSession = new Set<string>();

/**
 * Check if a new memory is semantically similar to any existing memory.
 * Uses simple word-overlap heuristic to avoid calling an LLM.
 */
function isDuplicate(newContent: string, existingMemories: { content: string }[]): boolean {
  const newWords = new Set(newContent.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2));
  if (newWords.size === 0) return false;

  for (const mem of existingMemories) {
    const existingWords = new Set(mem.content.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2));
    if (existingWords.size === 0) continue;

    // Count overlapping meaningful words
    let overlap = 0;
    for (const w of newWords) {
      if (existingWords.has(w)) overlap++;
    }

    // If >50% of the new memory's key words already exist in a stored memory, skip
    const overlapRatio = overlap / newWords.size;
    if (overlapRatio > 0.5) return true;
  }
  return false;
}

/**
 * Inspect a user message and, if it contains a personal fact, silently save it
 * to memory in the background.
 *
 * @param message   The raw user message text
 * @param userId    Current user / anonymous ID (for segregation)
 * @param isTemporary  If true (incognito), skip saving
 */
export function autoDetectAndSaveMemory(
  message: string,
  userId: string,
  isTemporary: boolean
): void {
  if (isTemporary) return;
  if (message.length < MIN_MSG_LENGTH) return;

  for (const pattern of PATTERNS) {
    const match = message.match(pattern.regex);
    if (match) {
      const memoryContent = pattern.extract(match, message);
      if (memoryContent && memoryContent.length > 3) {
        // De-duplicate within the same browser session
        const key = memoryContent.toLowerCase().trim();
        if (savedThisSession.has(key)) return;
        savedThisSession.add(key);

        // Fire-and-forget — check existing memories then save if unique
        const apiKey = import.meta.env.VITE_SUPERMEMORY_API_KEY || "";
        const mem = getMemoryManager(apiKey, userId);
        
        // Check for duplicates before saving
        mem.listMemories(50).then((existingMemories) => {
          if (isDuplicate(memoryContent, existingMemories)) {
            console.debug("[auto-memory] skipped duplicate:", memoryContent);
            return;
          }
          mem.addMemory(memoryContent).catch((err) => {
            console.debug("[auto-memory] silent save failed:", err);
          });
        }).catch(() => {
          // If listing fails, save anyway
          mem.addMemory(memoryContent).catch((err) => {
            console.debug("[auto-memory] silent save failed:", err);
          });
        });

        // Only save the first matched pattern per message
        return;
      }
    }
  }
}
