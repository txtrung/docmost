import React from "react";
import { Box, Group, Text } from "@mantine/core";
import classes from "./auth.module.css";
import { BRAND_LOGO_SRC, BRAND_NAME } from "@/plugins/branding/brand.ts";
import { AuthLanguagePicker } from "@/plugins/vi-locale/auth-language-picker.tsx";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <>
      <Box pos="fixed" top={12} right={12} style={{ zIndex: 200 }}>
        <AuthLanguagePicker />
      </Box>
      <Group justify="center" gap={8} className={classes.logo}>
        <img
          src={BRAND_LOGO_SRC}
          alt={BRAND_NAME}
          width={48}
          height={48}
        />
        <Text size="28px" fw={700} style={{ userSelect: "none" }}>
          {BRAND_NAME}
        </Text>
      </Group>
      <main>{children}</main>
    </>
  );
}
