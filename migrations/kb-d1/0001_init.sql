-- Reyn knowledge-base D1 (`reyn_kb`) — initial schema.
-- Bookkeeping for the RAG ingestion pipeline: crawled sources, pages, images,
-- text chunks, crawl progress, and per-chunk embedding state. Raw/markdown
-- bytes live in R2 (referenced by r2_* keys); vectors live in Vectorize
-- (referenced by embedding_state.vector_id).
--
-- Conventions (mirrors migrations/user-d1): snake_case columns, TEXT uuid PKs,
-- INTEGER epoch-ms timestamps, IF NOT EXISTS, UNIQUE indexes for dedup.

-- A crawl source (a documentation site / wiki). Tier ranks authoritativeness.
CREATE TABLE IF NOT EXISTS sources (
    id         TEXT PRIMARY KEY,            -- uuid
    name       TEXT NOT NULL,
    base_url   TEXT NOT NULL,
    tier       INTEGER NOT NULL,            -- 1 = most authoritative
    created_at INTEGER NOT NULL             -- epoch ms
);

-- A crawled page. content_hash detects unchanged pages across re-crawls.
CREATE TABLE IF NOT EXISTS pages (
    id           TEXT PRIMARY KEY,          -- uuid
    source_id    TEXT NOT NULL,
    url          TEXT NOT NULL,
    title        TEXT,
    content_hash TEXT NOT NULL,             -- sha256 hex of normalised content
    r2_raw_key   TEXT,                      -- R2 key for raw HTML, when stored
    r2_md_key    TEXT,                      -- R2 key for normalised markdown
    crawled_at   INTEGER NOT NULL,          -- epoch ms (first crawl)
    updated_at   INTEGER NOT NULL           -- epoch ms (last content change)
);

CREATE UNIQUE INDEX IF NOT EXISTS pages_source_url_idx ON pages(source_id, url);
CREATE INDEX IF NOT EXISTS pages_content_hash_idx ON pages(content_hash);

-- Images referenced by a page, stored in R2 and deduped per (page, url).
CREATE TABLE IF NOT EXISTS images (
    id           TEXT PRIMARY KEY,          -- uuid
    page_id      TEXT NOT NULL,
    url          TEXT NOT NULL,
    content_hash TEXT NOT NULL,             -- sha256 hex of image bytes
    r2_key       TEXT NOT NULL,             -- R2 key for the stored image
    alt_text     TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS images_page_url_idx ON images(page_id, url);

-- A retrievable text chunk derived from a page, in reading order (ord).
CREATE TABLE IF NOT EXISTS chunks (
    id           TEXT PRIMARY KEY,          -- uuid (== Vectorize vector id)
    page_id      TEXT NOT NULL,
    ord          INTEGER NOT NULL,          -- 0-based position within the page
    text         TEXT NOT NULL,
    content_hash TEXT NOT NULL,             -- sha256 hex of chunk text
    token_count  INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS chunks_page_ord_idx ON chunks(page_id, ord);
CREATE INDEX IF NOT EXISTS chunks_page_idx ON chunks(page_id);

-- Per-source crawl progress so re-crawls resume rather than restart.
CREATE TABLE IF NOT EXISTS crawl_state (
    source_id        TEXT PRIMARY KEY,
    last_sitemap_at  INTEGER,              -- epoch ms of last sitemap fetch
    cursor           TEXT,                 -- opaque resume cursor
    status           TEXT NOT NULL         -- e.g. "idle" | "crawling" | "error"
);

-- Tracks which chunks have been embedded into which model's index.
CREATE TABLE IF NOT EXISTS embedding_state (
    chunk_id   TEXT NOT NULL,
    model      TEXT NOT NULL,              -- e.g. "@cf/baai/bge-base-en-v1.5"
    vector_id  TEXT NOT NULL,              -- id of the vector in Vectorize
    indexed_at INTEGER NOT NULL,           -- epoch ms
    PRIMARY KEY (chunk_id, model)
);
