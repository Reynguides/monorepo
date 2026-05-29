import type { Env } from "../types/env.ts";
import { DedicatedProvisioner } from "./DedicatedProvisioner.ts";
import { MockProvisioner } from "./MockProvisioner.ts";
import { SharedProvisioner } from "./SharedProvisioner.ts";
import { ProvisioningError, type IUserDatabaseProvisioner } from "./types.ts";

/**
 * Selects the active provisioner per `env.PROVISIONER`. Throws a
 * ProvisioningError if the dedicated mode is requested without the
 * required secrets — fail-fast at the boundary instead of at first use.
 */
export function createProvisioner(env: Env): IUserDatabaseProvisioner {
  switch (env.PROVISIONER) {
    case "mock":
      return new MockProvisioner();
    case "shared": {
      const sharedId = env.SHARED_USER_DB_ID;
      if (!sharedId) {
        throw new ProvisioningError("SHARED_USER_DB_ID must be set in shared mode");
      }
      return new SharedProvisioner(sharedId);
    }
    case "dedicated": {
      const { CF_API_TOKEN, CF_ACCOUNT_ID } = env;
      if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
        throw new ProvisioningError(
          "CF_API_TOKEN and CF_ACCOUNT_ID must be set in dedicated mode",
        );
      }
      return new DedicatedProvisioner({ apiToken: CF_API_TOKEN, accountId: CF_ACCOUNT_ID });
    }
  }
}
