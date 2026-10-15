# FLI Document branding

User-visible product name is **FLI Document**. Packages, env var names, the database name, the Docker image, JWT issuer, and import helpers stay as they are upstream. Nothing under `ee/` was edited. AGPL license text is unchanged.

## Where the name lives

| Surface | File |
| --- | --- |
| Client constant | `apps/client/src/plugins/branding/brand.ts` (`BRAND_NAME`) |
| Browser tab title | `getAppName()` in `apps/client/src/lib/config.ts` returns `BRAND_NAME`. `DocumentTitle` uses that. |
| Static HTML / PWA | `apps/client/index.html` (`<title>`, `apple-mobile-web-app-title`) and `apps/client/public/manifest.json` (`name`, `short_name`). These cannot import TypeScript, so the string is copied. |
| Header and auth | `app-header.tsx`, `auth-layout.tsx` (login, setup, invite, forgot password). |
| Home AI fallback | `home-ai-prompt.tsx` uses `getAppName()` when the workspace has no name. |
| Public docs footer | Visible text in `docs-footer-branding.tsx` and `public-space-directory-page.tsx`. The link still points at `https://docmost.com` (upstream project). |
| Locales | Values in every `apps/client/public/locales/*/translation.json`. Keys that contain `Docmost` are unchanged so `ee/` `t()` calls keep resolving. The brand token is `FLI Document` in every language. `sales@docmost.com` is left as a contact address. |
| Server constant | `apps/server/src/common/brand.ts` |
| Mail From name | Default of `MAIL_FROM_NAME` only. The env var name is unchanged. |
| Email copy | Invitation body and subject, SIEM failure body, shared footer, and the header mark. |

## Logo

Master artwork: `logo-source.png` in this folder (512×512). Generated files, all PNG except the ico:

| File | Size |
| --- | --- |
| `apps/client/public/favicon.ico` | 16, 32, 48 |
| `apps/client/public/icons/favicon-16x16.png` | 16 |
| `apps/client/public/icons/favicon-32x32.png` | 32 |
| `apps/client/public/icons/favicon-48x48.png` | 48 |
| `apps/client/public/icons/apple-touch-icon.png` | 180 |
| `apps/client/public/icons/app-icon-192x192.png` | 192 |
| `apps/client/public/icons/app-icon-512x512.png` | 512 |
| `apps/client/public/icons/email-logo-64.png` | 64 (source for the inlined mail image) |

`index.html` links the ico, the 16/32/48 PNGs, and the Apple touch icon. The manifest lists 16, 32, 180, 192, and 512.

Emails inline the 64px PNG as a data URI (`BRAND_EMAIL_LOGO_SRC`) so the message does not need a public asset URL. Some clients hide data-URI images; the header also prints the product name.

To regenerate after replacing `logo-source.png` (Pillow):

```bash
python3 - << 'PY'
from PIL import Image
from pathlib import Path
import base64
src = Path("apps/client/src/plugins/branding/logo-source.png")
icons = Path("apps/client/public/icons")
img = Image.open(src).convert("RGBA")
for size, name in [
    (16, "favicon-16x16.png"),
    (32, "favicon-32x32.png"),
    (48, "favicon-48x48.png"),
    (64, "email-logo-64.png"),
    (180, "apple-touch-icon.png"),
    (192, "app-icon-192x192.png"),
    (512, "app-icon-512x512.png"),
]:
    img.resize((size, size), Image.Resampling.LANCZOS).save(icons / name, format="PNG", optimize=True)
img.resize((48, 48), Image.Resampling.LANCZOS).save(
    Path("apps/client/public/favicon.ico"),
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
)
b64 = base64.b64encode((icons / "email-logo-64.png").read_bytes()).decode()
print("paste into apps/server/src/common/brand.ts BRAND_EMAIL_LOGO_SRC")
print("data:image/png;base64," + b64)
PY
```

## Left unchanged on purpose

- `ee/` source.
- Package names, Docker image name, database name, env var names.
- JWT `issuer: 'Docmost'` in `token.module.ts`.
- `readDocmostMetadata` and other internal identifiers.
- README, license files, and comments that describe the upstream project.
- Locale **keys** that include the word Docmost.
