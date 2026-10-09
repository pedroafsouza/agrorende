# Translating AgroRende

AgroRende is written in Brazilian Portuguese first; **pt-BR is the reference copy** and the default
for everyone. English (`en`) ships at launch. Adding a language is meant to be a translation task:
you copy the English files, translate them and register the new language in a few lists. No screen,
API or business logic changes.

This guide explains where the text lives, the rules every message follows, how to check your work,
and the full checklist for adding a language. The design is described in
`docs/ARCHITECTURE.md` §20.

## 1. Where the text lives

| What | Files | Notes |
|---|---|---|
| Shared text (used by the server, the web app and the mobile app) | `packages/i18n/locales/<locale>/{common,enums,errors,notifications,pdf,exports}.json` | `errors` holds the title, body and action of every error code; `notifications` the push and in-app notifications; `pdf` the labels of the work and rental reports; `exports` the CSV column headers. |
| Office web app | `apps/web/messages/<locale>/*.json` | One file per area (`team.json`, `jobs.json`, `signup.json`, …). Loaded by locale name, so a new folder is picked up automatically. |
| Mobile app | `apps/mobile/src/i18n/<locale>/*.json` | One file per area. Registered in `apps/mobile/src/i18n/resources.ts` (the app bundles every language so it can switch offline). |
| Mobile app name and permission prompts (shown by Android and iOS, not by the app) | `apps/mobile/locales/<locale>.json` | Registered in the `locales` map of `apps/mobile/app.config.ts`. |
| Public website | `apps/site` (pages under `/pt-br` and `/en`) | Includes the error help pages the apps link to. |
| Content inside the data (checklist items, accessory names, rental terms, seed text) | `LocalizedText` values in the database | Edited in the web app (templates, settings), not in files. |
| App store listings | Google Play Console and App Store Connect | See §6. |

The locale registry is `packages/i18n/src/locales.ts`:

- `SUPPORTED_LOCALES`: every language a person can choose.
- `REQUIRED_LOCALES`: languages that must be complete before a release (checked by `pnpm i18n:check`). Today: `pt-BR` and `en`.
- `DEFAULT_LOCALE`: `pt-BR`.
- `LOCALE_META`: the language's own name (as shown in the language picker), the `Intl` tag used
  for dates and numbers, date and time styles, and the fallback chain (`en` falls back to `pt-BR`).

## 2. How a language is chosen

- **Mobile:** the person's choice in Settings → the phone's languages → the company's default →
  pt-BR. Switching is instant and works offline. The choice is also saved to the server so that
  notifications and PDFs use it.
- **Office web:** the person's profile → the language cookie → the browser's languages → the
  company's default → pt-BR.
- **Public website:** the address (`/pt-br/…` or `/en/…`); the bare domain redirects according to
  the browser and defaults to pt-BR.
- **Documents for customers** (work reports, rental contracts and inspections) use the language
  chosen when the document was created, and keep it forever, so a reprint looks like the original.
- **CSV exports:** headers are translated; values stay machine-readable (ISO dates, `.` as the
  decimal separator, money in cents in the `_cents` columns).

## 3. Message rules (ICU MessageFormat)

