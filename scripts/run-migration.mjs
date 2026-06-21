import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync } from "fs";
import { basename, join, resolve } from "path";
import { spawnSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadLocalEnv } from "./env-loader.mjs";

const MIGRATIONS_DIR = "supabase/migrations";
const LEDGER_TABLE = "public.codex_migrations";
const DEFAULT_RPC_NAMES = ["exec_sql", "execute_sql", "run_sql"];

loadLocalEnv();

const args = process.argv.slice(2);
const options = {
  dryRun: args.includes("--dry-run"),
  force: args.includes("--force"),
  markApplied: args.includes("--mark-applied"),
  all: args.includes("--all")
};
const requestedFiles = args.filter((arg) => !arg.startsWith("--"));

const { url } = getSupabaseEnv();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const projectRef = new URL(url).hostname.split(".")[0];
const serviceSupabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function usage() {
  console.log(`
Usage:
  npm run migrate                         Apply pending files in supabase/migrations
  npm run migrate -- 0012_name.sql        Apply one migration by filename
  npm run migrate -- --force 0012_name.sql
  npm run migrate -- --mark-applied       Mark existing migrations as applied without executing
  npm run migrate -- --dry-run            Show what would run

Execution backends, checked in order:
  1. SUPABASE_DB_URL or DATABASE_URL with local psql
  2. SUPABASE_ACCESS_TOKEN via Supabase Management API /database/query
  3. Service-role RPC named exec_sql, execute_sql, or run_sql
`);
}

if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function checksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeMigrationPath(file) {
  if (file.includes("/") || file.endsWith(".sql")) {
    const direct = file.includes("/") ? resolve(file) : resolve(MIGRATIONS_DIR, file);
    if (existsSync(direct)) return direct;
  }

  const match = readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith(".sql"))
    .find((entry) => entry === file || entry.startsWith(file));

  if (!match) throw new Error(`Migration not found: ${file}`);
  return resolve(MIGRATIONS_DIR, match);
}

function listMigrationFiles() {
  if (requestedFiles.length) return requestedFiles.map(normalizeMigrationPath);

  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()
    .map((entry) => resolve(MIGRATIONS_DIR, entry));
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      return extractRows(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function stripTrailingSemicolon(sql) {
  return sql.trim().replace(/;+\s*$/, "");
}

function ensurePsqlAvailable() {
  const check = spawnSync("psql", ["--version"], { encoding: "utf8" });
  return check.status === 0;
}

function createPsqlRunner(connectionString) {
  if (!ensurePsqlAvailable()) return null;

  function run(sql) {
    const result = spawnSync("psql", [connectionString, "-X", "-v", "ON_ERROR_STOP=1", "-q"], {
      input: sql,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20
    });

    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || "psql failed").trim());
    }
  }

  function query(sql) {
    const wrapped = `select coalesce(json_agg(row_to_json(q)), '[]'::json) from (${stripTrailingSemicolon(sql)}) q;`;
    const result = spawnSync("psql", [connectionString, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", wrapped], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20
    });

    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || "psql query failed").trim());
    }

    return JSON.parse(result.stdout.trim() || "[]");
  }

  return { name: "psql", run, query };
}

function createManagementApiRunner(accessToken) {
  if (!accessToken) return null;
  const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  async function request(sql) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: sql })
    });

    const text = await response.text();
    let payload = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      // Keep text for the error below.
    }

    if (!response.ok) {
      const message = typeof payload === "object" && payload?.message ? payload.message : text;
      throw new Error(`Supabase Management API ${response.status}: ${message}`);
    }

    return payload;
  }

  return {
    name: "supabase-management-api",
    run: async (sql) => {
      await request(sql);
    },
    query: async (sql) => extractRows(await request(sql))
  };
}

