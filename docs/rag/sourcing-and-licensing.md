# Sourcing and licensing

This document records the per-source licensing posture for the BG3 knowledge
base, as required by [[ADR-0015]]. **Read before crawling any source or
productizing this PoC.**

## Sources crawled in PoC 2

### bg3.wiki (BG3 Wiki)

An independent community wiki at <https://bg3.wiki>.

- **License**: dual CC-BY-SA 4.0 / CC-BY-NC-SA 4.0. Content contributed
  before 2024-07-20 is NonCommercial only (CC-BY-NC-SA 4.0). Content from
  2024-07-20 onward is CC-BY-SA 4.0.
- **robots.txt**: clean; no broad disallow for crawlers.
- **Sitemap**: available; the crawler fetches it for URL enumeration.
- **Posture**: the cleanest source in the corpus. CC-BY-SA content
  (post-2024-07-20) is usable under ShareAlike conditions.

### Fextralife

Community guides at <https://baldursgate3.wiki.fextralife.com> (operated by Valnet Inc.).

- **License**: proprietary; no redistribution grant.
- **robots.txt**: `GPTBot` blocked site-wide; scraping and data-mining
  are **explicitly prohibited** in the Valnet Terms of Use.
- **Posture for this PoC**: the owner has **explicitly accepted the ToS
  and licensing risk**. This is a throwaway experimental corpus; the data
  is never redistributed publicly. Fextralife is included because it
  covers topics bg3.wiki does not yet catalogue.
- **Productization requirement**: **drop Fextralife entirely**. See the
  productization section below.

### Community guide sites (Steam guides, GamerGuides, and similar)

Third-party hosted guides with varied ownership.

- **License**: third-party-owned; no redistribution grant. Some signal
  `ai-train=no` in their robots meta.
- **Posture for this PoC**: owner-accepted risk, same as Fextralife.
  Attribution is recorded per stored page so answers cite the origin URL.
- **Productization requirement**: treat as **cite-by-link only** — do not
  store or redistribute content. Surface the URL in citations only.

### BG3 lore, art, and game screenshots

All Baldur's Gate 3 lore, art, and in-game screenshots are additionally
subject to the Larian/WotC Fan Content policies, which permit
**non-commercial fan use only**. Game art is never stored in the corpus.
The image store (`POST /v1/kb/images`) is intended for wiki-sourced
informational illustrations, not redistributed game art.

## Crawler behaviour

Regardless of source licensing posture, the crawler always:

- Respects `robots.txt` disallow rules (tested and enforced in
  `src/crawl/robots.ts`).
- Rate-limits per host (`src/crawl/rate-limit.ts`) to avoid abusive traffic.
- Records `source_id`, `url`, and crawl timestamp for every stored page so
  answers can cite back to the origin URL.
- Ranks sources by `tier` (lower = more authoritative) so higher-quality
  sources win during retrieval re-ranking.

## Productization requirements

If this PoC is ever productized (public deployment, commercial use, or
redistribution of corpus content), this ADR **must be superseded** with a
new licensing review. Required changes:

1. **Drop Fextralife** entirely. Its ToS prohibits all forms of crawling,
   scraping, and AI use.
2. **Restrict stored content to bg3.wiki CC-BY-SA (post-2024-07-20).**
   Comply with ShareAlike: any redistributed derivative work must carry
   the same CC-BY-SA 4.0 license and attribution.
3. **Treat community guides as cite-by-link only.** Do not store or
   redistribute their content; surface the URL in citations only.
4. **Exclude game art and screenshots** under the Larian / WotC Fan Content
   non-commercial policy.
5. Conduct a fresh `robots.txt` review for any new source before crawling.

## References

- bg3.wiki licensing: <https://bg3.wiki/wiki/bg3wiki:Licensing>
- Valnet (Fextralife) Terms of Use: <https://www.valnetinc.com/en/terms-of-use>
- [[ADR-0015]] — the decision record this document expands on.
- [[ADR-0014]] — corpus model (shared global, no user isolation).
