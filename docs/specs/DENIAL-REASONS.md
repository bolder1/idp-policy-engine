# Denial reasons: one reason, three readers (v2)

Status: steps 1 to 5 and the step-3 extras are built in the 5181 worktree (5 Oct 2026), uncommitted, behind `DENIAL_REASONS` (on). Proven by tests; browser-checked on the older build only.

**Owner ruling, 5 Oct 2026: the reason is admin only.** The outcome card, Why and the blocked list say it. The end user's deny page shows the rule's message, next step and a contact, and never the reason or a reference code. This follows the IDP miniOrange design repo (the end user stays opaque about policy, factor, IP and device).

## Problem

When a sign-in is blocked, three people read the result and each reads different text.

| Reader | Today |
|---|---|
| End user | One free-text `Rule.denyMessage` (`data.ts:637`). Absent means `DEFAULT_DENY_MESSAGE` ("You are not permitted to log in. Please contact your administrator."). No cause, no next step. The default copies the live console, so it stays (product parity). |
| Admin | Why panel and `EngineOutcome` (`why`, `by`, `ruleLine`) in `engine-run.ts`. Rich, but its own text. |
| Help desk | No path from a person's denied sign-in to the Why view, apart from Past sign-ins. |

## Evidence (verified in `docs/research/competitors/`)

- Duo: about 90 denial reason codes, filterable in the Authentication Log; a Premier-only remediation note (up to 700 characters per OS); its built-in Q&A answered "which policy decides" wrongly in our test.
- Okta: remediation instructions per device check (default, custom or none).
- Entra: What If and report-only results sit in separate blades, behind licences.

## What we reuse (checked in the code)

| Existing | Where | Role here |
|---|---|---|
| 12 finding kinds (rule-conflict, named-later, deny-first, exception, policy-conflict, same-group-policy, group-policy-first, off-would-change, off-no-change, depends, not-covered, also-matches) | `sign-in-tests/conflicts.ts`, `journey.ts` | Source of admin-side reasons |
| 7 break-in groups (got-through, weaker-factor, less-than-asked, locked-out, extra-prompts, cant-tell, held) | `break-in-model.ts`, `attempts.ts` | Source of reasons for scripted attempts; the list of known denials |
| Review attempts, and press-to-play on the canvas | `break-in-app.ts`, `attempts.ts` | Denial list, one click to its Why view |
| Fix in policy with Undo | `board/arrive-fix.ts`, `break-in-app.ts` | The redirect step |
| Why panel, As each group, Open rule / Open policy / Add fact | `WhyCard.tsx`, `journey.ts` | Admin explanation |
| What they see (player, ends on the deny page) | `testing/WhatTheySee.tsx` | End-user denial screen and the preview of the message |
| Past sign-ins | `testing/DockPast.tsx` | Help-desk lookup |
| Reroute chips (another network, device or risk score; one group alone) | `layouts/directions-reroute.ts` | "How to get in": the chip that flips the answer |
| Deny message textarea | `board/WhatEditor.tsx` | Where next step and contact are added |
| Questions answers built only from the run | `layouts/assistant/intents.ts` | A correct answer layer, never invented text |

Not extended: the decorative canvas options (Circuit, Bento, Deck and the rest). Saved sign-ins and People stay hidden behind their flags.

## Proposal

### Reason codes

`DenyReason` is a closed list derived by the evaluator from the failing check or finding: `zone`, `device`, `risk`, `time`, `group`, `default-deny`, `rule`. `no-method` and `account-off` wait until the evaluator reads that state. A lookup maps each existing finding kind and break-in group onto a reason. It is never typed by an admin. Plain-word wording lives in one file so `ui-copy.test.ts` can check it.

### Deny message

`denyMessage` keeps working unchanged. Two optional fields are added to the rule: `denyAction` (a next step, chosen per reason or custom) and `denyContact` (defaults to the tenant's). The preview is What they see, ending on the real deny page: the message, the next step and the contact (the tenant's by default, `TENANT_DENY_CONTACT`). No reason and no reference: those are admin only.

### One text, three readers

- End user: message, next step, contact. Never the reason.
- Admin: the reason in plain words in the outcome line and Why, with Open rule and Fix in policy.
- Help desk: a denied sign-in opens the same Why view.

### How to get in

Inside Why, a denial offers the reroute chips that flip the answer ("From the office", "On a managed device"). Each is a what-if run by the same evaluator, so the advice is always the engine's own.

## Build order

1. `DenyReason` in the evaluator and the mapping from findings and break-in groups, with tests. Pure code.
2. Show the reason in the outcome line, Why and What they see. No new controls.
3. Next step and contact on the rule's Deny message, previewed in What they see.
4. Help-desk entry: person search and a Blocked filter on Past sign-ins, opening into Why.
5. "How to get in": reroute chips inside Why, pulled out of the Directions layout.

After the owner's review, in this order: Accept as expected for break-in attempts, a reasons report, audit export, report-only evidence per policy.

## Flag and rules

New controls sit behind `DENIAL_REASONS`, off in the showcase until the owner flips it. Tokens only, one orange button per view, no counts on tabs, sentence case, never "log in" in new text.

## Must-have versus later

Must-have now: steps 1 to 3. Then step 4. Step 5 follows. Everything under "After the owner's review" is later.

## Open decisions for the owner

1. Decided: contact is per tenant (`TENANT_DENY_CONTACT`) with a per-rule override.
2. Decided 5 Oct: no reference for the end user; the reason is admin only.
3. Help-desk lookup inside Access checks (recommended) or on its own page?
4. Should "How to get in" show to the end user as well, or only to the admin and help desk? Recommended: admin and help desk first, because the end user cannot act on a what-if.
