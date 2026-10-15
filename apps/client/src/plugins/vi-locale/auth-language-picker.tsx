import { Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { LOCALE_OPTIONS } from "@/plugins/vi-locale/locale-options.ts";
import { selectPreAuthLocale } from "@/plugins/vi-locale/pre-auth-locale.ts";

export function AuthLanguagePicker() {
  const { t, i18n } = useTranslation();
  const current = LOCALE_OPTIONS.some((option) => option.value === i18n.language)
    ? i18n.language
    : "en-US";

  return (
    <Select
      aria-label={t("Select language")}
      data={LOCALE_OPTIONS}
      value={current}
      onChange={(value) => {
        if (!value) return;
        selectPreAuthLocale(value);
        void i18n.changeLanguage(value);
      }}
      allowDeselect={false}
      checkIconPosition="right"
      size="xs"
      w={150}
      comboboxProps={{ width: 220, position: "bottom-end" }}
    />
  );
}
