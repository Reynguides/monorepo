/**
 * HTML content extraction via the workerd-native HTMLRewriter (ADR-0018) — a
 * real streaming parser, not the prior regex cleaner. A single `*` handler drives
 * a small state machine that captures: the document title; the heading hierarchy
 * (h1–h6) as sections with a breadcrumb `headingPath`; text blocks (p/li/td/…)
 * tagged with their section's path (the chunker input); in-content links (for
 * relationship edges); and images. Boilerplate (script/style/nav/footer/aside/…)
 * is dropped. Runs in the Workers runtime AND in vitest-pool-workers, so it is
 * unit-tested directly (no mock needed).
 */
import type { TextBlock } from "./chunking.ts";
import { decodeHtmlEntities } from "./html-entities.ts";

export interface ExtractedSection {
  ord: number;
  level: number;
  heading: string;
  anchor: string | null;
  headingPath: string;
}
export interface ExtractedLink {
  href: string;
  text: string;
}
export interface ExtractedImage {
  src: string;
  alt: string | null;
}
export interface ExtractedContent {
  title: string | null;
  sections: ExtractedSection[];
  blocks: TextBlock[];
  links: ExtractedLink[];
  images: ExtractedImage[];
}

const DROP_TAGS = new Set(["script", "style", "nav", "footer", "aside", "noscript", "template"]);
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const BLOCK_TAGS = new Set(["p", "li", "td", "th", "blockquote", "dd"]);

// Site/wiki chrome that lives INSIDE the content area (so the tag drop-list misses
// it): section "[edit]" links, navigation/navbox templates, and the citation list.
// Dropped wholesale — text AND links — because template/citation links are not
// editorial relationships (ADR-0019). Matched on a class token (exact or prefix)
// or role="navigation".
const DROP_CLASS_EXACT = new Set(["references", "mw-references-wrap"]);
const DROP_CLASS_PREFIXES = ["mw-editsection", "navbox"];

// In-content chrome dropped by element id. fextralife renders its "tagged pages"
// crosslink navbox (a ♦-separated wiki_link list) inside #tagged-pages-container —
// pure navigation, not editorial relationships (ADR-0019), so drop text AND links.
const DROP_IDS = new Set(["tagged-pages-container"]);

// Drop list-item blocks that are mostly hyperlink ("See also" / "External links"
// style link lists): retrieval noise that pollutes BM25 and dilutes embeddings,
// while the link targets are still recorded as relationship edges. Only list items
// are density-filtered — a link-only table cell is still data, and prose with a few
// links is content. Threshold per Readability's high-confidence link-density cutoff.
const LINK_DENSITY_DROP = 0.5;
const DENSITY_FILTERED_TAGS = new Set(["li", "dd"]);

type Mode = "none" | "title" | "heading" | "block";

