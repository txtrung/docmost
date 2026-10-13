import { Button, Divider } from "@mantine/core";
import { IconKey } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { customSsoConfig } from "./config";

export function CustomSsoButton() {
  const { t } = useTranslation();

  if (!customSsoConfig.enabled) return null;

  const handleClick = () => {
    // TODO: redirect to customSsoConfig.loginUrl once the backend flow exists.
    notifications.show({
      message: t("SSO is not configured on the server yet."),
    });
  };

  return (
    <>
      <Button
        fullWidth
        variant="default"
        leftSection={<IconKey size={16} />}
        onClick={handleClick}
      >
        {t("Login with SSO")}
      </Button>
      <Divider my="md" label={t("or")} labelPosition="center" />
    </>
  );
}
