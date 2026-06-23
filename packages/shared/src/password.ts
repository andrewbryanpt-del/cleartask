import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

/** Login: accept any non-empty password (existing accounts may use any characters). */
export const loginPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);

/**
 * Registration / invite: minimum length only — symbols like # ! @ are allowed.
 * No character-class restrictions.
 */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);
