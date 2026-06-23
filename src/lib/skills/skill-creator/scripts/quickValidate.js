#!/usr/bin/env node
/**
 * Quick validation script for skills - validates SKILL.md frontmatter
 *
 * Usage:
 *   node quickValidate.js <skill_directory>
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const ALLOWED_PROPERTIES = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "metadata",
  "compatibility",
]);

/**
 * Parse YAML frontmatter from a string manually (no external deps).
 * Handles simple key: value pairs only (no nested objects / lists).
 * @param {string} text
 * @returns {Record<string, string> | null}
 */
function parseSimpleYaml(text) {
  const result = {};
  for (const line of text.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    // Value may span multiple lines joined with a leading "|" – treat everything as a string
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Validate a skill folder.
 * @param {string} skillPath
 * @returns {{ valid: boolean; message: string }}
 */
export function validateSkill(skillPath) {
  const resolvedPath = resolve(skillPath);
  const skillMdPath = join(resolvedPath, "SKILL.md");

  if (!existsSync(skillMdPath)) {
    return { valid: false, message: "SKILL.md not found" };
  }

  const content = readFileSync(skillMdPath, "utf8");

  if (!content.startsWith("---")) {
    return { valid: false, message: "No YAML frontmatter found" };
  }

  // Extract frontmatter between first --- and second ---
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { valid: false, message: "Invalid frontmatter format" };
  }

  const frontmatterText = content.slice(4, endIndex); // skip leading "---\n"

  let frontmatter;
  try {
    frontmatter = parseSimpleYaml(frontmatterText);
  } catch (e) {
    return { valid: false, message: `Invalid YAML in frontmatter: ${e.message}` };
  }

  // Check for unexpected properties
  const unexpectedKeys = Object.keys(frontmatter).filter(
    (k) => !ALLOWED_PROPERTIES.has(k)
  );
  if (unexpectedKeys.length > 0) {
    return {
      valid: false,
      message: `Unexpected key(s) in SKILL.md frontmatter: ${unexpectedKeys.sort().join(", ")}. Allowed: ${[...ALLOWED_PROPERTIES].sort().join(", ")}`,
    };
  }

  // Required fields
  if (!frontmatter.name) {
    return { valid: false, message: "Missing 'name' in frontmatter" };
  }
  if (!frontmatter.description) {
    return { valid: false, message: "Missing 'description' in frontmatter" };
  }

  // Validate name (kebab-case)
  const name = frontmatter.name.trim();
  if (name) {
    if (!/^[a-z0-9-]+$/.test(name)) {
      return {
        valid: false,
        message: `Name '${name}' should be kebab-case (lowercase letters, digits, and hyphens only)`,
      };
    }
    if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
      return {
        valid: false,
        message: `Name '${name}' cannot start/end with hyphen or contain consecutive hyphens`,
      };
    }
    if (name.length > 64) {
      return {
        valid: false,
        message: `Name is too long (${name.length} characters). Maximum is 64 characters.`,
      };
    }
  }

  // Validate description
  const description = (frontmatter.description || "").trim();
  if (description) {
    if (description.includes("<") || description.includes(">")) {
      return {
        valid: false,
        message: "Description cannot contain angle brackets (< or >)",
      };
    }
    if (description.length > 1024) {
      return {
        valid: false,
        message: `Description is too long (${description.length} characters). Maximum is 1024 characters.`,
      };
    }
  }

  // Validate compatibility (optional)
  const compatibility = (frontmatter.compatibility || "").trim();
  if (compatibility && compatibility.length > 500) {
    return {
      valid: false,
      message: `Compatibility is too long (${compatibility.length} characters). Maximum is 500 characters.`,
    };
  }

  return { valid: true, message: "Skill is valid!" };
}

/**
 * Parse SKILL.md frontmatter and return metadata.
 * @param {string} skillMdContent  Raw file content
 * @returns {{ name: string; description: string; [key: string]: string }}
 */
export function parseSkillFrontmatter(skillMdContent) {
  if (!skillMdContent.startsWith("---")) return {};
  const endIndex = skillMdContent.indexOf("\n---", 3);
  if (endIndex === -1) return {};
  const frontmatterText = skillMdContent.slice(4, endIndex);
  return parseSimpleYaml(frontmatterText);
}

// CLI entry point
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const skillDir = process.argv[2];
  if (!skillDir) {
    console.error("Usage: node quickValidate.js <skill_directory>");
    process.exit(1);
  }
  const { valid, message } = validateSkill(skillDir);
  console.log(message);
  process.exit(valid ? 0 : 1);
}
