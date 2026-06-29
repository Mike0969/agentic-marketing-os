import { constants } from "fs";
import { access, copyFile, mkdir, readdir, readFile, stat } from "fs/promises";
import path from "path";
import process from "process";

const repoRoot = process.cwd();
const sourceRoot = path.join(repoRoot, "hermes-brain");
const targetRoot =
  process.env.HERMES_WRITABLE_BRAIN_PATH ||
  process.env.HERMES_LOCAL_BRAIN_PATH ||
  "/Users/dubai/.hermes/profiles/buddy/resources/agentic-marketing-os-brain";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const secretPatterns = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /(?:OPENAI|ANTHROPIC|DEEPSEEK|SUPABASE|TELEGRAM|SLACK|HERMES)[A-Z0-9_]*(?:KEY|TOKEN|SECRET)/i,
  /SERVICE_ROLE/i,
  /Bearer\s+[A-Za-z0-9._-]{16,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/
];

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function listMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listMarkdownFiles(fullPath);
      files.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function scanForSecrets(files) {
  const findings = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (secretPatterns.some((pattern) => pattern.test(line))) {
        findings.push(`${path.relative(repoRoot, file)}:${index + 1}`);
      }
    });
  }
  return findings;
}

if (!(await exists(sourceRoot))) {
  console.error(`Hermes brain source not found: ${sourceRoot}`);
  process.exit(1);
}

const sourceInfo = await stat(sourceRoot);
if (!sourceInfo.isDirectory()) {
  console.error(`Hermes brain source is not a directory: ${sourceRoot}`);
  process.exit(1);
}

const files = await listMarkdownFiles(sourceRoot);
const findings = await scanForSecrets(files);
if (findings.length) {
  console.error("Refusing to sync hermes-brain because possible secrets were found:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

if (checkOnly) {
  console.log(`Hermes brain check OK: ${files.length} markdown files, no obvious secrets.`);
  process.exit(0);
}

await mkdir(targetRoot, { recursive: true });

for (const file of files) {
  const relativePath = path.relative(sourceRoot, file);
  const target = path.join(targetRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(file, target);
}

console.log(`Synced ${files.length} Hermes brain markdown files to ${targetRoot}`);
