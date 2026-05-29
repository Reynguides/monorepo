import { Hono } from "hono";
import type { AuthVariables, Env } from "./types/env.ts";
import { healthHandler } from "./handlers/health.ts";
import { registerHandler } from "./handlers/auth/register.ts";
import { loginHandler } from "./handlers/auth/login.ts";
import { logoutHandler } from "./handlers/auth/logout.ts";
import { meHandler } from "./handlers/auth/me.ts";
import { requireAuth } from "./lib/auth-middleware.ts";

export const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

app.get("/v1/health", healthHandler);
app.post("/v1/auth/register", registerHandler);
app.post("/v1/auth/login", loginHandler);
app.post("/v1/auth/logout", requireAuth, logoutHandler);
app.get("/v1/me", requireAuth, meHandler);

export default app;
