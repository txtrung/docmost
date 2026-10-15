/**
 * Locale used before a user is signed in.
 * Browser detection is stored in `docmost.locale` and still loses to the
 * account locale after login. An explicit picker choice also sets
 * `docmost.locale.explicit`; UserProvider then saves that locale on the account.
 */

import { SUPPORTED_LOCALES } from "@/plugins/vi-locale/locale-options.ts";

const STORAGE_KEY = "docmost.locale";
const EXPLICIT_KEY = "docmost.locale.explicit";

const DEFAULT_LOCALE = "en-US";

function canonicalLocale(input: string | null | undefined): string | null {
  if (!input) return null;
  const tag = input.trim().replace(/_/g, "-");
  if (!tag) return null;

  const exact = SUPPORTED_LOCALES.find(
    (locale) => locale.toLowerCase() === tag.toLowerCase(),
  );
  if (exact) return exact;

  // "en" is stored on some accounts and normalized to en-US after login.
  if (tag.toLowerCase() === "en") return "en-US";

  const primary = tag.split("-")[0]?.toLowerCase();
  if (!primary) return null;
  const matches = SUPPORTED_LOCALES.filter((locale) =>
    locale.toLowerCase().startsWith(`${primary}-`),
  );
  // `vi` and `vi-VN` both mean Tiếng Việt. An unsupported region (zh-TW) does not.
  if (matches.length === 1 && !tag.includes("-")) return matches[0];
  return null;
}

export function rememberLocale(locale: string) {
  const normalized = canonicalLocale(locale);
  if (!normalized) return;
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // Private mode and non-browser tests can reject storage writes.
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = normalized;
  }
}

/** Picker choice. Survives login until UserProvider syncs it to the account. */
export function selectPreAuthLocale(locale: string) {
  rememberLocale(locale);
  try {
    localStorage.setItem(EXPLICIT_KEY, "1");
  } catch {
    // Ignore unreadable storage. The in-memory language change still applies.
  }
}

export function readExplicitLocale(): string | null {
  try {
    if (localStorage.getItem(EXPLICIT_KEY) !== "1") return null;
    return canonicalLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearExplicitLocale() {
  try {
    localStorage.removeItem(EXPLICIT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

/**
 * Stored choice, then navigator.language, then en-US.
 * Called once while i18n starts, before any account locale exists.
 */
export function resolvePreAuthLocale(): string {
  try {
    const stored = canonicalLocale(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Ignore unreadable storage and use the browser language.
  }

  if (typeof navigator !== "undefined") {
    const candidates = [navigator.language, ...(navigator.languages ?? [])];
    for (const candidate of candidates) {
      const match = canonicalLocale(candidate);
      if (match) return match;
    }
  }

  return DEFAULT_LOCALE;
}
