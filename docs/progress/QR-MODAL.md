# QR-MODAL · QR code modal with PDF, PNG and print

Status: DONE
Wave: polish · Agent finished: 2026-10-10 15:32

## Done
- FR-02 (asset QR labels): the asset detail page now has a "Gerar QR Code" button instead of a plain download link. It opens a modal with a large on-screen preview of the label (organisation name, QR code, asset code in large monospace, asset name) and three actions: "Baixar PDF" (primary, the existing label sheet endpoint with this single asset), "Baixar PNG" (the existing `qr.png` endpoint) and "Imprimir" (prints only the label through a hidden iframe). (`apps/web/src/features/assets/QrModal.tsx`, `apps/web/src/features/assets/AssetDetailPage.tsx`)
- Bulk flow: on the assets list, "Imprimir etiquetas QR" now opens the same modal in multi mode, instead of downloading straight away. Multi mode shows a scrollable grid of the selected labels, the label count and the number of A4 sheets (30 labels per sheet), plus "Baixar PDF", which calls `fetchQrSheet`. The `QR_SHEET_MAX_ASSETS` validation is kept: the bulk button stays disabled above the cap, and the modal shows the too-many message and disables the PDF action. Selecting exactly one asset opens the single-label mode. (`apps/web/src/features/assets/AssetsListPage.tsx`, QR region only)
- API helpers: `fetchQrPng`, `assetQrPayload`, `QR_LABELS_PER_PAGE` and a shared `send()` helper that maps HTTP errors to `ApiError`. (`apps/web/src/features/assets/qrSheetApi.ts`)
- Accessibility:
  - The modal is a native `<dialog>` opened with `showModal()`, with `aria-modal`, `aria-labelledby` and `aria-describedby`.
  - Tab and Shift+Tab wrap inside the dialog (focus trap). Escape closes it, and focus returns to the trigger.
  - Every button is at least 48 px tall and shows an icon together with text. The close button is a 48 × 48 px icon button with an accessible name.
- Motion follows `GuideModal`: a centred spring on desktop, a bottom sheet with a grab handle below 640 px, and a plain fade under `prefers-reduced-motion`.
- Busy and error states: the running action shows the `Button` pending state, and the other actions are disabled while it runs. A failure shows a compact `ErrorAlert` inside the modal; its retry button re-runs the failed action, so the flow never dead-ends. Success shows a toast (`qr.ready` for the PDF, `qr.pngReady` for the PNG).
- Copy: new ICU keys in `apps/web/messages/{pt-BR,en}/assets.json`:
  - `actions.generateQr`
  - `qr.pngReady`
  - `qr.modal.{titleSingle,titleMulti,sheetInfo,preview,previewRegion,downloadPdf,downloadPng,print}`

  The now-unused `actions.downloadQr` key was removed from both locales.

## Tests
- `pnpm i18n:check` → passed for pt-BR and en.
- `apps/web`: `eslint . --max-warnings 0 --ignore-pattern ".next-perf/**"` → clean. `tsc --noEmit` → clean. `vitest run` → 58 files, 334 tests passed.
- `pnpm check:only web` → lint failed with 51,471 errors, all inside `apps/web/.next-perf/**`. That folder is a production build output another agent created during this session, and it is not ignored by the ESLint config. No source file has a lint error. On the earlier run, before that folder existed, the full gate exited 0 (57 files, 330 tests).
- New `QrModal.test.tsx` (8 tests):
  - opens with the label, organisation, code and QR image
  - the PDF action calls `fetchQrSheet` with the single id and shows a toast
  - PNG download
  - multi-mode preview and PDF with all ids
  - more than 300 assets blocks the PDF
  - an error shows the retry, and the retry succeeds
  - Escape closes the modal and focus returns to the trigger
  - Tab wraps inside the dialog
- `AssetsListPage.test.tsx` was updated for the modal step.
- Visual check with playwright-cli against `http://localhost:3000`, at 1280 and 390 px, in light and dark. Screenshots are in `.data/reviews/qr-modal/`.
  - Single label: PNG downloads at 3,129 bytes and is a valid PNG; PDF downloads at 5,945 bytes and starts with `%PDF`. All buttons are 48 px tall, Escape closes the modal and focus returns to "Gerar QR Code".
  - Multi mode with 39 labels: the PDF is 74,739 bytes and valid, and focus returns to "Imprimir etiquetas QR".

