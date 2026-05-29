import { describe, expect, it } from "vitest";
import { SharedProvisioner } from "../../src/provisioning/SharedProvisioner.ts";

describe("SharedProvisioner", () => {
  it("returns the same configured database id for every user", async () => {
    const p = new SharedProvisioner("shared-db-uuid");
    const a = await p.provision("alice");
    const b = await p.provision("bob");
    expect(a.databaseId).toBe("shared-db-uuid");
    expect(b.databaseId).toBe("shared-db-uuid");
    expect(a.region).toBe("SHARED");
  });

  it("deprovision is a no-op", async () => {
    const p = new SharedProvisioner("shared-db-uuid");
    await expect(p.deprovision({ databaseId: "shared-db-uuid" })).resolves.toBeUndefined();
  });
});
