import i18n from "@/i18n.ts";

const EMAIL_DOMAIN_MESSAGE =
  /^The email domain "(.+)" is not approved for this workspace\.$/;

/**
 * Server errors are English sentences. Those sentences are the i18n keys.
 * A missing key returns the original message.
 */
export function translateApiErrorMessage(message: string): string {
  const domain = message.match(EMAIL_DOMAIN_MESSAGE);
  if (domain) {
    return i18n.t(
      'The email domain "{{domain}}" is not approved for this workspace.',
      { domain: domain[1], defaultValue: message },
    );
  }

  const translated = i18n.t(message, { defaultValue: message });
  return typeof translated === "string" ? translated : message;
}
