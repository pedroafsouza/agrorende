# MOBILE-SELL · Mobile "Now" phase of SIMPLER-TO-SELL (animations, first-run intro, sending wording)

Status: DONE_WITH_GAPS
Wave: SIMPLER-TO-SELL "Now" · Agent finished: 2026-10-10 12:18

## Done
- SIMPLER-TO-SELL §5 / §6: added a shared `Lottie` component (`apps/mobile/src/ui/Lottie.tsx`, exported from `src/ui/index.ts`).
  - It wraps `LottieView` from `lottie-react-native` and uses the eager `animations[id]` JSON from `@agrorende/motion`.
  - It autoplays and loops according to `motionMeta[id].loop`. Callers can override this with `loop` or `playOnce`.
  - It is sized by the animation's aspect ratio, with a `size` that sets the maximum width.
  - It is hidden from assistive technology (`accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`, `accessible={false}`) and does not take touches.
  - With reduce motion on (`AccessibilityInfo.isReduceMotionEnabled` plus the change listener), it shows the still poster frame (`progress = posterFrame / op`) and does not play.
- PLT-14 / §5 technician first-run intro: added `IntroScreen` (`src/auth/ui/IntroScreen.tsx`) on the route `app/(auth)/intro.tsx`, with no header and swipe-back disabled. It has three cards:
  - `report-offline`: "Funciona sem sinal"
  - `flow-loop`: "Do relato à entrega"
  - `signature`: "O cliente assina no seu celular"

  Each card has one sentence and a "1 de 3" progress line. The footer has a primary button (Próximo, then Começar on the last card) and an always-visible ghost "Pular" button; both are at least 48 dp. Finishing or skipping stores `introSeen: true` in the existing device prefs file (`src/lib/app/prefs.ts`, through expo-file-system), so the intro is shown once.
- First-run routing: added `firstRunRoute(prefs)` (`src/auth/ui/firstRun.ts`). Login and the forced password change use it to route to `/intro`, then `/onboarding` (the existing permission explanations), then `/today`.
- §5 empty states: `EmptyState` now shows a Lottie by default (`empty`) and accepts an `animation` prop. The list screens use it with one sentence and one action:
  - Jobs: `first-work-order`, with "Verificar de novo", which sends and reloads.
  - My reports: `report-offline`, with the existing new-report action.
  - Rentals: `rental-handover`. Office users get "Nova locação"; other users get "Verificar de novo".
- §2 / §5 sending wording, pt-BR and en, with values changed and keys kept:
  - "Central de sincronização" becomes "Envios".
  - "Sincronizar agora" becomes "Enviar agora".
  - "Pendente", "Na fila" and "Aguardando envio" become "Salvo no celular" or "Será enviado quando tiver sinal".
  - "Enviar diagnóstico" and "registros de diagnóstico" become "Enviar informações para o suporte".
  - The same wording is applied in the More menu, settings help, recovery actions, error bodies and actions, comments, reports, jobs, rentals, fuel, parts, the device users card and the notification permission text in `locales/*.json`.
- Sending screen (`SyncCenterScreen`): the header card now shows a `saved-on-phone` animation with "Salvo no celular / Será enviado quando tiver sinal" while anything is still on the phone. When the outbox, uploads, conflicts and pending bytes are all empty, it shows `success`, played once, with "Tudo enviado". The separate "Tudo enviado" empty state was folded into this header.
- WO-10 completion: after a successful completion, `JobCompleteScreen` shows a success screen. It has a `success` Lottie played once, "Serviço concluído", one sentence saying the work is saved on the phone and goes to the office when there is signal, and a "Voltar ao serviço" button. Before, it navigated straight back.
- Jest: added a `lottie-react-native` mock in `test/ui/setup.ts` and mapped `@agrorende/motion` to its source in `jest.config.js`.
- Tests: added `test/ui/intro.test.tsx` (routing order, walking the three cards, skipping, and the Lottie being hidden from accessibility). Updated the tests that asserted the old copy (`comments`, `sharedDevice`, `parts`, `engine/kit`).

## Tests
- `pnpm check:only mobile` → lint passed, typecheck passed, 199 tests passed (37 suites).
- `pnpm i18n:check` → passed for pt-BR and en. The only warnings are the pre-existing unused `pdf.*` keys.
- `cd apps/mobile && CI=1 npx expo export --platform android --output-dir .export-check` → exit 0, one 11 MB Hermes bundle. The Lottie module is present in the bundle. The output directory was deleted afterwards.

## Assumptions
- The `introSeen` flag is device-level, stored next to `onboarded` in `prefs.json`. On a shared phone, a second technician does not see the intro again. This is the same behaviour as the existing permission onboarding.
- The intro comes before the permission explanations, because PLT-14 says "3 intro screens plus permission explanations". Existing installs that already have `onboarded: true` see the intro once and then go straight to Hoje.
- Translation keys were kept and only their values changed, to limit churn; for example, `sync.action.syncNow` now reads "Enviar agora". New keys:
  - `routes.auth.intro`
  - `ui.empty.refresh`
  - `auth.intro.*`
  - `sync.header.*`
  - `jobs.complete.doneTitle` and `jobs.complete.doneBody`

  `sync.empty.*` is no longer rendered but was kept for parity.
- `lottie-react-native` needs no Expo config plugin: version 7.5.0 ships no `app.plugin.js`, so `app.config.ts` is unchanged. Metro resolves `@agrorende/motion` and its JSON through the workspace symlink, the same way it resolves `@agrorende/design-tokens`.
- `pnpm install --frozen-lockfile --offline` was run once to link the already-declared `lottie-react-native` into `node_modules`. The lockfile is unchanged.
- Not-found and notification empty states keep their icons, because they are errors or navigation states rather than "first use" moments.

## Gaps
- §5 motion budget: looping animations (`saved-on-phone`, `empty`) do not pause when off-screen or when the app is in the background. LottieView pauses natively on unmount, but there is no focus-aware pause. Suggested owner: mobile follow-up (`useIsFocused` from Expo Router).
- The intro is not shown again per user on shared devices (see Assumptions). Suggested owner: product decision in the "Next" phase together with the invite flow.
- No device or simulator visual check was done, because no simulator or Metro was used in this task. `ui-reviewer` should screenshot `/intro`, the sending screen, the completion success screen and the empty lists.
- Tabs and the invite flow are unchanged, as requested ("Next" phase).

## Error cases added
- None. The intro always finishes: if writing `introSeen` fails, the technician still moves on, and the intro may simply show again on the next sign-in.

## Change requests
- None.

## Edits outside owned paths (T10, T11, T12 only)
- None. Only `apps/mobile/**` and this file were edited.

## Notes for the next wave
- Use `<Lottie id=… />` from `src/ui` for any new animation. Do not render `LottieView` directly, so that reduce motion and accessibility hiding stay consistent.
- In tests, the player's testID is `${testID}-player`, and the default testID is `lottie-${id}`. Because the wrapper is hidden from accessibility, queries need `{ includeHiddenElements: true }`.
