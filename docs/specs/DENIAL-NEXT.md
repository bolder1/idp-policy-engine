# Troubleshooting: what admins need next

Status: **built overnight, 5 to 6 Oct 2026**, in the 5181 worktree (`okta-device-policy-walkthrough-cea5b7`), uncommitted, behind flags. Follows `DENIAL-REASONS.md` (its steps 1 to 5 are built too). Proven by tests and a type check; **not yet looked at in a browser** (the Browser pane was hidden, which freezes the run).

## Who and what they need to get done

| Who | The job | Built |
|---|---|---|
| **Help desk** | "I can't get into Box": find the person's refusal, say why, say what to do, hand it on | Find a blocked sign-in; Sign-in activity (filters, detail, Open in Access checks); Copy summary in Why and in the activity detail |
| **IdP admin** | Fix a policy that blocks the wrong people without opening a hole | Fix in policy (already there); What changed in Why |
| **IdP admin** | Let one person in for a while | Let in for a while, from a refusal's Why |
| **IdP admin** | Know that a refusal is intended | Accept this result and Restore expectation on each break-in attempt |
| **Security lead** | See patterns and whether a change caused them | Reasons report on Sign-in activity; Changes view; What changed |
| **Compliance** | Prove why a person was refused, under which policy, and who changed what | Reason and deciding rule on every row; Export CSV of sign-ins and of changes; change log with who and when |

## What was built

Flags are in `screens/sign-in-tests/phase.ts`: `DENIAL_REASONS`, `TEMP_ACCESS`, `ACCEPT_ATTEMPTS`, all on.

1. **Accept as expected on the Access checks page.** On a break-in attempt row: Accept this result (a reason, who and when are recorded), and Restore expectation. Uses the existing acceptance model and store.
2. **Copy summary in Why.** Plain text for a ticket: who, where to, the answer, what decided it, the reason on a refusal, what else applies, how to get in. `why-summary.ts`.
3. **Let in for a while.** In a refusal's Why: an end date (up to 30 days) and a reason. The policy that refused gets a first rule for that person on 2 factors that **switches itself off after the date** (`Rule.tempAccess`, `ruleExpired`, evaluated on the sign-in's date). A toast with Undo. Not offered when the Global Default decided. `temp-access.ts`, `GrantForm.tsx`.
4. **Sign-in activity** (`screens/SignInActivity.tsx`, route `sign-in-activity`, opened from a row at the top of the Access checks form). The week's sign-ins across every application: result, reason (admin only), deciding policy and rule. Filters: search, result, reason, application. A row opens in place with Open in Access checks (loads the sign-in into the form, never runs it) and Copy summary. A **Changes** view lists who changed which policy. **Export** saves the current view as CSV.
5. **Reasons report.** On Sign-in activity: each reason with a count; pressing one filters to it.
6. **What changed.** On a refusal, Why lists edits to the policy that refused in the last 14 days (who, when, what). Needs the **change log**: the store now records every save and status change (`change-log.ts`, `store.changeLog`). The showcase tenant starts with four seeded entries (dummy data).
7. **Suggested next step per reason** in the Deny rule editor: one press fills the rule's Next step. Never added by itself.
8. **Find a blocked sign-in** now reads from the same activity model as Sign-in activity.

## Already there, so nothing to build

- **Self-lockout interlock.** The save guard ("Before saving") already reads "Your own and protected sign-ins" and blocks a save that would newly refuse the admin or a Protected saved sign-in, with a ready fix. Same idea as the design repo's interlock.
- **Staged rollout.** Monitor (report-only) is a policy status already.

## Not built, and why

- **Alerts when refusals jump after a change.** Needs a real sign-in log with time; the sample has no time dimension that moves with a change.
- **Evidence view ("this control was in place on a date").** Needs policy versions; the change log records changes but not full snapshots.
- **More reasons (no method enrolled, account off).** The evaluator does not read that state yet.
- **A setting screen for the tenant default contact.** It is one constant, `TENANT_DENY_CONTACT` in `data.ts`.
- **Real remediation links** (enrol a method, update the OS). Needs the end-user product.
- **Sign-in activity from a real log.** It is a modelled sample and says so.

## Rulings kept

- The reason and the `Ref:` code are **admin only**; the end user's deny page shows the message, next step and contact. (5 Oct)
- Nothing is committed. New controls sit behind flags. Tokens only, one orange button, no counts on tabs.

## Open decisions for the owner

1. Should a grant be capped at 30 days, and always ask for a reason? Built that way.
2. Does a grant on a policy with other temporary rules need a list of "what will expire"? `tempGrantsOf(policy)` exists; nothing shows it yet.
3. Is the change log's seeded history acceptable as showcase dummy data?
4. Should Sign-in activity live in the rail under Policies, or stay a link from Access checks? Built as a link.
