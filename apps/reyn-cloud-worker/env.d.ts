declare module "cloudflare:test" {
  // Augment the cloudflare:test ProvidedEnv with the bindings + secrets we
  // configure in vitest.config.ts so test code can read them off `env`.
  interface ProvidedEnv {
    ACCOUNTS_DB: D1Database;
    USER_DATA_DB: D1Database;
    SESSION_PEPPER: string;
    PROVISIONER: "shared" | "dedicated" | "mock";
    SHARED_USER_DB_ID: string;
    ACCOUNTS_MIGRATIONS: D1Migration[];
    USER_DATA_MIGRATIONS: D1Migration[];
  }
}

export {};
