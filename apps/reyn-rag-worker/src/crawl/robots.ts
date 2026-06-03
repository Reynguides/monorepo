/**
 * Minimal robots.txt parser (pure, no I/O). Implements the subset the crawler
 * needs from the de-facto robots standard:
 *
 * - `User-agent` groups: a line picks the group; lines until the next
 *   `User-agent` (or EOF) belong to it. We match the group whose UA token is
 *   either an exact (case-insensitive) match for our UA or `*`, preferring the
 *   most specific (exact UA wins over `*`).
 * - `Disallow` / `Allow` rules: longest-matching path prefix wins; on an equal
 *   length tie `Allow` wins (the standard's "least restrictive" tie-break).
 * - An empty `Disallow:` value means "allow everything" (no path is disallowed).
 * - `Crawl-delay`: seconds → milliseconds (NaN/negative ignored → 0).
 *
 * Not implemented (out of scope for the PoC): wildcards (`*`/`$`) inside paths,
 * sitemap directives, host directives. Paths are compared as literal prefixes.
 */

export interface RobotsRules {
  /** True if the given URL path may be fetched under the selected UA group. */
  isAllowed(path: string): boolean;
  /** Per-request spacing the host requests, in ms (0 = unspecified). */
  crawlDelayMs: number;
}

interface Rule {
  /** "allow" | "disallow". */
  allow: boolean;
  /** Path prefix the rule applies to ("" = root for an empty Disallow). */
  path: string;
}

interface Group {
  /** Lower-cased UA tokens this group applies to. */
  agents: string[];
  rules: Rule[];
  crawlDelayMs: number;
}

export function parseRobots(text: string, userAgent: string): RobotsRules {
  const groups = parseGroups(text);
  const group = selectGroup(groups, userAgent.toLowerCase());
  const rules = group?.rules ?? [];
  const crawlDelayMs = group?.crawlDelayMs ?? 0;

  return {
    crawlDelayMs,
    isAllowed(path: string): boolean {
      return isPathAllowed(rules, path);
    },
  };
}

/** Split the file into UA groups, accumulating Allow/Disallow/Crawl-delay. */
function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  // A run of consecutive `User-agent` lines shares one rule block.
  let expectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (line.length === 0) continue;
    const { field, value } = splitField(line);
    if (field === null) continue;

    if (field === "user-agent") {
      if (!expectingAgents || current === null) {
        current = { agents: [], rules: [], crawlDelayMs: 0 };
        groups.push(current);
      }
      if (value.length > 0) current.agents.push(value.toLowerCase());
      expectingAgents = true;
      continue;
    }

    expectingAgents = false;
    if (current === null) continue; // directive before any User-agent — ignore.
    applyDirective(current, field, value);
  }
  return groups;
}

function applyDirective(group: Group, field: string, value: string): void {
  if (field === "disallow") {
    group.rules.push({ allow: false, path: value });
  } else if (field === "allow") {
    group.rules.push({ allow: true, path: value });
  } else if (field === "crawl-delay") {
    const seconds = Number.parseFloat(value);
    if (Number.isFinite(seconds) && seconds > 0) {
      group.crawlDelayMs = Math.round(seconds * 1000);
    }
  }
}

/** Strip everything after an unquoted `#`. */
function stripComment(line: string): string {
  const hash = line.indexOf("#");
  return hash === -1 ? line : line.slice(0, hash);
}

/** Split "Field: value" → lower-cased field + raw value. */
function splitField(line: string): { field: string | null; value: string } {
  const colon = line.indexOf(":");
  if (colon === -1) return { field: null, value: "" };
  return {
    field: line.slice(0, colon).trim().toLowerCase(),
    value: line.slice(colon + 1).trim(),
  };
}

/** Prefer the exact-UA group; fall back to the `*` group; else null. */
function selectGroup(groups: Group[], ua: string): Group | null {
  const exact = groups.find((g) => g.agents.includes(ua));
  if (exact !== undefined) return exact;
  return groups.find((g) => g.agents.includes("*")) ?? null;
}

/**
 * Longest-prefix-match decision. An empty Disallow ("") never matches a path
 * (length 0 = "allow all"). On equal match length, Allow wins.
 */
function isPathAllowed(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;
  for (const rule of rules) {
    if (rule.path.length === 0) continue; // empty Disallow / Allow ⇒ no constraint.
    if (!path.startsWith(rule.path)) continue;
    if (best === null || rule.path.length > best.path.length) {
      best = rule;
    } else if (rule.path.length === best.path.length && rule.allow) {
      best = rule; // tie ⇒ Allow wins.
    }
  }
  return best === null ? true : best.allow;
}