function collapse(text: string): string {
  // Decode HTML entities first (HTMLRewriter leaves text raw), THEN collapse
  // whitespace: a decoded &nbsp; (U+00A0) is whitespace, so it normalizes to a
  // single space instead of surviving as a literal entity.
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

/** True for in-content chrome to skip entirely (edit-section/navbox/reference list). */
function isDropContainer(el: Element): boolean {
  if (el.getAttribute("role") === "navigation") return true;
  const id = el.getAttribute("id");
  if (id !== null && DROP_IDS.has(id)) return true;
  const cls = el.getAttribute("class");
  if (cls === null) return false;
  for (const token of cls.split(/\s+/)) {
    if (DROP_CLASS_EXACT.has(token)) return true;
    if (DROP_CLASS_PREFIXES.some((p) => token.startsWith(p))) return true;
  }
  return false;
}

class HtmlExtractor {
  public title: string | null = null;
  public readonly sections: ExtractedSection[] = [];
  public readonly blocks: TextBlock[] = [];
  public readonly links: ExtractedLink[] = [];
  public readonly images: ExtractedImage[] = [];

  private skipDepth = 0;
  private mode: Mode = "none";
  private buf = "";
  private blockTag = "";
  private blockLinkChars = 0;
  private headingLevel = 0;
  private headingAnchor: string | null = null;
  private readonly pathStack: { level: number; heading: string }[] = [];
  private currentHeadingPath: string | null = null;

  public element = (el: Element): void => {
    const tag = el.tagName.toLowerCase();
    if (DROP_TAGS.has(tag) || isDropContainer(el)) {
      this.skipDepth += 1;
      el.onEndTag(() => {
        this.skipDepth -= 1;
      });
      return;
    }
    if (this.skipDepth > 0) return;
    this.onOpen(tag, el);
  };

  public text = (t: Text): void => {
    if (this.skipDepth > 0 || this.mode === "none") return;
    this.buf += t.text;
  };

  private onOpen(tag: string, el: Element): void {
    if (tag === "title") {
      this.startCapture("title");
      el.onEndTag(() => {
        this.finishTitle();
      });
    } else if (HEADING_TAGS.has(tag)) {
      this.flushBlock();
      this.headingLevel = Number(tag.slice(1));
      this.headingAnchor = el.getAttribute("id");
      this.startCapture("heading");
      el.onEndTag(() => {
        this.finishHeading();
      });
    } else if (BLOCK_TAGS.has(tag)) {
      this.flushBlock();
      this.blockTag = tag;
      this.startCapture("block");
      el.onEndTag(() => {
        this.flushBlock();
      });
    } else if (tag === "a") {
      this.openAnchor(el);
    } else if (tag === "img") {
      const src = el.getAttribute("src");
      if (src !== null) this.images.push({ src, alt: el.getAttribute("alt") });
    }
  }

  private openAnchor(el: Element): void {
    const href = el.getAttribute("href");
    if (href === null) return;
    const start = this.buf.length;
    const inBlock = this.mode === "block";
    el.onEndTag(() => {
      // Count anchor chars toward the current block's link density (link lists).
      if (inBlock) this.blockLinkChars += this.buf.length - start;
      this.links.push({ href, text: collapse(this.buf.slice(start)) });
    });
  }

  private startCapture(mode: Mode): void {
    this.mode = mode;
    this.buf = "";
  }

  private resetCapture(): void {
    this.mode = "none";
    this.buf = "";
  }

  private flushBlock(): void {
    if (this.mode === "block") {
      const rawLen = this.buf.length;
      const text = collapse(this.buf);
      if (text.length > 0 && !this.isLinkDense(rawLen)) {
        this.blocks.push({ headingPath: this.currentHeadingPath, text });
      }
    }
    this.blockLinkChars = 0;
    this.blockTag = "";
    this.resetCapture();
  }

  /** A list item that is mostly hyperlink — a "See also"/"External links" entry. */
  private isLinkDense(rawLen: number): boolean {
    return (
      DENSITY_FILTERED_TAGS.has(this.blockTag) &&
      rawLen > 0 &&
      this.blockLinkChars / rawLen > LINK_DENSITY_DROP
    );
  }

  private finishTitle(): void {
    const t = collapse(this.buf);
    this.title = t.length > 0 ? t : null;
    this.resetCapture();
  }

  private finishHeading(): void {
    const heading = collapse(this.buf);
    this.resetCapture();
    if (heading.length === 0) return;
    while (
      this.pathStack.length > 0 &&
      this.pathStack[this.pathStack.length - 1]!.level >= this.headingLevel
    ) {
      this.pathStack.pop();
    }
    this.pathStack.push({ level: this.headingLevel, heading });
    this.currentHeadingPath = this.pathStack.map((s) => s.heading).join(" > ");
    this.sections.push({
      ord: this.sections.length,
      level: this.headingLevel,
      heading,
      anchor: this.headingAnchor,
      headingPath: this.currentHeadingPath,
    });
  }

  public result(): ExtractedContent {
    return {
      title: this.title,
      sections: this.sections,
      blocks: this.blocks,
      links: this.links,
      images: this.images,
    };
  }
}

/** Extract structured content from an HTML string using HTMLRewriter. */
export async function extractContent(html: string): Promise<ExtractedContent> {
  const extractor = new HtmlExtractor();
  const rewriter = new HTMLRewriter().on("*", {
    element: extractor.element,
    text: extractor.text,
  });
  const response = rewriter.transform(new Response(html));
  await response.text();
  return extractor.result();
}
