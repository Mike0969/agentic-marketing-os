// In-memory stand-in for the subset of the supabase-js query builder this app uses.
// Tables are plain arrays of rows; `unique` lists column sets that raise 23505 like Postgres.
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

export type FakeDbOptions = {
  tables?: Record<string, Row[]>;
  unique?: Record<string, string[][]>;
  /** Force an error for an operation on a table, e.g. { "content_items:update": "boom" }. */
  failOn?: Record<string, string>;
};

export class FakeSupabase {
  tables: Record<string, Row[]>;
  unique: Record<string, string[][]>;
  failOn: Record<string, string>;
  log: Array<{ table: string; op: string; payload?: unknown }> = [];

  constructor(opts: FakeDbOptions = {}) {
    this.tables = structuredClone(opts.tables ?? {});
    this.unique = opts.unique ?? {};
    this.failOn = opts.failOn ?? {};
  }

  from(table: string) {
    this.tables[table] ??= [];
    return new Query(this, table);
  }

  rows(table: string) {
    return this.tables[table] ?? [];
  }
}

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row[] | Row | null = null;
  private onConflict: string[] | null = null;
  private returning = false;
  private mode: "many" | "single" | "maybeSingle" = "many";
  private limitN: number | null = null;
  private orderBy: { col: string; asc: boolean } | null = null;
  private countMode = false;
  private headOnly = false;

  private db: FakeSupabase;
  private table: string;

  constructor(db: FakeSupabase, table: string) {
    this.db = db;
    this.table = table;
  }

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.op = "select";
    else this.returning = true;
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = rows;
    this.onConflict = opts?.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : ["id"];
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => (r[col] ?? null) === v);
    return this;
  }
  not(col: string, op: string, v: unknown) {
    this.filters.push((r) => (op === "is" ? (r[col] ?? null) !== v : r[col] !== v));
    return this;
  }
  lte(col: string, v: string | number) {
    this.filters.push((r) => r[col] != null && (r[col] as string | number) <= v);
    return this;
  }
  lt(col: string, v: string | number) {
    this.filters.push((r) => r[col] != null && (r[col] as string | number) < v);
    return this;
  }
  gte(col: string, v: string | number) {
    this.filters.push((r) => r[col] != null && (r[col] as string | number) >= v);
    return this;
  }
  gt(col: string, v: string | number) {
    this.filters.push((r) => r[col] != null && (r[col] as string | number) > v);
    return this;
  }
  ilike(col: string, pattern: string) {
    const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i");
    this.filters.push((r) => typeof r[col] === "string" && re.test(r[col] as string));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, err?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve()
      .then(() => this.run())
      .then(ok, err);
  }

  private matches() {
    return this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private violates(row: Row, ignore?: Row) {
    for (const cols of this.db.unique[this.table] ?? []) {
      const clash = this.db.rows(this.table).find((r) => r !== ignore && cols.every((c) => r[c] !== undefined && r[c] === row[c]));
      if (clash) return true;
    }
    return false;
  }

  private shape(rows: Row[]): Result {
    const copy = structuredClone(rows);
    if (this.mode === "many") return { data: this.headOnly ? null : copy, error: null, count: this.countMode ? copy.length : null };
    if (copy.length === 0) return this.mode === "single" ? { data: null, error: { message: "no rows", code: "PGRST116" } } : { data: null, error: null };
    if (copy.length > 1) return { data: null, error: { message: "multiple rows", code: "PGRST116" } };
    return { data: copy[0], error: null };
  }

  private run(): Result {
    const failure = this.db.failOn[`${this.table}:${this.op}`];
    this.db.log.push({ table: this.table, op: this.op, payload: this.payload ?? undefined });
    if (failure) return { data: null, error: { message: failure } };
    const now = new Date().toISOString();

    if (this.op === "select") {
      let rows = this.matches();
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        rows = [...rows].sort((a, b) => ((a[col] as string) < (b[col] as string) ? -1 : (a[col] as string) > (b[col] as string) ? 1 : 0) * (asc ? 1 : -1));
      }
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      return this.shape(rows);
    }

    if (this.op === "insert") {
      const input = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const created: Row[] = [];
      for (const raw of input) {
        const row = { id: randomUUID(), created_at: now, ...structuredClone(raw) };
        if (this.violates(row)) return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        this.db.rows(this.table).push(row);
        created.push(row);
      }
      return this.returning ? this.shape(created) : { data: null, error: null };
    }

    if (this.op === "upsert") {
      const input = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const out: Row[] = [];
      for (const raw of input) {
        const existing = this.db.rows(this.table).find((r) => this.onConflict!.every((c) => r[c] === raw[c]));
        if (existing) {
          Object.assign(existing, structuredClone(raw));
          out.push(existing);
        } else {
          const row = { id: randomUUID(), created_at: now, ...structuredClone(raw) };
          this.db.rows(this.table).push(row);
          out.push(row);
        }
      }
      return this.returning ? this.shape(out) : { data: null, error: null };
    }

    if (this.op === "update") {
      const rows = this.matches();
      for (const r of rows) {
        const next = { ...r, ...structuredClone(this.payload as Row) };
        if (this.violates(next, r)) return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        Object.assign(r, structuredClone(this.payload as Row));
      }
      return this.returning ? this.shape(rows) : { data: null, error: null };
    }

    // delete
    const doomed = new Set(this.matches());
    this.db.tables[this.table] = this.db.rows(this.table).filter((r) => !doomed.has(r));
    return this.returning ? this.shape([...doomed]) : { data: null, error: null };
  }
}

/** A fetch stand-in that records calls and answers from a handler; never touches the network. */
export function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit; body: unknown }> = [];
  const fn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: unknown = init.body;
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, init, body });
    return handler(url, init);
  };
  return { fn: fn as typeof fetch, calls };
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
