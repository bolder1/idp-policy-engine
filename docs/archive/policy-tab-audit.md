# Policy tab — audit against the IDP Policy Engine Framework doc

Scope: the **Policies** section of the console only — All Policies, the builder, Templates,
Zones, Device Fingerprint, Method Sets. Engine-side items (PDP/PEP split, single endpoint,
orchestrator) are named where the doc raises them but are not scored, because they are not
this tab.

Source: `IDP Policy Engine Framework` (May 13 2026 revision), §5 Design takeaways, §6
Proposed runtime flow, Customer Requirements, Gaps & Personas, Conclusion.

Verified against the code at `src/brand/`. Scorecard and §5 reflect the current state; §2 is the audit as first written, kept because the reasoning is what §3 was ordered from.

---

## 1. Scorecard

| # | What the doc asks for | State | Where |
|---|---|---|---|
| P3 | Ordered IF-THEN rule engine, first match wins | **Built** | `data.ts` `Policy.rules`, `simulate.ts` |
| P4 | Extensible condition set — a typed registry, not a schema change | **Built** | `CONDITION_CATALOGUE` (24 types, 8 groups), `rule-form.tsx` renders by `valueKind` |
| P5 | MFA *and* adaptive conditions on the same rule | **Built** | one `Rule` carries `conditions` + `decision` + factor spec |
| P6 | User chooses the primary factor | **Partial** | `firstFactor: 'Password' \| 'Any' \| 'Specific'` — no *list* of allowed primaries, no preview of the picker the end user gets |
| P7 | Custom AND via external API (Lenskart / Oberoi) | **Built** | `hooks.ts` — a library object like Zones. URL, method, auth header, timeout, response path, sync vs attribute-sync, and a required failure mode. Four linter checks; one seeded rule exercises it |
| — | SIB/HRS pattern 1 — user **state** as a first-class condition | **Built** | `auth-state`: First time login · MFA recently reset · No MFA configured · Normal |
| — | SIB/HRS pattern 2 — device **trust age** with a TTL | **Built** | `trust-age` (under/over N days) + `device-reg` + `fingerprint` |
| — | SIB/HRS pattern 3 — **dynamic THEN**, inherit the user's preferred method | **Built** | `secondFactor: 'preferred'` + `preferredFallback` |
| — | Authentication method chaining (n-factor) | **Built** | `secondFactor: 'chain'` + `methodChain` |
| G1 | Templates as a first-class path, not an afterthought | **Built, strong** | 13 scenarios inc. 3 multi-rule, `CreatePolicy`, `TemplateCard` preview, `Interview` (5 questions, tested over all 576 answer combinations) |
| G2 | "Used in" on shared objects | **Built** | Zones, Method Sets, Fingerprint and Hooks all name the referencing policies and rules |
| G3 | Copy a rule into another policy | **Built** | `CopyRuleDialog`, `store.copyRuleInto` — same-type targets only, warns where the copy would land unreachable |
| — | Plain-language summary generated from what was built | **Built** | review dialog reads the same condition array the editor writes |
| — | Report-only / shadow mode as a policy state | **Built** | `PolicyStatus` gains `'monitor'`; `enforces()` / `evaluates()` replace thirteen ad-hoc `!== 'inactive'` checks; offered at the publish gate |
| — | What-if simulator | **Built, and past what was asked** | Test policy, the 13-card gauntlet, the 1,440-situation impact sweep — all off one evaluator |
| — | Bulk: 700 IP ranges without collapsing | **Half built** | paste-many parses newline/comma/semicolon and separates IP from ASN (`zone-entries.ts`); **no file import, no rejection-list export** |
| — | Policy matrix — segments down, apps across | **Built** | `Coverage.tsx` |
| — | Rule rationale / description | **Built** | `Rule.description`, shown in both builders, the review summary and the read-end-to-end view; named by the save bar |
| — | Export / import policies as JSON | **Not built** | — |
| — | Priority across policies; assurance from more than one policy | **Not built** | policies are independent; no cross-policy ordering |
| — | Authentication strengths as an abstraction | **Arguably built under another name** | Method Sets decouple "what satisfies MFA" from "when MFA is required" — the same move Entra makes |

**Read:** the engine model and the Configurator's needs are in good shape. Everything SIB/HRS
asked for is expressible today. The holes are concentrated in three places — the Integrator
(P7), the Architect (rationale, JSON, cross-policy), and rollout safety (shadow mode).

---

## 2. The gaps that matter, ranked

> Written before any of this shipped. Items 1–5 are now built — see §5. Left as written
> because the ranking is the argument, and an argument edited after the fact to agree with
> what was done stops being evidence for having done it.

### Tier 1 — a named customer is blocked

**1. The webhook condition is a label, not a feature.**
Lenskart and Oberoi are the whole reason P7 exists. `{ id: 'webhook', operators: ['returns'],
valueKind: 'text' }` gives an admin one text box. There is no place to put the endpoint, the
method, the auth, the timeout, the shape of the answer, or — the one that decides whether this
is safe to sell — **what the engine does when the call fails**. A hook-gated rule has undefined
behaviour on the exact day it matters. The doc also asks for the *asynchronous* half (sync
attributes in, then write ordinary conditions against them); nothing addresses that.

**2. No rollout safety.** The doc lists report-only as an open question and says it "would
meaningfully de-risk rollout and should be cheap." It is also the mechanism §6.4 names for
migration — run old and new, compare, flip per tenant. Today the only way to learn what a
policy does is to switch it on.

### Tier 2 — a persona hits it every day

**3. No "Copy rule to…" (Gap 3 in the doc, unbuilt).** The Configurator's stated flow ends
with "goes to second policy → copies the rule they just built → adjusts one condition." That
last step does not exist. It is the cheapest item on this list and it is on the doc's own
critical path.

