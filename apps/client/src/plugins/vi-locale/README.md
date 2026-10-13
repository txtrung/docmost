# Vietnamese locale (vi-VN)

This folder documents the Vietnamese UI locale. The catalog itself lives with the other languages so i18next can load it without any extra wiring.

## How Docmost loads translations

The client uses `i18next` and `react-i18next` (`apps/client/src/i18n.ts`). Strings are loaded over HTTP from `apps/client/public/locales/{{lng}}/translation.json`. The fallback language is `en-US`. `crowdin.yml` already maps every locale with `%locale%`, so it does not need a Vietnamese-specific entry.

After sign-in, `UserProvider` calls `i18n.changeLanguage` with the user's `locale`. The account settings picker is `AccountLanguage` in `apps/client/src/features/user/components/account-language.tsx`. Choosing **Tiếng Việt** stores `vi-VN`.

There is no dayjs usage. Dates and relative times in community code go through `date-fns` in `apps/client/src/lib/date-locale.ts` and `apps/client/src/lib/time.ts`. `vi-VN` is mapped to the `vi` locale from `date-fns/locale`. `Intl` formatters already follow `i18n.language`.

## What changed outside this folder

These are the only core edits, kept small so they merge cleanly when upstream adds keys:

1. `apps/client/public/locales/vi-VN/translation.json` — full catalog, same keys as `en-US`.
2. `apps/client/public/locales/en-US/translation.json` — keys that the UI already passed to `t()` but that were missing from the catalog, plus a few newly wrapped labels. English values match the previous on-screen text.
3. `account-language.tsx` — one picker row: `{ value: "vi-VN", label: "Tiếng Việt" }`.
4. `date-locale.ts` — import `vi` and map `"vi-VN"` to it.
5. A handful of community components that still had visible English now call `t()` (slash-menu category, status badge, base embed messages, toolbar label, theme toggle, attachment download, find-in-page controls, embed menu labels).

Nothing under `apps/client/src/ee`, `apps/server/src/ee`, or `packages/ee` was modified. Enterprise screens pick up Vietnamese only when they call `t()` with a key that exists in the shared catalog.

## Plurals

Vietnamese has a single plural category, `other` (`Intl.PluralRules`). i18next therefore resolves `t(key, { count })` to `key_other`. The `_one` keys are still present so the file stays aligned with `en-US`, and both forms use the same uninflected noun. A count of one still reads naturally because the sentence does not change shape.

## Check the catalog

From the repository root:

```bash
node apps/client/src/plugins/vi-locale/compare-locales.mjs
```

The script exits with an error if `vi-VN` is missing a key, has an extra key, or a value's `{{placeholders}}` or tags differ from `en-US`.

## Updating after an upstream locale change

Copy new keys from `en-US` into `vi-VN` using [GLOSSARY.md](./GLOSSARY.md), keep every placeholder and tag, then run the script above.
