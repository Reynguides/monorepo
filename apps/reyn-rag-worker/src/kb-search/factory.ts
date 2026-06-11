import type { Env } from "../types/env.ts";
import { HttpKbSearchClient } from "./HttpKbSearchClient.ts";
import { MockKbSearchClient } from "./MockKbSearchClient.ts";
import { KbSearchError, type IKbSearchClient } from "./types.ts";

/**
 * Selects the active KB search client per `env.KB_SEARCH`. The http mode
 * fail-fasts if `KB_BASE_URL` is unset, rather than erroring on first query.
 */
export function createKbSearchClient(env: Env): IKbSearchClient {
  switch (env.KB_SEARCH) {
    case "mock":
      return new MockKbSearchClient();
    case "http": {
      if (!env.KB_BASE_URL) {
        throw new KbSearchError("KB_BASE_URL must be set when KB_SEARCH=http");
      }
      return new HttpKbSearchClient({ baseUrl: env.KB_BASE_URL });
    }
  }
}
