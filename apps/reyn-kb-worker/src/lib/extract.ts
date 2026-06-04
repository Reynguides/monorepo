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

type Mode = "none" | "title" | "heading" | "block";

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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
  private headingLevel = 0;
  private headingAnchor: string | null = null;
  private readonly pathStack: { level: number; heading: string }[] = [];
  private currentHeadingPath: string | null = null;

  public element = (el: Element): void => {
    const tag = el.tagName.toLowerCase();
    if (DROP_TAGS.has(tag)) {
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
    el.onEndTag(() => {
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
      const text = collapse(this.buf);
      if (text.length > 0) this.blocks.push({ headingPath: this.currentHeadingPath, text });
    }
    this.resetCapture();
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
