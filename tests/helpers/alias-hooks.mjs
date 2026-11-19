// Test-only resolve hook: maps the tsconfig "@/..." alias to the repo root and
// adds the ".ts"/".tsx"/"/index.ts" extensions that the Next bundler resolves implicitly.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXTS = [".ts", ".tsx", "/index.ts", "/index.tsx", ".js", ".mjs"];

function tryFile(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTS) if (existsSync(base + ext)) return base + ext;
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let candidate = null;
  if (specifier.startsWith("@/")) {
    candidate = tryFile(path.join(ROOT, specifier.slice(2)));
  } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const parent = fileURLToPath(context.parentURL);
    if (!parent.includes(`${path.sep}node_modules${path.sep}`)) {
      candidate = tryFile(path.resolve(path.dirname(parent), specifier));
    }
  }
  if (candidate) return nextResolve(pathToFileURL(candidate).href, context);
  // Next's bare subpaths ("next/server", "next/cache", ...) have no exports map and need ".js".
  if (/^next\/[a-z-]+$/.test(specifier)) {
    return nextResolve(`${specifier}.js`, context);
  }
  return nextResolve(specifier, context);
}
