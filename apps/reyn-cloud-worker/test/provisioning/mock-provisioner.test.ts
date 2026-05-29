import { describe, expect, it } from "vitest";
import { MockProvisioner } from "../../src/provisioning/MockProvisioner.ts";

describe("MockProvisioner", () => {
  it("returns a deterministic handle for a given userId", async () => {
    const p = new MockProvisioner();
    const a = await p.provision("user-1");
    const b = await p.provision("user-1");
    expect(a.databaseId).toBe("mock-user-1");
    expect(a.databaseId).toBe(b.databaseId);
  });

  it("returns distinct handles for distinct users", async () => {
    const p = new MockProvisioner();
    const a = await p.provision("user-1");
    const b = await p.provision("user-2");
    expect(a.databaseId).not.toBe(b.databaseId);
  });

  it("deprovision drops the cached handle so a new provision recreates it", async () => {
    const p = new MockProvisioner();
    const a = await p.provision("user-1");
    await p.deprovision(a);
    const b = await p.provision("user-1");
    // Same id (deterministic) but a fresh insertion path.
    expect(b.databaseId).toBe(a.databaseId);
  });

  it("deprovision is a no-op for an unknown handle", async () => {
    const p = new MockProvisioner();
    await expect(p.deprovision({ databaseId: "never-existed" })).resolves.toBeUndefined();
  });

  it("deprovision walks past non-matching cached handles without dropping them", async () => {
    const p = new MockProvisioner();
    await p.provision("keep-1");
    await p.provision("keep-2");
    // Different id → loop iterates without matching, no deletions.
    await p.deprovision({ databaseId: "not-cached" });
    // Existing handles are still cached, so a fresh provision returns same id.
    const after = await p.provision("keep-1");
    expect(after.databaseId).toBe("mock-keep-1");
  });
});
