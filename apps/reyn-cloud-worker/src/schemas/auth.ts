import { z } from "zod";

export const RegisterRequest = z.object({
  email: z.string().email().max(256),
  password: z.string().min(12).max(256),
});

export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const LoginRequest = z.object({
  email: z.string().email().max(256),
  password: z.string().min(1).max(256),
});

export type LoginRequest = z.infer<typeof LoginRequest>;

export const AuthResponse = z.object({
  userId: z.string(),
  token: z.string(),
  expiresAt: z.string(), // ISO 8601
});

export type AuthResponse = z.infer<typeof AuthResponse>;

export const MeResponse = z.object({
  userId: z.string(),
  email: z.string().email(),
});

export type MeResponse = z.infer<typeof MeResponse>;

export const HealthResponse = z.object({
  ok: z.literal(true),
  time: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponse>;
