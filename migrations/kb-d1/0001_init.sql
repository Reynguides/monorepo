-- Reyn Knowledge Base — initial schema (ADR-0017, ADR-0019).
-- Conventions: snake_case; TEXT UUID primary keys; INTEGER epoch-ms timestamps;
-- IF NOT EXISTS everywhere; UNIQUE indexes for dedup identity. Foreign keys are
-- documented but NOT DB-enforced — the application layer is the integrity
-- boundary (D1 does not enable PRAGMA foreign_keys), matching the sibling
-- workers. BG3-only: there is no game_id dimension.

-- Crawl-source catalog. `tier` ranks authoritativeness (1 = most authoritative);
-- it feeds rules-conflict resolution and retrieval ranking. `license` is kept
-- for attribution.
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  tier INTEGER NOT NULL,
  license TEXT,
  created_at INTEGER NOT NULL
);

-- Pages are first-class, structured entities (not flat blobs). Identity is
-- UNIQUE(source_id, url); `content_hash` is a change-detector, not identity.
-- `tags` is a JSON array (queryable via D1's json1). `lifecycle` + `version`
-- track supersede/deprecation; r2_raw_key/r2_md_key point at the stored bytes.
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  url TEXT NOT NULL,
  canonical_url TEXT,
  title TEXT,
  page_type TEXT NOT NULL DEFAULT 'article',
  summary TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  language TEXT NOT NULL DEFAULT 'en',
  attribution TEXT,
  content_hash TEXT NOT NULL,
  r2_raw_key TEXT,
  r2_md_key TEXT,
  lifecycle TEXT NOT NULL DEFAULT 'active',
  version INTEGER NOT NULL DEFAULT 1,
  crawled_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS pages_source_url_idx ON pages (source_id, url);
CREATE INDEX IF NOT EXISTS pages_content_hash_idx ON pages (content_hash);
CREATE INDEX IF NOT EXISTS pages_type_idx ON pages (page_type);
CREATE INDEX IF NOT EXISTS pages_lifecycle_idx ON pages (lifecycle);
CREATE INDEX IF NOT EXISTS pages_canonical_idx ON pages (canonical_url);

-- First-class heading hierarchy extracted from a page. `heading_path` is the
-- breadcrumb (e.g. "Wizard > Spellcasting > Cantrips"); `anchor` is the page
-- fragment id. Chunks reference their section for provenance.
CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  level INTEGER NOT NULL,
  heading TEXT NOT NULL,
  anchor TEXT,
  heading_path TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sections_page_ord_idx ON sections (page_id, ord);
CREATE INDEX IF NOT EXISTS sections_page_idx ON sections (page_id);

-- Typed relationships between pages — the dependency graph the prior KB lacked.
-- A directed edge from src_page_id to either a resolved dst_page_id or an
-- unresolved dst_url. `edge_type` taxonomy (ADR-0019): link | see_also |
-- prerequisite | part_of | entity_mention | supersedes. `weight` is extraction
-- confidence/strength; `evidence` is the anchor text / rule clause that justified it.
CREATE TABLE IF NOT EXISTS page_edges (
  id TEXT PRIMARY KEY,
  src_page_id TEXT NOT NULL,
  dst_page_id TEXT,
  dst_url TEXT,
  edge_type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  evidence TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS edges_unique_idx ON page_edges (src_page_id, dst_url, edge_type);
CREATE INDEX IF NOT EXISTS edges_src_idx ON page_edges (src_page_id, edge_type);
CREATE INDEX IF NOT EXISTS edges_dst_idx ON page_edges (dst_page_id, edge_type);

-- Named BG3 things (classes, spells, items, ...). Powers entity_mention edges
-- and typed filters. `normalized` is the lookup key (lowercased, de-articled).
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized TEXT NOT NULL,
  canonical_page_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS entities_norm_kind_idx ON entities (normalized, kind);

-- Explicit, table-driven rules (ADR-0020). Rules are DATA applied by a code
-- engine; auditable + tunable without a redeploy. `params` is JSON, Zod-validated
-- per `kind` at load time. `phase`: normalize | validate | dedup | conflict.
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  phase TEXT NOT NULL,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all',
  params TEXT NOT NULL DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'error',
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rules_phase_idx ON rules (phase, enabled, priority);

-- Durable audit trail of rule outcomes per page (pass | fail | warn | applied | skipped).
CREATE TABLE IF NOT EXISTS rule_events (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rule_events_page_idx ON rule_events (page_id, created_at);

-- Retrievable text slices. `id` doubles as the Vectorize vector id ("{pageId}:{ord}").
-- `heading_path` is embedded as a prefix into the text sent to the embedder and
-- also stored for display/citation. Deleted + rebuilt when a page supersedes.
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  section_id TEXT,
  ord INTEGER NOT NULL,
  heading_path TEXT,
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  token_count INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS chunks_page_ord_idx ON chunks (page_id, ord);
CREATE INDEX IF NOT EXISTS chunks_page_idx ON chunks (page_id);
CREATE INDEX IF NOT EXISTS chunks_section_idx ON chunks (section_id);

-- Images are stored AND made retrievable (linked to chunks via chunk_images).
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  section_id TEXT,
  url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  alt_text TEXT,
  width INTEGER,
  height INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS images_page_url_idx ON images (page_id, url);

CREATE TABLE IF NOT EXISTS chunk_images (
  chunk_id TEXT NOT NULL,
  image_id TEXT NOT NULL,
  PRIMARY KEY (chunk_id, image_id)
);

-- Authoritative chunk -> vector_id ledger (Vectorize has no scan API). The
-- `model` + `namespace` columns support reconciliation and reproducible supersede.
CREATE TABLE IF NOT EXISTS embedding_state (
  chunk_id TEXT NOT NULL,
  model TEXT NOT NULL,
  vector_id TEXT NOT NULL,
  namespace TEXT,
  indexed_at INTEGER NOT NULL,
  PRIMARY KEY (chunk_id, model)
);

-- D1 FTS5 keyword index over chunk text (BM25). External-content table mirrors
-- `chunks` and is kept in sync by the triggers below; ranked with bm25() at query
-- time (ADR-0023). NOTE: FTS5 virtual tables are excluded from D1 `export`; R2 +
-- embedding_state are the source of truth, so the index is recreate-on-restore.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text,
  heading_path,
  content = 'chunks',
  content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts (rowid, text, heading_path) VALUES (new.rowid, new.text, new.heading_path);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, text, heading_path)
  VALUES ('delete', old.rowid, old.text, old.heading_path);
END;
CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, text, heading_path)
  VALUES ('delete', old.rowid, old.text, old.heading_path);
  INSERT INTO chunks_fts (rowid, text, heading_path) VALUES (new.rowid, new.text, new.heading_path);
END;