## Assumptions
- The preview and the printed iframe show the organisation name above the QR, as the request describes. The server-side PDF label layout (`packages/core` qrSheet) has no organisation name and was not changed, because it is outside this task's paths.
- The QR payload in the preview is `agrorende://a/<code>`, the same payload the server encodes.
- Selecting one asset in the bulk flow opens single mode, so PNG and print are available there too.
- `QrSvg` has a sizing quirk: its padded wrapper plus a fixed-size svg can overflow small boxes. This is worked around locally with `[&_svg]:size-full` instead of editing the shared component.
- "Imprimir" prints only the label, through a hidden iframe, rather than calling `window.print` on the whole admin page.

## Gaps
- None for the requested feature.
- `apps/web/.next-perf/` should be deleted, or added to the ESLint ignores, so that `pnpm check:only web` passes again. Suggested owner: whoever created the perf build.

## Error cases added
- None new. Download failures reuse the existing API error mapping and the recovery kit (inline `ErrorAlert` with retry).

## Change requests
- None.

## Notes for the next wave
- Run playwright-cli from outside `apps/web` (for example from `.data/`). Its `.playwright-cli/` log folder inside the Next watch tree triggers an endless Fast Refresh reload loop.

## Review fixes

A code review of the QR modal raised two blocking findings, two important findings, two maintainability nits and a list of missing tests. All of them are addressed.

### Open and close lifecycle

- The exit animations used `fill: "forwards"` and were never cancelled. The panel stayed invisible the next time the modal opened. The modal now keeps every `Animation` handle it starts. Before it starts new ones, and when it finishes closing, it clears their `onfinish` handlers and cancels them.
- Reopening the modal within 150 ms of closing it no longer closes it again. The exit-effect cleanup cancels the pending `onfinish` and the fallback timer. A reopen during the exit keeps the dialog open as it is. It does not capture a new trigger, call `showModal` again or replay the enter animation, so focus does not move.
- If the exit animation never reports that it has finished, for example in a background tab, a fallback timer closes the dialog.
- The tabbable-element selector used for the focus trap now covers every standard tabbable element. Before, it covered only a subset.

### Stale results and print errors

- Each opening of the modal starts a new session, and the busy and error states reset on open. A download that finishes after the modal was closed or reopened still saves the file and shows its toast, because the person asked for it. It no longer changes the busy or error state of the new session.
- Printing now runs through the same action handler as the downloads. Errors appear in the modal's `ErrorAlert` with a retry, instead of being lost. The hidden print iframe is removed on `afterprint`. If that event never fires, a 60-second fallback removes it.

### Over-limit guard

The 300-asset limit had a separate guard in the list page and in the modal. The rule now lives in one helper, `isQrSheetTooLarge(count)`, in `qrSheetApi.ts`. The Assets list owns the user-facing behaviour: it disables "Print QR labels" and explains why. The modal only disables "Download PDF" defensively and no longer repeats the message.

### Tests added

- `features/assets/QrModal.test.tsx`, 12 new tests (20 total), using a fake `Element.prototype.animate`:
  - open, close and reopen leaves the panel visible, and the animations are cancelled;
  - reopening within the exit window stays open without moving focus;
  - the fallback timer closes the dialog when `onfinish` never fires;
  - clicking the backdrop or the close button returns focus to the trigger;
  - the page scroll lock on `documentElement` is set and then restored;
  - a PNG error shows an `ErrorAlert` whose retry calls `fetchQrPng` again;
  - while the PDF is pending, the other buttons are disabled;
  - print writes the escaped asset name (`<b>`) into the iframe and calls `print`;
  - a print failure shows a recoverable error;
  - 31 assets read "2 A4 sheets";
  - an empty asset list disables the PDF button.
- `features/assets/qrSheetApi.test.ts`, new with 7 tests:
  - `fetchQrPng` sends the right URL and `Accept` header;
  - the file name comes from `Content-Disposition`, falling back to `<code>.png`;
  - a JSON error becomes an `ApiError`;
  - a thrown fetch becomes `BROWSER_OFFLINE`;
  - `isQrSheetTooLarge` is checked at the limit.
- `features/assets/AssetsListPage.test.tsx`, 2 new tests (4 total):
  - selecting rows on page 1, moving to page 2 and selecting more shows every selected code in the preview, with no "—" placeholders, and closing the modal keeps the selection;
  - selecting 301 assets disables "Print QR labels" and shows the limit message.
- `features/assets/AssetDetailPage.test.tsx`, new with 1 test: "Generate QR code" opens the modal for this asset, and closing it returns focus to the button.

`pnpm check:only web` (62 files, 382 tests) and `pnpm i18n:check` pass. The `.next-perf` lint gap listed above no longer applies; that folder is gone.
