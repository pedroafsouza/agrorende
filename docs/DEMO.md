# AgroRende demo (10 minutes)

This is the script for a ten-minute product demo. It starts the way a real customer starts, by
signing a company up and inviting a technician, and then follows the golden path from the PRD
(§8) with the demo company that the seed creates: a machine breaks in the field, the report reaches
the office even without signal, the office dispatches the nearest technician, the repair is done
and verified, and the machine's cost appears. Meanwhile `pnpm simulate` keeps the rest of the team
moving on the live map.

Every person, machine, site, job and rental named here exists in the seed (`docs/ARCHITECTURE.md`
§17). Every password is `agrorende123`.

## Cast

| Who | Login | Where in the demo |
|---|---|---|
| A new customer, "Locadora Dourada" | mock Google account you type in | Sign-up (web) |
| Joana Inspetora | `inspetor@agrorende.dev` | Phone 1, reports the broken tractor |
| Marina Despacho | `despacho@agrorende.dev` | Office web, dispatch and verification |
| Carlos Técnico | `tecnico1@agrorende.dev` | Phone 2, does the repair |
| Pedro, Lucas and Rafael | simulated | Moving pins on the Operations Center map |

| Thing | Seed data |
|---|---|
| The broken machine | `AGR-000012` "Trator JD 6110J #12", at Fazenda Santa Clara (Cravinhos), Talhão 2. Operational, hour meter 4 298, two old minor scratches. |
| Carlos's starting point | On duty at Oficina Central Ribeirão Preto, about 20 km away, with one job on hold (`WO-000011`, waiting for parts). |
| A job for the simulator | `WO-000002` at Pátio Sertãozinho, open. |
| Office alerts already on screen | Rental `RN-000005` (truck, Fazenda Esperança) is overdue; `WO-000001` is a critical job with nobody assigned. |

## Before the audience arrives (5 minutes of preparation)

These commands were run while writing this script.

```bash
pnpm db:reset                                    # [automated-local] fresh demo data; timestamps are relative to now
pnpm dev                                         # [automated-local] web :3000, realtime :4001, worker :4002
pnpm simulate --users tecnico2@agrorende.dev,tecnico3@agrorende.dev,locacao@agrorende.dev   # [automated-local] second terminal
```

Leave Carlos out of the simulator: he is on a real phone in this demo. If you are short of
time, add `--speed 10` so the simulated jobs finish while you talk.

The simulator also works through the jobs already assigned to its people in the demo data:
Lucas takes WO-000003 and Rafael WO-000004 from accepted to completed within a few minutes.
That is expected; it gives the timeline and the job list something to show.

Human preparation:

1. **[human]** Phone 1: the AgroRende Dev app, signed in as Joana. Phone 2 (or a simulator):
   signed in as Carlos, on duty. Both phones point at your machine (`pnpm devloop --lan`; see
   the README).
2. **[human]** Browser window 1: <http://localhost:3000/login> as Marina, on `/ops`. Browser
   window 2: a private window on <http://localhost:3000/signup>.
3. **[human]** Show the device notification permission prompt once beforehand, so it does not
   interrupt the demo.

## 0:00 – 2:00 · A company signs up

Story: "A rental company in Ribeirão Preto hears about AgroRende and tries it."

1. In the private window, on `/signup`, click **Continue with Google**.
2. Locally, Google is a mock. On its login page type the user name `dona-dourada` and, in the
   claims box:

   ```json
   {"email":"dona@dourada.dev","email_verified":true,"name":"Dona Dourada"}
   ```

   (Any new email works. In staging and production this is the real Google screen.)
3. On `/signup/company`, fill in: company name **Locadora Dourada**, office phone
   **+55 16 99999-0101**, CNPJ **11.222.333/0001-81** (optional; it shows that the check
   digits are validated), city Ribeirão Preto, state SP, 1–5 field users, accept the terms, and
   submit.
4. The new company lands on `/ops` on a free trial, with a short getting-started list. Point out
   that it starts empty: nothing from the demo company is visible.

## 2:00 – 3:00 · Inviting a technician

1. Still as Dona Dourada, open **Team** and click **Invite person**: name **Tiago Campo**, role
   Field, phone **+55 16 99999-0202**. No email is needed.
2. The invitation shows a link, a 10-character code and a QR code, with **Send via WhatsApp**.
   It works once and is valid for 7 days.
3. Open the link (`/i/<code>`) in another private window: Tiago sees who invited him and can
   join with Google, Apple or a new password. Set a password to show the path for people without
   email. On a phone, the same code goes into **I have an invite code** on the sign-in screen.
