declare module "cloudflare:test" {
  // Augment the cloudflare:test ProvidedEnv with the bindings + secrets we
  // configure in vitest.config.ts so test code can read them off `env`.
  interface ProvidedEnv {
    ACCOUNTS_DB: D1Database;
    SESSION_PEPPER: string;
    PROVISIONER: "shared" | "dedicated" | "mock";
    ACCOUNTS_MIGRATIONS: D1Migration[];
  }
}

export {};