**4. Rules cannot say why they exist.** The Architect persona is defined by wanting a name, a
description and a rationale on every rule. Two of the three have nowhere to live. This is a
one-field model change with a large audit payoff.

**5. Fingerprint's "used in" is a count, not a list.** Zones got this right — it names the
affected policies before you save. Device Fingerprint says "3 policies reference this profile"
and stops, which tells you a change is dangerous without telling you where.

### Tier 3 — real, but survivable for a first version

**6. No file import for zone entries.** Paste-many covers most of the 700-range case
honestly. What is missing is upload and, more importantly, a **downloadable rejection list** —
240 bad rows reported on screen is a transcription exercise, not a fix.

**7. No JSON export/import.** Version control, diffs, review. Architect-only, but it is the
thing that makes an estate manageable at 5,000+.

**8. Primary-factor choice is a mode, not a list.** P6 asks for Okta's `allowedPrimary`
model — a list the login UI renders as a picker. `firstFactor: 'Any'` gestures at it without
naming which factors qualify.

**9. No cross-policy resolution.** §6.2 proposes "first-match-wins within scope, **priority
across scopes**." Policies are currently independent islands. Two live policies can reach the
same app+group with different answers and nothing surfaces it.

---

## 3. What to implement, in order

Sized against the existing code, not from scratch.

| | Item | Touches | Why here |
|---|---|---|---|
| 1 | **Copy rule to another policy** | `store.tsx` (one action), rule three-dot menu in v4/v0 | Half a day. Doc's Gap 3. Copy, not link — rule intent is policy-specific |
| 2 | **`description` on `Rule`** | `data.ts`, `rule-form.tsx`, review summary | One field. Unblocks the Architect's whole audit story |
| 3 | **Fingerprint "used in" → named list** | `DeviceFingerprintV2.tsx` — lift `policiesUsing` from `ZonesFinal.tsx` | Pattern already exists next door |
| 4 | **Webhook condition, properly** | `CONDITION_CATALOGUE` gains a `valueKind: 'hook'`; new editor: URL · method · auth · timeout · expected response · **on-failure (fail-open / fail-closed)** | Tier 1. The registry was built for exactly this kind of addition |
| 5 | **Shadow / report-only status** | `PolicyStatus` gains `'monitor'`; list badge; simulator already logs decisions | Tier 1. Cheap because the evaluator is already pure |
| 6 | **Zone file import + rejection export** | `zone-entries.ts` already parses; add upload and a CSV of what was rejected | Completes the bulk task mode |
| 7 | **Attribute sync as a condition source** | catalogue entry reading synced attributes + a freshness operator | The async half of P7 |
| 8 | **Policy JSON export/import** | `store.tsx` + a menu item | Architect |
| 9 | **`allowedPrimary` list on the decision** | `Rule.firstFactor` becomes a list; login-picker preview | P6, properly |
| 10 | **Cross-policy conflict surfacing** | derive from `Coverage.tsx`'s existing resolve walk | Precursor to priority-across-scopes; useful on its own |

Items 1–3 are a week and close three doc-named gaps. Items 4–5 are the ones a customer
conversation will hinge on.

---

## 4. Open questions the doc leaves, and where the product stands

- **"Tenant-global scope in addition to app+group?"** — Not modelled. The `Global Default
  Policy` is a system catch-all, not an authorable tenant-wide layer.
- **"Authentication strength abstraction now or later?"** — Effectively already shipped as
  Method Sets. Worth deciding whether to say so out loud, because it changes the answer.
- **"Report-only from day one?"** — Not built. Recommend yes; see item 5.
- **"Which 2FA end-user options move into the policy engine?"** — Boundary is drawn in code
  (`AUTH_METHODS.enabled` is tenant-wide; sets reference methods, never delivery variants) but
  the product question is unresolved.
- **"How many rule types?"** — 24 condition types across Network, Location, Time, Device,
  User, Group, Custom attributes, Webhooks.
- **"Method chaining for n-factor?"** — Built (`methodChain`).


---

## 5. Implemented

Items 1–5 of §3, in order. 298 tests green, build clean.

| | What shipped | Where |
|---|---|---|
| 1 | **Copy rule to another policy** — same-type targets only; says which position the copy lands in and whether it can fire from there, by running the real linter over the target-as-it-would-be | `builder-dialogs.tsx` `CopyRuleDialog`, `store.copyRuleInto` |
| 2 | **`Rule.description`** — optional rationale, surfaced in both builders, the review summary and the overview; `describeChanges` names it even though it changes no decision | `data.ts`, `rule-form.tsx`, `PolicyBuilderV4.tsx`, `changes.ts` |
| 3 | **Fingerprint "used by"** — a named list of policies and their rules, lifted from the zones pattern | `DeviceFingerprintV2.tsx` |
| 4 | **External hooks as a library object** — URL, method, auth header, timeout, response path, sync vs attribute-sync, and a **required** failure mode. Four linter checks, including the two that matter: a `deny` rule on a fail-open hook stops denying during an outage, and a non-deny rule on a fail-closed hook locks its users out | `hooks.ts`, `screens/Hooks.tsx`, `diagnostics.ts` |
| 5 | **Monitor / report-only status** — offered at the publish gate as the safer first move for a policy that has never been live. `enforces()` and `evaluates()` replace every ad-hoc `!== 'inactive'`, so a monitor policy is never counted as cover | `data.ts`, `kit.tsx`, `Coverage.tsx`, `Policies.tsx`, `review-step.tsx` |

**Still open**, from §3: zone file import + rejection export (6), attribute-sync as a condition source (7), policy JSON export/import (8), `allowedPrimary` as a list (9), cross-policy conflict surfacing (10).