4. Close both private windows. "That was the whole onboarding. Now let's see a company that has
   been using it for a season."

## 3:00 – 5:00 · Joana reports a broken tractor, with no signal

Story: "Joana is at Fazenda Santa Clara, out in Talhão 2. There is no signal there."

1. **[human]** Turn on **airplane mode** on phone 1.
2. In the app: **Reports → New report**. Find the machine by typing `AGR-000012` (or scan its
   label). The app knows it: Trator JD 6110J #12, Fazenda Santa Clara.
3. Severity **Critical**, problem "Hydraulic leak", take two or three photos, record a short voice
   note, and **Send report**.
4. The report appears in the list as **Waiting to send**, and the offline banner says the work is
   saved and will be sent when the connection returns. Nothing was lost.
5. Show the browser: Marina's map has no new pin yet. "The office cannot know yet. The phone
   knows."
6. **[human]** Turn airplane mode **off**. Within a few seconds the report gets its number
   (`FR-…`), the photos upload in the background, and on Marina's `/ops` a red pin appears on
   Fazenda Santa Clara with a critical-report alert. That is the reconnect moment.

## 5:00 – 6:30 · Marina dispatches

1. On `/ops`, click the new pin, then open the report. Show the photos and the voice note, the
   machine's history, and the location.
2. Click **Mark for repair**. AgroRende suggests technicians ranked by skills, distance and
   workload; **Carlos Técnico** is first (hydraulics and engines, about 20 km away, one job on
   hold). Assign him.
3. The machine is now **Needs repair** and a new work order (`WO-…`) exists for Fazenda Santa
   Clara in season Safra 2026/27.
4. Meanwhile, point at the map: Pedro, Lucas and Rafael are moving (that is `pnpm simulate`).
   Open `WO-000002` (Pátio Sertãozinho) and assign it to **Pedro Técnico**: within seconds his pin
   turns *On the way* and heads to Sertãozinho.

## 6:30 – 9:00 · Carlos repairs the tractor

1. Phone 2 buzzes: a new job. Open it: machine, place, the report's photos and a **Navigate**
   button.
2. **Accept job**, then **On my way**. On Marina's map, Carlos's pin turns to *On the way*.
3. **I've arrived**, **Start work**, take a **before** photo.
4. Optional, if time allows: **Pause** with *Waiting for parts*, then resume; this time is not
   counted as work.
5. **Parts used**: add "Hydraulic hose" for R$ 185,00.
6. **Checklist**: go through the standard corrective-service checklist; the test-run item asks
   for a photo.
7. **Finish job**: an **after** photo, hour meter **4 312**, the customer signs on the screen, and the
   job is **Finished**. The PDF work report is generated in the language chosen for the customer.

## 9:00 – 10:00 · Verification and what the machine cost

1. Marina opens the job, sees the before and after photos, the checklist, the part and the
   signature, and clicks **Verify**.
2. Open the machine `AGR-000012`: it is **Operational** again, and its cost now includes the
   labour (Carlos's hourly rate times the time actually worked) and the R$ 185,00 part. Filter by
   Fazenda Santa Clara and Safra 2026/27 to show the same cost per farm and per season.
3. Close on the Operations Center: the overdue rental `RN-000005`, the critical job `WO-000001`
   that still needs someone, and the team moving on the map.

## After the demo

1. **[automated-local]** Stop the simulator with **Ctrl-C**. It sets Pedro, Lucas and Rafael off
   duty before it exits, so the map is clean for the next run.
2. **[automated-local]** Stop `pnpm dev` with Ctrl-C.
3. **[automated-local]** `pnpm db:reset` before the next demo. Live map positions are kept in Redis
   and are refreshed as soon as people (or the simulator) report again.

## If something goes wrong

| What you see | Do this |
|---|---|
| The report stays *Waiting to send* after airplane mode is off | Open **More → Sync center** on the phone and tap **Sync now**. Check that the phone reaches your computer (`pnpm devloop --lan`, same Wi-Fi). |
| No pins move on the map | Check that `pnpm simulate` is running and printed `realtime connected`. Reload `/ops`. |
| The mock Google page does not appear | The OIDC mock on port 4003 is not running: `pnpm devloop --check`. |
| Carlos is not first in the suggestions | Carlos must be on duty on phone 2, and `pnpm simulate` must not include `tecnico1@agrorende.dev`. |
| Sign-up says the email already has an account | Use a different email in the mock claims, or run `pnpm db:reset`. |
