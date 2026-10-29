import { z } from "zod";

export const authEmailSchema = z.string().trim().email().max(320);

export const authPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be 72 characters or fewer")
  .regex(/[A-Za-z]/, "Password must include a letter")
  .regex(/[0-9]/, "Password must include a number");

const signInSchema = z.object({
  mode: z.literal("signin"),
  email: authEmailSchema,
  password: z.string().min(1).max(72),
});

const signUpSchema = z
  .object({
    mode: z.literal("signup"),
    displayName: z.string().trim().min(1).max(80),
    email: authEmailSchema,
    password: authPasswordSchema,
    confirmPassword: z.string().min(1).max(72),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const passwordAuthRequestSchema = z.discriminatedUnion("mode", [
  signInSchema,
  signUpSchema,
]);

export type PasswordAuthRequest = z.infer<typeof passwordAuthRequestSchema>;
