import type { z } from 'zod';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] };

/**
 * Validate untrusted input against a contract. Issues are reduced to
 * path + message so they can be logged without echoing the payload itself.
 */
export function validateContract<S extends z.ZodType>(schema: S, input: unknown): ValidationResult<z.output<S>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.slice(0, 10).map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
  };
}