function createRpcRunner() {
  const rpcNames = (process.env.SUPABASE_SQL_RPC || DEFAULT_RPC_NAMES.join(","))
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  async function callRpc(sql) {
    const errors = [];

    for (const rpcName of rpcNames) {
      for (const payload of [{ sql }, { query: sql }]) {
        const { data, error } = await serviceSupabase.rpc(rpcName, payload);
        if (!error) return { rpcName, data };
        errors.push(`${rpcName}: ${error.message}`);
        if (error.code === "PGRST202" || error.code === "PGRST204") break;
      }
    }

    throw new Error(errors.join("\n"));
  }

  return {
    name: `supabase-rpc(${rpcNames.join("|")})`,
    run: async (sql) => {
      await callRpc(sql);
    },
    query: async (sql) => {
      const { data } = await callRpc(sql);
      return extractRows(data);
    }
  };
}

function createRunner() {
  const directUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  const psqlRunner = directUrl ? createPsqlRunner(directUrl) : null;
  if (psqlRunner) return psqlRunner;

  const managementRunner = createManagementApiRunner(process.env.SUPABASE_ACCESS_TOKEN);
  if (managementRunner) return managementRunner;

  return createRpcRunner();
}

const runner = createRunner();

async function ensureLedger() {
  await runner.run(`
    create table if not exists ${LEDGER_TABLE} (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now(),
      runner text not null default 'codex'
    );
    notify pgrst, 'reload schema';
  `);
}

async function getAppliedMigrations() {
  try {
    const rows = await runner.query(`select filename, checksum from ${LEDGER_TABLE}`);
    return new Map(rows.map((row) => [row.filename, row.checksum]));
  } catch {
    return new Map();
  }
}

async function markMigration(filename, hash) {
  await runner.run(`
    insert into ${LEDGER_TABLE} (filename, checksum, runner)
    values (${sqlLiteral(filename)}, ${sqlLiteral(hash)}, ${sqlLiteral(runner.name)})
    on conflict (filename) do update
      set checksum = excluded.checksum,
          applied_at = now(),
          runner = excluded.runner;
  `);
}

async function runMigration(filePath, hash) {
  const filename = basename(filePath);
  const sql = readFileSync(filePath, "utf8");

  await runner.run(`
    begin;
    ${sql}
    insert into ${LEDGER_TABLE} (filename, checksum, runner)
    values (${sqlLiteral(filename)}, ${sqlLiteral(hash)}, ${sqlLiteral(runner.name)})
    on conflict (filename) do update
      set checksum = excluded.checksum,
          applied_at = now(),
          runner = excluded.runner;
    commit;
  `);
}

async function main() {
  const files = listMigrationFiles();
  const migrations = files.map((filePath) => {
    const content = readFileSync(filePath, "utf8");
    return { filePath, filename: basename(filePath), hash: checksum(content) };
  });

  if (!migrations.length) {
    console.log(`No migration files found in ${MIGRATIONS_DIR}.`);
    return;
  }

  if (options.dryRun) {
    console.log(`Migration runner: ${runner.name}`);
    for (const migration of migrations) console.log(`Would inspect/apply ${migration.filename}`);
    return;
  }

  console.log(`Migration runner: ${runner.name}`);
  await ensureLedger();
  const applied = await getAppliedMigrations();

  for (const migration of migrations) {
    const previousHash = applied.get(migration.filename);
    const shouldSkip = previousHash === migration.hash && !options.force && !options.markApplied;

    if (shouldSkip) {
      console.log(`Skip ${migration.filename}: already applied.`);
      continue;
    }

    if (options.markApplied) {
      await markMigration(migration.filename, migration.hash);
      console.log(`Marked ${migration.filename} as applied.`);
      continue;
    }

    console.log(`${previousHash && previousHash !== migration.hash ? "Re-apply changed" : "Apply"} ${migration.filename}`);
    await runMigration(migration.filePath, migration.hash);
  }

  console.log("Migrations complete.");
}

main().catch((error) => {
  console.error("Migration failed.");
  console.error(error instanceof Error ? error.message : error);
  console.error("\nNo SQL was sent to the browser. Add SUPABASE_ACCESS_TOKEN or SUPABASE_DB_URL if the project does not expose a service-role SQL RPC.");
  process.exit(1);
});
