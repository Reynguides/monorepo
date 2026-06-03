# ADR-0015: Crawl/sourcing & licensing policy for the BG3 knowledge base

- **Status**: Accepted — 2026-06-03
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

The KB is built by crawling BG3 wiki/guide sources, storing their HTML + images, and serving extracted content with citations. Source licensing varies sharply (verified against live `robots.txt` / ToS / licence pages):

- **bg3.wiki** (independent community wiki) — dual CC-BY-SA 4.0 / CC-BY-NC-SA 4.0, clean `robots.txt`, sitemap; content before 2024-07-20 is NonCommercial-only.
- **Fextralife** (Valnet) — ToS **explicitly prohibits** crawling, scraping, data-mining, and AI use; bans image republishing; GPTBot blocked site-wide.
- **Community guide sites** (Steam guides, GamerGuides, …) — third-party-owned, **no redistribution grant**; some signal `ai-train=no`.
- All BG3 lore/art is additionally subject to the **Larian/WotC Fan Content policies**, which are **non-commercial**.

## Decision

For **this PoC**, whose KB is throwaway/experimental ("AI slop") data, crawl **BG3 Wiki, Fextralife, community guides, and any other useful sources**. The owner has **explicitly accepted the ToS/licensing risk** (notably Fextralife's anti-scraping ToS and the broader project's commercial intent). The crawler still **respects `robots.txt`, rate-limits, and records attribution** for every stored page so answers can cite sources. Source-tier ranking (authoritative > community) feeds retrieval scoring.

**If this PoC is ever productized**, this ADR must be superseded: drop Fextralife, restrict stored/redistributed content to bg3.wiki CC-BY-SA (post-2024-07-20) with ShareAlike compliance, treat guide sites as **cite-by-link only**, and exclude game screenshots/art (Fan Content policy is non-commercial).

## Consequences

**Positive**
- Broadest possible coverage for evaluating RAG quality in the PoC.

**Negative**
- **Known, accepted legal risk**: crawling Fextralife violates its ToS; redistributing third-party content has no licence. Acceptable only because this is non-shipping experimental data.

**Neutral**
- `robots.txt`, rate-limiting, and attribution are honoured regardless — good hygiene and the basis for citations.

## Alternatives considered

- **bg3.wiki only.** Safest; kept as the productization path, but too narrow for PoC breadth right now.
- **Cite-by-link only (store nothing).** Rejected for the PoC — too thin to exercise a real retrieval/answer pipeline.

## Verification

- Crawler honours `robots.txt` disallow rules and a per-host rate limit (unit-tested with mocked fetch).
- Every stored page carries `source_id` + `url` + crawl timestamp; citations resolve back to the origin URL.

## References

- bg3.wiki licensing: <https://bg3.wiki/wiki/bg3wiki:Licensing>
- Fextralife/Valnet Terms of Use: <https://www.valnetinc.com/en/terms-of-use>
- [[adr-0014-shared-global-bg3-corpus-ingestion-key]] — corpus model these sources populate.