Every message is an [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
string.

- **Placeholders** are in braces and must be copied exactly: `"Valid until {at}"`. Never translate
  the name inside the braces, and do not add or remove placeholders; `pnpm i18n:check` fails if
  the placeholders differ from pt-BR.
- **Plurals** use `plural`, and every language must cover its own plural categories. English needs
  `one` and `other`; Portuguese too; other languages may need `few` or `many`:

  ```json
  "pendingValue": "{mutations, plural, one {# change} other {# changes}}"
  ```

  `#` is replaced by the formatted number.
- **Choices** use `select`, and must keep an `other` branch:

  ```json
  "role": "{role, select, ADMIN {Administrator} MANAGER {Manager} other {Field}}"
  ```

- **Rich text** uses tags such as `<b>…</b>` or `<link>…</link>`. Keep the tags and translate only
  what is between them.
- **Apostrophes:** in ICU, a single `'` can start a quoted section. Use the typographic apostrophe
  `’` in prose (`You’re`), or double it (`''`) when a plain one is required.
- **Never build sentences by joining pieces**, and never put numbers, dates or money into a
  message already formatted: pass them as placeholders. The app formats them with `Intl` for the
  language (`R$ 1.234,56` in pt-BR, `R$1,234.56` in en).
- **No empty strings.** If you are not sure, leave the English text and flag it; an empty string
  fails the check.
- **Length:** layouts tolerate text about 40 % longer than English. Prefer short words on buttons.
  Icons always come with text; do not shorten a label to rely on the icon.
- **Tone:** plain, friendly and direct. The people reading are often outdoors, in a hurry, with
  gloves on. Say what happened and what to do next; never blame the user. For errors, follow the
  three-part structure *title* (what happened), *body* (what it means and that their work is
  safe) and *action* (the button).
- **Product terms:** keep **AgroRende** untranslated. Keep the format of codes such as `AGR-000012`,
  `WO-000016` and `RN-000005`.

## 4. Checking your work

```bash
pnpm i18n:check                  # every required locale
pnpm i18n:check --locale es      # only the language you are adding
```

The check fails on:

- keys that are missing from, or extra compared with, pt-BR;
- ICU syntax errors;
- placeholders that differ from pt-BR;
- empty strings;
- error codes in the error catalogue without `errors.<CODE>.title`, `.body` and `.action`;
- `LocalizedText` seed values missing a required language.

It also warns about keys that no code uses.

**Pseudo-locale.** `en-XA` is a fake language for testing only: it accents every letter, brackets
every string and makes it about 40 % longer, so untranslated text and clipped layouts stand out.
It is used in automated screenshots and is never offered to users.

Developers: ESLint forbids literal text in the JSX of the web, mobile and site apps; every visible
string must be a key.

## 5. Adding a language: the checklist

Example: Spanish (`es`). Do the steps in this order.

1. **Register the language** in `packages/i18n/src/locales.ts`: add `"es"` to
   `SUPPORTED_LOCALES`; add an entry to `LOCALE_META` with `nativeLabel: "Español"`,
   `intl: "es"`, date and time styles, and `fallback: ["en", "pt-BR"]` (or another order that suits
   the audience); and add the bare language alias (`["es", "es"]`) to `languageAliases` so that
   phone and browser settings such as `es-AR` resolve to it. Add it to `REQUIRED_LOCALES` only when
   the translation is complete and you want releases to fail if it falls behind.
2. **Copy the English files**:
   - `packages/i18n/locales/en/` → `packages/i18n/locales/es/`
   - `apps/web/messages/en/` → `apps/web/messages/es/`
   - `apps/mobile/src/i18n/en/` → `apps/mobile/src/i18n/es/`
   - `apps/mobile/locales/en.json` → `apps/mobile/locales/es.json`
3. **Translate** every value. Do not change keys.
4. **Run `pnpm i18n:check --locale es`** until it passes, then `pnpm i18n:check`.
5. **Register the mobile bundles** in `apps/mobile/src/i18n/resources.ts`: import the new JSON
   files and add an `es` entry next to `pt-BR` and `en`. The mobile app ships every language inside
   the app so that switching works offline; its bundler needs the files listed explicitly. This
   is the only registration step in app code.
6. **Native strings:** add `es: "./locales/es.json"` to the `locales` map in
   `apps/mobile/app.config.ts`. These are the app name and the camera, microphone, location,
   notification and photo permission prompts. Changing them changes the native fingerprint, so
   the next store build (not an over-the-air update) carries them.
7. **Store listings:** add the language in Google Play Console and App Store Connect: title, short
   and full description, keywords, screenshots taken with the app in the new language, and the
   privacy and support URLs of the site pages for that language.
8. **Website:** add the locale-prefixed pages (for example `/es`) to the public site, including
   the error help pages that the apps link to (`/es/ayuda/errores/<code>` style paths come from
   `helpUrl` in `packages/i18n/src/helpUrl.ts`; add the path pattern for the new language there).
9. **Data (optional):** companies that want checklists, accessory names and rental terms in the
   new language add the text in the web app's template and settings pages. Seeded demo text may
   also get the new language; it is optional because only required locales are enforced.
10. **Company settings:** a company offers the language to its people by including it in its
    supported languages in Settings. The default for new companies stays pt-BR and en.

Apart from the three registrations above (`locales.ts`, the mobile `resources.ts` and the
`helpUrl` path pattern), nothing else changes: the server, the web app and the PDFs pick the new
language up from the registry and the files. Today `helpUrl` sends every language other than `en`
to the pt-BR help pages, so skipping step 8 is safe but shows Portuguese help.

## 6. Changing existing text

- Change pt-BR first; it is the reference. Then update every other language in the same pull
  request, so `pnpm i18n:check` stays green.
- If you change the meaning of a message, change it in every language, not only the wording in
  one.
- Renaming or removing a key is a code change; ask a developer. Adding a key without code that
  uses it shows up as an "unused key" warning.
- Native strings (`apps/mobile/locales/*.json`) only reach phones with the next store build.
- Text inside company data (`LocalizedText`) is edited by each company in the web app, not in
  files.
