import clsx from "clsx";
import styles from "./docs.module.css";
import { BRAND_NAME } from "@/plugins/branding/brand.ts";

export default function DocsFooterBranding({
  className,
  refSource = "public-space",
}: {
  className?: string;
  refSource?: string;
}) {
  return (
    <footer className={clsx(styles.footer, className)}>
      <a
        className={styles.footerBranding}
        href={`https://docmost.com?ref=${refSource}`}
        target="_blank"
        rel="noreferrer"
      >
        Powered by {BRAND_NAME}
      </a>
    </footer>
  );
}
