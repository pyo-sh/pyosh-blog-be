const LEGACY_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_USERNAME_MAX_LENGTH = 100;

export function normalizeUsername(input: string): string {
  const trimmed = input.trim();
  return LEGACY_EMAIL_REGEX.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

export function validateUsername(input: string): string {
  const normalized = normalizeUsername(input);

  if (!normalized) {
    throw new Error("Username is required.");
  }

  if (normalized.length > ADMIN_USERNAME_MAX_LENGTH) {
    throw new Error(
      `Username must be ${ADMIN_USERNAME_MAX_LENGTH} characters or fewer.`,
    );
  }

  return normalized;
}

export function validatePassword(input: string): string {
  if (!input) {
    throw new Error("Password is required.");
  }

  return input;
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
): void {
  if (password !== confirmation) {
    throw new Error("Password confirmation does not match.");
  }
}

export function parseAdminId(input: string): number {
  const value = Number.parseInt(input.trim(), 10);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Admin ID must be a positive integer.");
  }

  return value;
}
