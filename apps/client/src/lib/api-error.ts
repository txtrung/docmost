import { isAxiosError } from "axios";
import { translateApiErrorMessage } from "@/plugins/vi-locale/translate-api-error.ts";

export function getApiErrorMessage(
  error: unknown,
  fallback = "An error occurred",
): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) {
      const joined = message
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .map((item) => translateApiErrorMessage(item))
        .join(", ");
      if (joined) return joined;
    } else if (typeof message === "string" && message.trim()) {
      return translateApiErrorMessage(message);
    }
  }
  return translateApiErrorMessage(fallback);
}
