import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "../helpers/setup.ts";
import { createUserDatabaseClient } from "../../src/user-data/factory.ts";
import { UserDatabaseClientError } from "../../src/user-data/types.ts";
import { MockUserDatabaseClient } from "../../src/user-data/MockUserDatabaseClient.ts";
import { SharedUserDatabaseClient } from "../../src/user-data/SharedUserDatabaseClient.ts";
import { RestUserDatabaseClient } from "../../src/user-data/RestUserDatabaseClient.ts";

describe("createUserDatabaseClient", () => {
  it("returns MockUserDatabaseClient under PROVISIONER=mock", () => {
    const e = { ...env, PROVISIONER: "mock" as const };
    expect(createUserDatabaseClient(e, "db-id")).toBeInstanceOf(MockUserDatabaseClient);
  });

  it("returns SharedUserDatabaseClient under PROVISIONER=shared", () => {
    expect(createUserDatabaseClient(env, "db-id")).toBeInstanceOf(SharedUserDatabaseClient);
  });

  it("throws when PROVISIONER=shared but USER_DATA_DB binding is missing", () => {
    const { USER_DATA_DB: _ignored, ...rest } = env;
    const e = { ...rest, USER_DATA_DB: undefined } as typeof env;
    expect(() => createUserDatabaseClient(e, "db-id")).toThrowError(UserDatabaseClientError);
  });

  it("returns RestUserDatabaseClient under PROVISIONER=dedicated with creds", () => {
    const e = {
      ...env,
      PROVISIONER: "dedicated" as const,
      CF_API_TOKEN: "t",
      CF_ACCOUNT_ID: "a",
    };
    expect(createUserDatabaseClient(e, "db-id")).toBeInstanceOf(RestUserDatabaseClient);
  });

  it("throws when PROVISIONER=dedicated lacks creds", () => {
    const e = { ...env, PROVISIONER: "dedicated" as const };
    expect(() => createUserDatabaseClient(e, "db-id")).toThrowError(UserDatabaseClientError);
  });
});
