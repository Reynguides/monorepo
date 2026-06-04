/**
 * Manual/dev RAG evaluation CLI — NOT run in CI and intentionally NOT
 * coverage-gated (vitest coverage `include` is `src/**` only). It is a thin
 * wiring shell that exercises a LIVE worker and computes per-item + aggregate
 * metrics using the pure functions in `src/lib/eval-metrics.ts`.
 *
 * IMPORTANT: meaningful evaluation results require a live worker configured
 * with Workers AI embeddings (EMBEDDING_PROVIDER=workers-ai). Against the mock
 * embedding pipeline used in unit tests, retrieval is not semantic and the
 * citation hit-rate will be effectively 0 in mock mode — the CLI still runs
 * and validates the plumbing, but the quality numbers won't reflect real RAG
 * quality. Optionally set LLM_PROVIDER=openrouter for a real LLM answer.
 *
 * Usage:
 *   # Start the worker (remote embeddings + D1):
 *   pnpm exec wrangler dev --remote
 *
 *   # Crawl + index some BG3 wiki pages first:
 *   RAG_BASE_URL=http://127.0.0.1:8787 KB_INGEST_KEY=... pnpm crawl --source bg3-wiki --limit 50
 *
 *   # Run the evaluation:
 *   RAG_BASE_URL=http://127.0.0.1:8787 pnpm eval
 *
 * The JSON report is written to eval/last-report.json (gitignored).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  retrievalHitRate,
  citationScores,
  groundedProxy,
  aggregate,
  type EvalItem,
} from "../src/lib/eval-metrics.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoldenItem {
  id: string;
  question: string;
  expectedUrls: string[];
}

interface RagCitation {
  url: string;
  sourceTier: number | null;
  chunkId: string;
}

interface RagQueryResponse {
  answer: string;
  citations: RagCitation[];
  scores: { relevance: number; confidence: number; freshness: number };
}

interface PerItemReport {
  id: string;
  question: string;
  latencyMs: number;
  citationUrls: string[];
  hitRate: number;
  precision: number;
  recall: number;
  grounded: boolean;
  workerScores: { relevance: number; confidence: number; freshness: number };
  error?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "http://127.0.0.1:8787";
const DEFAULT_TOP_K = 5;
// Resolve paths relative to this file's directory. fileURLToPath correctly
// handles Windows drive letters AND percent-encoded segments (e.g. a space in
// the repo path becomes %20 in import.meta.url, which a raw URL.pathname leaves
// encoded and fs cannot open).
const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = path.join(EVAL_DIR, "golden.json");
const REPORT_PATH = path.join(EVAL_DIR, "last-report.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnvOrDefault(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function loadGolden(): GoldenItem[] {
  const raw = fs.readFileSync(GOLDEN_PATH, "utf8");
  return JSON.parse(raw) as GoldenItem[];
}

async function queryWorker(
  baseUrl: string,
  question: string,
  topK: number,
): Promise<{ response: RagQueryResponse; latencyMs: number }> {
  const start = Date.now();
  const res = await fetch(new URL("/v1/rag/query", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, topK }),
  });
  const latencyMs = Date.now() - start;
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Worker returned HTTP ${String(res.status)} for question: ${question}`);
  }
  const json: unknown = await res.json();
  const response = json as RagQueryResponse;
  return { response, latencyMs };
}

function formatTable(rows: PerItemReport[]): string {
  const header = ["id", "hitRate", "prec", "recall", "grounded", "latMs", "error"].join("\t");
  const divider = "-".repeat(80);
  const lines = rows.map((r) =>
    [
      r.id,
      r.hitRate.toFixed(2),
      r.precision.toFixed(2),
      r.recall.toFixed(2),
      r.grounded ? "yes" : "no",
      String(r.latencyMs),
      r.error ?? "",
    ].join("\t"),
  );
  return [divider, header, divider, ...lines, divider].join("\n");
}

function formatAggregate(agg: ReturnType<typeof aggregate>): string {
  return [
    `n              : ${String(agg.n)}`,
    `mean hit-rate  : ${agg.meanHitRate.toFixed(3)}`,
    `mean precision : ${agg.meanPrecision.toFixed(3)}`,
    `mean recall    : ${agg.meanRecall.toFixed(3)}`,
    `grounded rate  : ${agg.groundedRate.toFixed(3)}`,
    `p50 latency    : ${String(agg.p50LatencyMs)} ms`,
    `p95 latency    : ${String(agg.p95LatencyMs)} ms`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Per-item evaluation
// ---------------------------------------------------------------------------

async function evalItem(
  baseUrl: string,
  topK: number,
  item: GoldenItem,
): Promise<{ report: PerItemReport; evalItem: EvalItem }> {
  try {
    const { response, latencyMs } = await queryWorker(baseUrl, item.question, topK);
    const citationUrls = response.citations.map((c) => c.url);
    const hitRate = retrievalHitRate(item.expectedUrls, citationUrls);
    const { precision, recall } = citationScores(item.expectedUrls, citationUrls);
    const grounded = groundedProxy(response.answer, response.citations.length);
    return {
      report: {
        id: item.id,
        question: item.question,
        latencyMs,
        citationUrls,
        hitRate,
        precision,
        recall,
        grounded,
        workerScores: response.scores,
      },
      evalItem: { hitRate, precision, recall, grounded, latencyMs },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    process.stderr.write(`  ERROR: ${error}\n`);
    return {
      report: {
        id: item.id,
        question: item.question,
        latencyMs: 0,
        citationUrls: [],
        hitRate: 0,
        precision: 0,
        recall: 0,
        grounded: false,
        workerScores: { relevance: 0, confidence: 0, freshness: 0 },
        error,
      },
      evalItem: { hitRate: 0, precision: 0, recall: 0, grounded: false, latencyMs: 0 },
    };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const baseUrl = requireEnvOrDefault("RAG_BASE_URL", DEFAULT_BASE_URL);
  const topK = DEFAULT_TOP_K;

  process.stdout.write(`RAG eval — base URL: ${baseUrl}\n`);
  process.stdout.write(`Loading golden set from: ${GOLDEN_PATH}\n\n`);

  const golden = loadGolden();
  const perItemReports: PerItemReport[] = [];
  const evalItems: EvalItem[] = [];

  for (const item of golden) {
    process.stdout.write(`[${item.id}] ${item.question.slice(0, 60)}...\n`);
    const result = await evalItem(baseUrl, topK, item);
    perItemReports.push(result.report);
    evalItems.push(result.evalItem);
  }

  const agg = aggregate(evalItems);

  process.stdout.write("\n--- Per-item results ---\n");
  process.stdout.write(formatTable(perItemReports) + "\n\n");
  process.stdout.write("--- Aggregate ---\n");
  process.stdout.write(formatAggregate(agg) + "\n\n");

  const reportPayload = {
    runAt: new Date().toISOString(),
    baseUrl,
    topK,
    perItem: perItemReports,
    aggregate: agg,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(reportPayload, null, 2) + "\n");
  process.stdout.write(`Report written to: ${REPORT_PATH}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
