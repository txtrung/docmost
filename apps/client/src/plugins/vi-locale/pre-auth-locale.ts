/**
 * Locale used before a user is signed in.
 * Account locale still wins after login: UserProvider calls i18n.changeLanguage,
 * and the languageChanged listener below stores that choice for the next visit.
 */

const STORAGE_KEY = "docmost.locale";

/** Same codes as the account language picker. */
const SUPPORTED_LOCALES = [
  "en-US",
  "es-ES",
  "de-DE",
  "fr-FR",
  "nl-NL",
  "pt-BR",
  "it-IT",
  "ja-JP",
  "ko-KR",
  "uk-UA",
  "ru-RU",
  "zh-CN",
  "vi-VN",
] as const;

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
