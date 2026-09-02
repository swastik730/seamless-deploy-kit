/** Username-based auth helpers (no real email address required). */

export const USERNAME_DOMAIN = "boardbuddy.app";

export const RECOVERY_QUESTIONS = [
  "What is your best friend's name?",
  "What is the name of your school?",
  "What is your favourite subject?",
  "What is the name of your pet or favourite animal?",
];

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return /^[a-z0-9._]{3,20}$/.test(normalizeUsername(value));
}

/** Field-level username check — returns a message, or null when valid. */
export function usernameError(value: string): string | null {
  const v = normalizeUsername(value);
  if (!v) return "Please enter a username.";
  if (v.includes(" ")) return "A username cannot contain spaces.";
  if (v.length < 3) return "A username must be at least 3 characters long.";
  if (v.length > 20) return "A username cannot be longer than 20 characters.";
  if (!/^[a-z0-9._]+$/.test(v)) return "Only letters, numbers, dots (.) and underscores (_) are allowed.";
  if (!/^[a-z0-9]/.test(v)) return "A username must start with a letter or a number.";
  return null;
}

/** Field-level password check — returns a message, or null when valid. */
export function passwordError(value: string, username?: string): string | null {
  if (!value) return "Please enter a password.";
  if (value.length < 6) return "Your password must be at least 6 characters long.";
  if (value.length > 72) return "Your password cannot be longer than 72 characters.";
  if (/\s/.test(value)) return "Your password cannot contain spaces.";
  if (username && normalizeUsername(value) === normalizeUsername(username)) {
    return "Your password cannot be the same as your username.";
  }
  return null;
}


/** Login field accepts a username, or an email for the owner account. */
export function identifierToEmail(value: string): string {
  const raw = value.trim();
  if (raw.includes("@")) return raw.toLowerCase();
  return `${normalizeUsername(raw)}@${USERNAME_DOMAIN}`;
}

/** Deterministic hash of the secret answer — the plain answer never leaves the device. */
export async function hashAnswer(username: string, answer: string): Promise<string> {
  const data = new TextEncoder().encode(
    `${normalizeUsername(username)}:${answer.trim().toLowerCase()}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
