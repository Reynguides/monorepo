import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { createProvisioner } from "../../src/provisioning/factory.ts";
import { ProvisioningError } from "../../src/provisioning/types.ts";
import { MockProvisioner } from "../../src/provisioning/MockProvisioner.ts";
import { SharedProvisioner } from "../../src/provisioning/SharedProvisioner.ts";
import { DedicatedProvisioner } from "../../src/provisioning/DedicatedProvisioner.ts";

describe("createProvisioner", () => {
  it("returns MockProvisioner for PROVISIONER=mock", () => {
    const p = createProvisioner({ ...env, PROVISIONER: "mock" });
    expect(p).toBeInstanceOf(MockProvisioner);
  });

  it("returns SharedProvisioner for PROVISIONER=shared with SHARED_USER_DB_ID", () => {
    const p = createProvisioner({ ...env, PROVISIONER: "shared" });
    expect(p).toBeInstanceOf(SharedProvisioner);
  });

  it("throws when PROVISIONER=shared and SHARED_USER_DB_ID is missing", () => {
    const { SHARED_USER_DB_ID: _unused, ...rest } = env;
    expect(() => createProvisioner({ ...rest, PROVISIONER: "shared" })).toThrow(ProvisioningError);
  });

  it("returns DedicatedProvisioner for PROVISIONER=dedicated with secrets", () => {
    const p = createProvisioner({
      ...env,
      PROVISIONER: "dedicated",
      CF_API_TOKEN: "t",
      CF_ACCOUNT_ID: "a",
    });
    expect(p).toBeInstanceOf(DedicatedProvisioner);
  });

  it("throws when PROVISIONER=dedicated and CF_API_TOKEN is missing", () => {
    const { CF_API_TOKEN: _t, ...rest } = { ...env, CF_API_TOKEN: "t", CF_ACCOUNT_ID: "a" };
    expect(() => createProvisioner({ ...rest, PROVISIONER: "dedicated" })).toThrow(ProvisioningError);
  });
});
