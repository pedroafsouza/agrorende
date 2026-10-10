# ADMIN-CLEAN-001 · Plain record references in notification and list text

Status: OPEN
Requested by: ADMIN-CLEAN · Wave: polish
Target: `apps/worker/src/jobs/**` and `packages/core/src/notify/**` (notification parameters), `apps/web/src/features/work-orders/**`, `apps/web/src/features/costs/**`, `apps/web/src/features/settings/**` (owners: the feature tasks)
Kind: translation | other

## Problem

1. Notifications such as `SLA_AT_RISK` are rendered on the server with `{title}` set to a joined string like `WO-000002 · Ordem de serviço 2`. The middle dot ends up in the stored body ("WO-000002 · Ordem de serviço 2 está perto do prazo."), which reads as jargon in the notifications page and in the bell panel.
2. The work-order board cards and the costs table show the same `CODE · NAME` pattern (for example `AGR-000001 · TRACTOR AgroRende #1`).
3. On the settings page, long field labels wrap and push their inputs out of line with the neighbouring fields at 1280 px.

## Proposed change

1. Pass the record code and the record name as separate parameters (for example `{number}` and `{title}`) and word the templates in `packages/i18n/locales/*/notifications.json` around them, e.g. "A {title} ({number}) está perto do prazo."
2. Show the code as a small monospace tag next to the name instead of joining with "·".
3. Align settings fields on a shared label height, or shorten the labels.

## Workaround in place

`apps/web/src/features/notifications/notificationDisplay.ts` splits a leading `CODE · ` prefix out of stored titles and bodies and shows the code as a separate tag. Both the notifications page and the bell panel use it. The `DEVICE_STALE_SYNC` wording was changed at the source in `packages/i18n/locales/{pt-BR,en}/notifications.json` (orchestrator-approved), and the helper also rewords notifications stored with the old wording.

## Impact if rejected

Older notifications keep working through the helper; any new notification type that joins strings with "·" in its body will show the dot unless its code is at the start.

## Resolution

