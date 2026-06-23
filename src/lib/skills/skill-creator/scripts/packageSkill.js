#!/usr/bin/env node
/**
 * Skill Packager — Creates a distributable .skill file (zip) of a skill folder.
 *
 * Usage:
 *   node packageSkill.js <path/to/skill-folder> [output-directory]
 *
 * Example:
 *   node packageSkill.js skills/public/my-skill
 *   node packageSkill.js skills/public/my-skill ./dist
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { resolve, join, relative, basename } from "path";
import { createWriteStream } from "fs";
import { validateSkill } from "./quickValidate.js";

// ─── Exclusion rules ────────────────────────────────────────────────────────

const EXCLUDE_DIRS = new Set(["__pycache__", "node_modules"]);
const EXCLUDE_FILES = new Set([".DS_Store"]);
const EXCLUDE_GLOBS = [/\.pyc$/];
// Only excluded at skill root level (not nested)
const ROOT_EXCLUDE_DIRS = new Set(["evals"]);

/**
 * Decide whether a relative path should be skipped.
 * @param {string} relPath  Path relative to skill folder's parent
 * @param {string} skillName  The skill folder name (first segment)
 */
function shouldExclude(relPath, skillName) {
  const parts = relPath.split(/[\\/]/);

  // Any segment in an excluded dir?
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;

  // Root-level excluded dirs (second segment after skillName)
  if (parts.length > 1 && parts[0] === skillName && ROOT_EXCLUDE_DIRS.has(parts[1])) {
    return true;
  }

  const name = parts[parts.length - 1];
  if (EXCLUDE_FILES.has(name)) return true;
  if (EXCLUDE_GLOBS.some((rx) => rx.test(name))) return true;

  return false;
}

// ─── Simple ZIP writer ───────────────────────────────────────────────────────
// Node has no built-in zip — we use a minimal implementation for a local-only
// use case (no compression, just store). If fflate / adm-zip is installed we
// prefer them. Otherwise we fall back to a "store-only" implementation.

async function writeZip(skillPath, outputFile) {
  const skillName = basename(skillPath);

  // Try to use JSZip or adm-zip if available in the project
  let JSZip;
  try {
    JSZip = (await import("jszip")).default;
  } catch (_) {
    JSZip = null;
  }

  if (JSZip) {
    const zip = new JSZip();
    addDirToZip(zip, skillPath, skillPath, skillName, skillName);

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    writeFileSync(outputFile, buffer);
    return;
  }

  // Fallback: minimal STORE-only zip built from scratch
  const entries = [];
  gatherFiles(skillPath, skillPath, skillName, entries);

  const parts = [];
  const centralDir = [];

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.arcName, "utf8");
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = buildLocalHeader(nameBytes, data.length, crc);
    const offset = parts.reduce((sum, b) => sum + b.length, 0);

    parts.push(localHeader);
    parts.push(data);

    centralDir.push(buildCentralDirEntry(nameBytes, data.length, crc, offset));
  }

  const centralDirBuf = Buffer.concat(centralDir);
  const centralDirOffset = parts.reduce((sum, b) => sum + b.length, 0);

  const eocd = buildEndOfCentralDir(
    entries.length,
    centralDirBuf.length,
    centralDirOffset
  );

  const allParts = [...parts, centralDirBuf, eocd];
  writeFileSync(outputFile, Buffer.concat(allParts));
}

function addDirToZip(zip, dir, rootPath, skillName, folderPrefix) {
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const relPath = `${folderPrefix}/${item}`;
    const arcName = relative(rootPath + "/../", fullPath).replace(/\\/g, "/");

    if (shouldExclude(arcName, skillName)) {
      console.log(`  Skipped: ${arcName}`);
      continue;
    }
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      addDirToZip(zip, fullPath, rootPath, skillName, relPath);
    } else {
      console.log(`  Added: ${arcName}`);
      zip.file(arcName, readFileSync(fullPath));
    }
  }
}

function gatherFiles(dir, rootPath, skillName, entries) {
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const arcName = relative(resolve(rootPath, ".."), fullPath).replace(/\\/g, "/");

    if (shouldExclude(arcName, skillName)) {
      console.log(`  Skipped: ${arcName}`);
      continue;
    }
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      gatherFiles(fullPath, rootPath, skillName, entries);
    } else {
      console.log(`  Added: ${arcName}`);
      entries.push({ arcName, data: readFileSync(fullPath) });
    }
  }
}

// ─── Minimal ZIP primitives (STORE, no compression) ──────────────────────────

