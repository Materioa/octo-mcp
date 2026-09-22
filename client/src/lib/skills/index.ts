// Built-in skills bundled at compile time via Vite's import.meta.glob.
// These are always available regardless of user settings.

export interface BuiltinSkill {
  id: string;          // unique stable id
  name: string;        // parsed from YAML frontmatter "name:"
  description: string; // parsed from YAML frontmatter "description:"
  content: string;     // full raw SKILL.md content (including frontmatter)
  files?: { path: string, content: string }[];
  builtIn: true;
}

/** Parse the YAML frontmatter "key: value" lines simply */
function parseFrontmatter(raw: string): Record<string, string> {
  if (!raw.startsWith("---")) return {};
  const endIdx = raw.indexOf("\n---", 3);
  if (endIdx === -1) return {};
  const block = raw.slice(4, endIdx);
  const result: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

function makeBuiltinSkill(id: string, content: string, files?: { path: string, content: string }[]): BuiltinSkill {
  const fm = parseFrontmatter(content);
  return {
    id,
    name: fm.name || id,
    description: fm.description || "",
    content,
    files,
    builtIn: true,
  };
}

const skillCreatorFilesMap = import.meta.glob("./skill-creator/**/*", { query: "?raw", import: "default", eager: true });
const productSelfKnowledgeFilesMap = import.meta.glob("./product-self-knowledge/**/*", { query: "?raw", import: "default", eager: true });

function mapFiles(fileMap: Record<string, unknown>, prefixToStrip: string) {
  const files: { path: string, content: string }[] = [];
  let mainContent = "";
  for (const [path, content] of Object.entries(fileMap)) {
    const normalizedPath = path.replace(prefixToStrip, "").replace(/^\//, "");
    if (normalizedPath === "SKILL.md") {
      mainContent = content as string;
    } else {
      files.push({ path: normalizedPath, content: content as string });
    }
  }
  return { mainContent, files };
}

const skillCreator = mapFiles(skillCreatorFilesMap, "./skill-creator/");
const productSelfKnowledge = mapFiles(productSelfKnowledgeFilesMap, "./product-self-knowledge/");

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  makeBuiltinSkill("builtin-skill-creator", skillCreator.mainContent, skillCreator.files),
  makeBuiltinSkill("builtin-product-self-knowledge", productSelfKnowledge.mainContent, productSelfKnowledge.files),
];

/**
 * Given a user message, return which built-in skills are relevant.
 * Matches against skill name + description keywords.
 */
export function detectRelevantBuiltinSkills(userMessage: string): BuiltinSkill[] {
  const msg = userMessage.toLowerCase();
  return BUILTIN_SKILLS.filter((skill) => {
    const haystack = `${skill.name} ${skill.description}`.toLowerCase();
    // Simple word overlap — score >= 1 keyword match
    const keywords = msg
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    return keywords.some((kw) => haystack.includes(kw));
  });
}
