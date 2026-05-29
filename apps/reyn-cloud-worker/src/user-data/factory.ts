import type { Env } from "../types/env.ts";
import { MockUserDatabaseClient } from "./MockUserDatabaseClient.ts";
import { RestUserDatabaseClient } from "./RestUserDatabaseClient.ts";
import { SharedUserDatabaseClient } from "./SharedUserDatabaseClient.ts";
import { UserDatabaseClientError, type IUserDatabaseClient } from "./types.ts";

/**
 * Picks the right user-data client per `env.PROVISIONER`. The `databaseId`
 * argument is the user's per-row mapping from `user_databases` — used only by
 * the dedicated/REST mode, but accepted in all modes for caller uniformity.
 *
 * Throws `UserDatabaseClientError` fail-fast when the chosen mode is missing
 * its required configuration, mirroring the provisioning factory's contract.
 */
export function createUserDatabaseClient(
  env: Env,
  databaseId: string,
): IUserDatabaseClient {
  switch (env.PROVISIONER) {
    case "mock":
      return new MockUserDatabaseClient();
    case "shared": {
      if (!env.USER_DATA_DB) {
        throw new UserDatabaseClientError("USER_DATA_DB binding is missing in shared mode");
      }
      return new SharedUserDatabaseClient(env.USER_DATA_DB);
    }
    case "dedicated": {
      const { CF_API_TOKEN, CF_ACCOUNT_ID } = env;
      if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
        throw new UserDatabaseClientError(
          "CF_API_TOKEN and CF_ACCOUNT_ID must be set in dedicated mode",
        );
      }
      return new RestUserDatabaseClient({
        apiToken: CF_API_TOKEN,
        accountId: CF_ACCOUNT_ID,
        databaseId,
      });
    }
  }
}
