/** Same codes and labels as the account language picker. */
export const LOCALE_OPTIONS: { value: string; label: string }[] = [
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español (Spanish)" },
  { value: "de-DE", label: "Deutsch (German)" },
  { value: "fr-FR", label: "Français (French)" },
  { value: "nl-NL", label: "Dutch (Netherlands)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "it-IT", label: "Italiano (Italian)" },
  { value: "ja-JP", label: "日本語 (Japanese)" },
  { value: "ko-KR", label: "한국어 (Korean)" },
  { value: "uk-UA", label: "Українська (Ukrainian)" },
  { value: "ru-RU", label: "Русский (Russian)" },
  { value: "zh-CN", label: "中文 (简体)" },
  { value: "vi-VN", label: "Tiếng Việt" },
];

export const SUPPORTED_LOCALES = LOCALE_OPTIONS.map((option) => option.value);