function buildLocalHeader(nameBytes, fileSize, crc) {
  const buf = Buffer.alloc(30 + nameBytes.length);
  buf.writeUInt32LE(0x04034b50, 0); // local file header signature
  buf.writeUInt16LE(20, 4);          // version needed
  buf.writeUInt16LE(0, 6);           // general purpose bit flag
  buf.writeUInt16LE(0, 8);           // compression method: STORE
  buf.writeUInt16LE(0, 10);          // last mod time
  buf.writeUInt16LE(0, 12);          // last mod date
  buf.writeUInt32LE(crc, 14);        // crc-32
  buf.writeUInt32LE(fileSize, 18);   // compressed size
  buf.writeUInt32LE(fileSize, 22);   // uncompressed size
  buf.writeUInt16LE(nameBytes.length, 26); // file name length
  buf.writeUInt16LE(0, 28);          // extra field length
  nameBytes.copy(buf, 30);
  return buf;
}

function buildCentralDirEntry(nameBytes, fileSize, crc, localOffset) {
  const buf = Buffer.alloc(46 + nameBytes.length);
  buf.writeUInt32LE(0x02014b50, 0); // central dir header sig
  buf.writeUInt16LE(20, 4);          // version made by
  buf.writeUInt16LE(20, 6);          // version needed
  buf.writeUInt16LE(0, 8);           // flags
  buf.writeUInt16LE(0, 10);          // compression
  buf.writeUInt16LE(0, 12);          // mod time
  buf.writeUInt16LE(0, 14);          // mod date
  buf.writeUInt32LE(crc, 16);
  buf.writeUInt32LE(fileSize, 20);   // compressed
  buf.writeUInt32LE(fileSize, 24);   // uncompressed
  buf.writeUInt16LE(nameBytes.length, 28);
  buf.writeUInt16LE(0, 30);          // extra length
  buf.writeUInt16LE(0, 32);          // comment length
  buf.writeUInt16LE(0, 34);          // disk number start
  buf.writeUInt16LE(0, 36);          // internal attr
  buf.writeUInt32LE(0, 38);          // external attr
  buf.writeUInt32LE(localOffset, 42);
  nameBytes.copy(buf, 46);
  return buf;
}

function buildEndOfCentralDir(count, cdSize, cdOffset) {
  const buf = Buffer.alloc(22);
  buf.writeUInt32LE(0x06054b50, 0); // EOCD signature
  buf.writeUInt16LE(0, 4);           // disk number
  buf.writeUInt16LE(0, 6);           // disk with cd
  buf.writeUInt16LE(count, 8);       // entries on this disk
  buf.writeUInt16LE(count, 10);      // total entries
  buf.writeUInt32LE(cdSize, 12);
  buf.writeUInt32LE(cdOffset, 16);
  buf.writeUInt16LE(0, 20);          // comment length
  return buf;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function packageSkill(skillPath, outputDir = null) {
  const resolvedSkillPath = resolve(skillPath);

  if (!existsSync(resolvedSkillPath)) {
    console.error(`❌ Error: Skill folder not found: ${resolvedSkillPath}`);
    return null;
  }

  if (!statSync(resolvedSkillPath).isDirectory()) {
    console.error(`❌ Error: Path is not a directory: ${resolvedSkillPath}`);
    return null;
  }

  if (!existsSync(join(resolvedSkillPath, "SKILL.md"))) {
    console.error(`❌ Error: SKILL.md not found in ${resolvedSkillPath}`);
    return null;
  }

  console.log("🔍 Validating skill...");
  const { valid, message } = validateSkill(resolvedSkillPath);
  if (!valid) {
    console.error(`❌ Validation failed: ${message}`);
    console.error("   Please fix the validation errors before packaging.");
    return null;
  }
  console.log(`✅ ${message}\n`);

  const skillName = basename(resolvedSkillPath);
  const outputPath = outputDir ? resolve(outputDir) : process.cwd();
  if (!existsSync(outputPath)) mkdirSync(outputPath, { recursive: true });

  const skillFilename = join(outputPath, `${skillName}.skill`);

  try {
    await writeZip(resolvedSkillPath, skillFilename);
    console.log(`\n✅ Successfully packaged skill to: ${skillFilename}`);
    return skillFilename;
  } catch (e) {
    console.error(`❌ Error creating .skill file: ${e.message}`);
    return null;
  }
}

// CLI
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const skillPath = process.argv[2];
  const outputDir = process.argv[3] || null;

  if (!skillPath) {
    console.log(
      "Usage: node packageSkill.js <path/to/skill-folder> [output-directory]"
    );
    process.exit(1);
  }

  console.log(`📦 Packaging skill: ${skillPath}`);
  if (outputDir) console.log(`   Output directory: ${outputDir}`);
  console.log();

  packageSkill(skillPath, outputDir).then((result) => {
    process.exit(result ? 0 : 1);
  });
}
