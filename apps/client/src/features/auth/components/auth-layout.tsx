import React from "react";
import { Group, Text } from "@mantine/core";
import classes from "./auth.module.css";
import { BRAND_LOGO_SRC, BRAND_NAME } from "@/plugins/branding/brand.ts";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <>
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
