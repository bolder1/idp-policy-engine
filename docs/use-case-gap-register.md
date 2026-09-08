<!-- Generated 2026-09-08 by auditing the engine against:
       - ruleset-usecase-scenarios.md (v1.4, 23 scenarios, 18 cross-scenario findings)
       - "Rule Based Condition parameters (2).xlsx" (the approved condition sheet)
     Every count was re-verified against the checkout rather than taken on trust.
     The 23 scenarios are seeded in data.ts as of the same commit, so the
     "app/group does not exist" gaps the per-tier reports listed are closed. -->

# IdP Policy Engine — Consolidated Gap Register

**Against:** the ruleset use-case document (23 scenarios, 18 cross-scenario findings) and the approved condition-parameter sheet.
**Sources:** five per-tier mapping reports + one catalogue-delta report, deduplicated. Every count below was re-verified against the working checkout on 2026-09-08, not taken from the reports.

## What changed since the mapping reports were written

The reports are stale in three specific ways, and the staleness is good news:

- **The 23 scenarios are already seeded.** `src/brand/data.ts` and `src/brand/hooks.ts` are modified-uncommitted on `main` and now carry 26 scenario policies (`uc1`–`uc4`, `s5-*`…`s23-*`, `break-glass`, `notice-period-*`, `japan-travel`, `hybrid-work`, `privileged-gateway`), 16 new apps, 15 new groups, 3 new zones (`office-cidr`, `corp-network`, `sanctioned`), and the `hk-hr-suspended` hook. The "app does not exist" gap that appears in all five reports is **closed** — and the appIds were rewired (`google-workspace` ×4, `payroll` ×2).
- **The groups were added and never wired up.** 15 new groups exist; the policy audiences still target the original five plus three temporaries, and the substitution comments are now false (`s5-devops` still says *"'DevOps' does not exist"* while `devops` sits in the array). **13 of the 15 new groups have zero directory members**, so a policy retargeted at them would simulate against nobody.
- **`(A OR B) AND (C OR D)` is reachable from the builder**, not just from the model. The S16–20 report flagged this as unverified on the strength of a comment. `when-ops.ts:317` `setOuterJoin` explicitly skips cards that `drawsAsBracket` — grouped cards keep their own joiner — and `flipBranchJoin` (`when-ops.ts:278`) sets a branch's joiner independently. Group two branches, flip each to OR, set the trunk to AND. Only the exported *code* helpers (`when`, `card`, `namedCard`) can't express it.

`rule()` is still module-private (`data.ts:914`), which is why the fixtures had to be written inside `data.ts`. All 28 fallbacks are named `'Default rule'` against `FALLBACK_NAME = 'Nothing else matched'` (`data.ts:2832`).

## The headline number

I walked every rule in the 23 scenarios against the 16 condition types `simulate.ts` actually evaluates, then hand-corrected the two OR-cards a mechanical scan gets wrong (`hybrid-work` r2, `privileged-gateway` r1):

> **30 of the 50 non-fallback rules across the 23 scenarios can never match.** Eleven scenarios deny their entire audience in the Test dialog, the Gauntlet, the Impact arena and the board rehearsal. Five more are degraded. Seven evaluate end to end.

| | Scenarios |
|---|---|
| **Denies its whole audience** (every rule inert) | S1, S2, S6, S10, S11, S13, S15, S16, S17, S22, S23 |
| **Degraded** (some rules inert) | S7, S14, S19, S20, S21 |
| **Evaluates end to end** | S3, S4, S5, S8, S9, S12, S18 |

---

# The register

Ranked by scenarios affected, then by whether the scenario is defeated or merely degraded. Sizes: **S** = a field and a control (days). **M** = a subsystem (1–2 weeks). **L** = a shape change (weeks, touches navigation or semantics).

---

### G1 · Twelve condition types are authorable and never evaluate
**Required:** the sheet's IP, Day, Device type, MAC, OS, Browser, Lat/Long, Device count, Posture, Custom attrs, Group attrs and Webhooks are conditions the product provides.
**Today:** `evalCond` has cases for 16 types only (`zone, country, state, city, fingerprint, mdm, device-reg, trust-age, ml-risk, device-risk, auth-state, user-type, user-role, group, user, time`). Everything else hits `default: unknown(...)`, and `unknown` is not a pass — correctly, so a card containing one can never carry a match.
**Scenarios:** 16 — S1, S2, S6, S7, S10, S11, S13, S14, S15, S16, S17, S19, S20, S21, S22, S23. **Eleven of them denied entirely.**
**Kind:** MODEL (evaluator). **Size:** L (twelve cases, several needing context fields the sign-in `Ctx` does not carry).
**Note:** this is the single highest-leverage item in the register. Until it lands, no other gap can be *seen* — a "miss" and a "could not decide" are indistinguishable in every reasoning surface the console ships.

---

### G2 · No assignment layer; precedence is store-array order
**Required:** a reusable Policy with no app or group target, linked by `app_login_policy_assignment` rows carrying `assignmentPriority`; enforced super-admin assignment first, then lowest-priority specific-Group match, then the Default Group assignment; exactly one enabled default assignment per Application.
**Today:** `Policy` carries both things the doc forbids — one `appId` and its own `audience`. `policiesForApp` returns store order and `orderOf` numbers them 1,2,3 by array position; **audience is never an input to selection.** `walk()`/`decide()` take one already-chosen policy; out-of-audience returns *that policy's own* fallback, never a fall-through. `coversEveryApp = p.isSystem === true` — one tenant fall-through, and it allows on one factor. Five apps carry colliding policies today (`google-workspace` ×4, plus `payroll`, `github`, `aws`, `salesforce`).
**Scenarios:** named by all 23; **defeats S5** (the scenario *is* assignment selection), **S16** (App: All Apps is unrepresentable), **S17** (two apps → two duplicate policies), **S18** and **S22** (specific-Group-beats-default is the stated break-point).
**Kind:** MODEL + UI. **Size:** L.

---

### G3 · `DENY(reason)` has no reason
**Required:** `DENY("Register this device first")` — the message is the remediation.
**Today:** `AccessDecision = 'deny' | '1fa' | '2fa'`. No `reason`/`message` on `Rule`; `description` was deliberately removed. Every denial string in the fixtures is smuggled into the rule name or a comment. `Policy.configIssue` is an admin config warning, not a user-facing outcome.
**Scenarios:** 20 (every scenario with a DENY). Degrades all; in S11 and S15 it makes two structurally different denials indistinguishable to the user.
**Kind:** MODEL + UI. **Size:** S.

---

### G6 · Two method vocabularies, a singular 1F slot, and no factor class
Three faces of one problem; ranked here on the first, which is a live data-loss bug.
**a) Drift.** The rule editor reads a hardcoded seven-name `METHODS` (`rule-form.tsx:128`); the catalogue and the "Used in N rules" join read the 28-name `AUTH_METHODS`, **by name**. A rule storing `'Google Authenticator'` counts in the catalogue and renders **no chip** in the editor — and the next click on any chip rewrites `secondFactorMethods` without it. The seed already has this bug (`finance-high`). Every method name in every fixture is unbuildable through the console.
**b) The 1F slot is one string.** `firstFactorMethod?: string` singular vs `secondFactorMethods?: string[]` plural. `1F: ALLOW_SPECIFIC [FIDO2, Password]` — mixed mode — cannot be written.
**c) No class enforcement.** `AuthMethod.use: 'primary' | 'second'` exists and no rule field consults it; the editor offers the same seven names for the first factor. The doc's 1-factor class has eight methods; only three carry `use: 'primary'`.
**Scenarios:** (a) 20; (b) S19 fatal for rule 1's point; (c) S6, S7, S19.
**Kind:** (a) UI/data — **S**. (b)+(c) MODEL + UI — **S/M**.

---

### G7 · The Default Rule is a full Rule in the type and a token in the engine
**Required:** the Default Rule is a full Rule with any action; a missing default Policy or Default Rule is invalid configuration — publish must reject it, runtime returns `ERROR` and fails closed.
**Today:** `fallbackOf = (p) => p.fallback?.decision ?? '1fa'`. The fallback's `firstFactor`, `secondFactor`, `secondFactorMethods`, `methodChain`, `rememberMfa`, `rememberDays` are stored and read by nothing. A **missing** fallback allows on one factor — all eleven pre-existing seeded policies are in that state. `diagnostics.ts` walks `policy.rules` only, so the Default Rule is **never linted** and cannot block a publish. The name is pinned to `FALLBACK_NAME` while 28 fixtures write `'Default rule'`.
**Scenarios:** all 23 plus the pre-existing estate; materially wrong for S7, S8, S19 (whose Default Rules ALLOW with a chain).
**Kind:** MODEL. **Size:** S/M. Cheapest correctness win in the register.

---

### G14 · IP is one untyped, single-valued text box
**Required:** four sheet rows — IPv4 single, IPv4 range, IPv4 CIDR, IPv6 range — multi-valued.
**Today:** one `ip` row, `valueKind: 'text'`; the control writes `onValues([e.target.value])` — exactly one string, always. No form validation (a typo'd CIDR saves clean), no CIDR semantics, no `in` operator (multi-value OR is an unnamed convention on `is`). The only working path is a Zone, which is a different authoring gesture.
**Scenarios:** 12 — S1, S5, S7, S9, S11, S13, S14, S16, S17, S19, S22, S23.
**Kind:** MODEL + UI. **Size:** M. Pairs with G1 (the evaluator case) — fix both or neither.

---

### G4 · Session controls: re-auth frequency, and sub-day MFA memory
**Required:** `SetReAuthFrequency(15min | 2h | 4h | 8h | 12h | 24h)` and `SetRememberMfaTimeout(0 | 15min | 1h | 1d | 7d | 30d)`.
**Today:** `SetReAuthFrequency` has **no field of any kind** — not on `Rule`, not on `Policy`. `rememberDays` is days-only and the editor floors it at 1; `rememberMfa: false` + `forceMfaEachLogin` is the only "0".
**Scenarios:** 10 — S8, S9, S10, S13, S15, S16, S17, S20, S21, S23.
**Why it bites harder than "a missing field":** in **S10** and **S15** the re-auth interval is the *only* difference between two rules of a deliberate degradation ladder. Drop it and the rules emit byte-identical actions — and `diagnostics.ts` PE101/PE102 then flag the correct policy as duplicative. In **S16** the 15-minute interval is the entire security argument for a password-only break-glass rule.
**Kind:** MODEL + UI. **Size:** S/M.

---

### G15 · Named list objects stop at Zone
**Required (finding #12):** central named lists — `office-networks`, `sanctioned-countries`, `floor-terminals` — referenced by rules; edit once, applies everywhere.
**Today:** four library objects exist (Zone, Hook, FingerprintProfile, MethodSet) with usage counts and delete guards — the right architecture. But **`MethodSet` is referenced by no `Rule` or `Policy` field** (wired to the store and to nothing else), there is no MAC allowlist object, and an IP list inside a rule is inline `string[]`. The seed now has `office-cidr`, `corp-network` and `sanctioned` zones, which closes the worst of it for networks and countries.
**Scenarios:** 8 — S10, S13, S14, S17, S19, S20, S22, S23.
**Kind:** MODEL + UI. **Size:** M.

---

### G20 · The linter misses the checks the doc asks for, and fires on correct encodings
**Missing:** OR-of-trust-signals on an ALLOW path (finding #11); a risk condition with no step-up node; a spoofable attribute used to *relax* security (finding #5); a referenced method that is unconfigured or inactive (PE122 only checks the array is non-empty); an attribute not in a tenant schema; a missing or invalid Default Rule (G7).
**False positives:** PE101/PE102 flag S10 r1/r2 and S15 r2/r3 as duplicates *because* the distinguishing sub-action has no field (G4). PE111/PE112 flag S12's duplicated leaf, which is the canonical `A AND (B OR C)` encoding. The honest response to S8's missing `HELPDESK` role — writing `Admin` twice — is blocked by PE101.
**Scenarios:** 7 — S4, S8, S10, S12, S13, S15, S22.
**Kind:** MODEL (diagnostics). **Size:** M. **Sequencing:** must follow G4 and G5, which delete half the false positives for free.

---

### G10 · Closed option lists a tenant cannot extend
**Required:** tenant role vocabularies, ISO-3166 countries, the posture checks an MDM actually reports, OS/browser versions.
**Today:** `ConditionType.options` is a compile-time array. `user-role` is four words (`Admin, Manager, Member, Auditor`). `country` is five friendly display names, not ISO codes. `posture` is five named checks. `os`/`browser` have no version comparator. `state`/`city` are four each.
**Scenarios:** 6 — and four of them lose a whole row: **S8** (`HELPDESK` has no near-miss), **S20** (`jailbroken` does not exist, so one of four red flags is simply gone; sanctioned countries are not offerable), **S23** (three legal roles absent), **S10** (`os_patch_age_days < 30` collapses into a vendor boolean). Plus S3, S18.
**Mitigation already present:** `Zone.location.countries` is a free `string[]`, so Japan and a sanctioned list *can* be said via a zone.
**Kind:** MODEL + UI. **Size:** M.

---

### G12 · Operator poverty, and one risk signal split into two
**Required:** `>=`, `<=`, `=`, `≠` on numerics; `IS_NULL` / `IS_AVAILABLE` (finding #2); one "Risk score (Device Score / Device Trust) (AI included)" row.
**Today:** `above`/`below` only, so `>= 70` is written `above 69` — an integer-only hack. No null operator anywhere, so a provider-failure guard rule cannot be authored and S12's "could not assess risk" default is unreachable. Risk is two conditions: numeric `device-risk` and enum `ml-risk`, and `RISK_SCORE = {Low:12, Medium:48, High:86}` quantises every threshold to three points — S12's tiers land correctly by coincidence; `<50`, `<60` and `<70` are all the same rule.
**Scenarios:** 6 — S11, S12, S15, S18, S20, S23.
**Kind:** MODEL. **Size:** S. The catalogue-delta report already specifies the risk merge and its migration arithmetic.

---

### G8 · A user is in exactly one group
**Required:** multi-group membership; finding #1's collision case; a group that is a *condition* (`On-Call`, `Matter-Acme`) read inside a policy targeted at a different group.
**Today:** `User.groupId: string`, singular. `inAudience` and the `group` condition both test that one string. **S21 is unrepresentable end to end**: its audience is Engineering and its rule asks for On-Call, and no user can be both. Compounding it, 13 of the 15 new groups have no directory members at all, and `reach()` does not dedupe overlapping groups (it sums).
**Scenarios:** 6 — S5, S10, S12, S14, S15, S21 (S21 fatal).
**Kind:** MODEL + seed. **Size:** M. *(Derived finding: the S21 report did not name it; the mechanism is established in the S10–15 report.)*

---

### G5 · Custom attributes cannot name an attribute, and have three of five operator families
**Required (sheet, verbatim):** *"operators: equality, greater or less than, contains, date range, boolean"* over `email, username, designation, age, years of experience, team`.
**Today:** `Condition = { id, typeId, operator, values, scope? }` — **no key.** Two `user-attr` rows in one card are, to the model, the same attribute compared twice. Operators are `is / is not / contains`. No types, no date, no `today`. `user-attr` and `group-attr` appear in `CONDITION_ORDER` and the catalogue and **nowhere else in the codebase** — no picker, no renderer, no evaluator.
**Scenarios:** 5 — S9, S13, S16, S22, S23. **Fatal for S13, S22, S23.** In S22, deleting the unrepresentable `probation_until < today` makes rules 1 and 2 byte-identical: the missing operator does not degrade the policy, it deletes a tier of it.
**Kind:** MODEL + UI. **Size:** M. **A full spec already exists** in the catalogue-delta report: `Condition.key`, `ConditionType.attrKeys`, `ATTR_OPERATORS`, `operatorsFor()`, plus the five call sites and the two `NEGATIONS`/interval-containment adjustments in `diagnostics.ts`.

---

### G9 · There is no timezone
**Required:** the sheet's row is *"Time (including timezone)"*; finding #6 asks for a policy-defined IANA zone, never client-reported.
**Today:** `time` is two `HH:MM` strings evaluated against a bare `ctx.nowMinutes`, hinted as "the tenant's timezone" — one implicit tenant clock, stored nowhere and selectable nowhere. DST is therefore also unmodellable.
**Scenarios:** 5 — S2, S17, S21, S22, and **S14, which cannot be expressed at all**: three regional offices in three IANA zones inside one policy become three windows on one timeline, so rules 2 and 3 are simply wrong.
**Kind:** MODEL + UI. **Size:** M.

---

### G18 · No provider model: no TTL, no freshness, no named instances
**Required:** attribute freshness (User Role TTL ≤ session), revocation latency = MAX(provider TTLs) (findings #8, #14), and two named instances of one provider with different fail-modes (`mdm-posture-strict` fail-closed, `mdm-posture-lenient` fail-open).
**Today:** `Hook` has `timeoutMs`, `onFailure` and `maxAgeHours` — genuinely good, and see the honest list below. **Nothing else has a provider object at all.** MDM, posture, risk, directory role, group membership and custom attributes have no instance, no TTL and no fail-mode.
**Scenarios:** 5 — S8, S10, S15, S21, S23.
**Kind:** MODEL. **Size:** L.

---

### G19 · Nothing is time-bounded
**Required:** temporary group membership that expires on a date (finding #9); a policy retired post-integration while immutable revisions remain for audit.
**Today:** `Group = { id, name, memberCount }` — no member list, let alone a dated one. `Policy` has `lastModified` (a fabricated display string) and `modifiedBy`. No version id, no publish record, no revision pinning, no expiry.
**Scenarios:** 4 — S15, S17, S18, S21.
**Kind:** MODEL + UI. **Size:** M.

---

### G11 · The webhook comparison lives on the hook, not in the rule
**Required (sheet, verbatim):** *"webhook DEFINED OUTSIDE the rule, attached to it; **the response comparison is defined in the rule**; timeout configurable"*.
**Today:** exactly inverted. The condition's operators are `returns true` / `returns false`; the field being read is `Hook.responsePath` on the hook object. `webhook(hr-system).contract_status = 'expired'` is three things — a reference, an output key and a comparison — and the condition holds one. Consequence: one hook per comparison, defeating the reuse argument that made hooks library objects; and the rule reads `webhook returns true` with no visible predicate. The seeded `hk-hr-suspended` hook in this checkout is a monument to the gap — its own description says the comparison had to move inside it.
**Scenarios:** 3 — S11, S15, S20. Fatal to the rule's *meaning* in all three.
**Kind:** MODEL + UI. **Size:** M. **A full spec already exists** in the catalogue-delta report: `Condition.key` + `Condition.operand`, `Hook.outputs[]`, `responsePath` demoted to a default, plus the `validateHook` relaxation and a PE130 sibling for an undeclared key.

---

### G22 · No enrolment filtering, no save-time method validation
**Required (finding #16):** filter to enrolled alternatives at runtime; if none remain, fail closed with a remediation outcome rather than silently weakening the rule. An "Other" authenticator must be configured before a rule may reference it — un-configured reference is a save-time error.
**Today:** `secondFactorMethods` is `string[]` matched by name against `AUTH_METHODS` at render time. PE122 checks only that the array is non-empty. `AuthMethod` has `configured`/`active`/`allowed` flags that no rule check consults. A typo yields an unsatisfiable rule with no error. There is no fail-closed configuration outcome in `AccessDecision`; `allowDisable2fa` is the only nearby field and it means the opposite thing.
**Scenarios:** 3 — S3, S13, S19. **Kind:** MODEL + UI. **Size:** M.

---

### G23 · No attribute trust tier
**Required (finding #5):** mark each attribute with a trust tier in the builder; lint when a spoofable attribute is used to *relax* security.
**Today:** `ConditionType.agent?: true` is a *capability* flag ("needs an agent to read"), not a *spoofability* flag. Nothing distinguishes an MDM-attested OS from a UA-derived one — which is **S6's entire stated safety argument**. In S13, `mac` and `browser` carry the *lightest* chain, exactly the case the doc wants linted.
**Scenarios:** 3 — S4, S6, S13. **Kind:** MODEL + UI. **Size:** M.

---

### G16 · `DISALLOW [list]` has no home at any level
**Required:** a whole-Policy method constraint — S20 bans five phishable second factors on a PAM gateway; S10 bans four on a cloud console.
**Today:** no method field on `Policy`. `Rule.secondFactorMethods` is a per-rule *allow*-list. `MethodSet` exists as a library object and is referenced by nothing (see G15). The only workaround is enumerating the complement into every rule — silently absent from any rule that omits it, and silently re-admitting anything added to the catalogue later.
**Scenarios:** 2 — S10, S20. For S20 the constraint *is* the security control.
**Kind:** MODEL + UI. **Size:** M.

---

### G21 · No step-up node
**Required:** `StepUpIfRiskAbove(70) → 2F: miniOrange Push` — admin-authored, visible, re-fetching risk at its own execution point.
**Today:** no conditional node inside an action, no mid-flow re-fetch. `secondFactor: 'chain'` + `methodChain[]` is an *unconditional ordered sequence* and is a name collision, not the doc's CHAIN.
**Scenarios:** 1 — **S12, whose title is "Risk-Score Tiered Access with Step-Up".** Both available encodings are wrong: `'1fa'` drops the step-up (a session whose risk spikes to 90 completes on one factor); `'2fa'` over-enforces on the exact population the rule exists to relieve.
**Kind:** MODEL + UI. **Size:** L.

---

### G17 · No two-phase evaluation *(ranks last by the stated rule; read the note)*
**Required:** the framing of the whole document. Ambient vs identity-bound classification per condition; a Phase-1 candidate set producing `REQUIRE_1F`/`REQUIRE_2F` rather than a terminal ALLOW; ambient evidence pinned; pre-auth DENY restricted to ambient hard-blocks; webhook and risk providers not called in Phase 1; `candidate_set_created` / `candidate_eliminated` / `final_rule_selected` audit events.
**Today:** none of it. `ConditionType` carries `agent?` and nothing about when a condition may be read. `walk()` is one top-to-bottom pass. `LogEntry.chain` is a first-match trace with prose outcomes.
**Scenarios:** named in all 23 and **blocks none from being authored**, which is why it ranks here.
**Why the ranking misleads:** it bites concretely today in S20 (the HR webhook fires on unauthenticated probes — cost, DoS surface, info leak), S9 (unauthenticated probes can enumerate per-user policy), and S11/S15 (providers called pre-auth). The classification *flag* is cheap; the phased evaluator is not.
**Kind:** MODEL. **Size:** L.

---

### The tail — small, real, and cheap
| Gap | Today | Size |
|---|---|---|
| `coords` is a radius with no centre | `valueKind: 'range'` renders one number box hardcoded to `km`. No latitude field, no longitude field. The sheet's Lat/Long row does not work. | S |
| `group-attr`, `device-count` are labels | Catalogue rows with zero call sites, no renderer, no evaluator. | S |
| `posture` is mis-flagged | `agent: true` on a check the row's own hint says an *MDM* reports. The flag tells the author the condition is inert on an agentless estate — which is false. | XS |
| `posture` cannot AND | Multi-value ORs, so "disk encrypted AND screen lock" needs one row each. No "all of" operator. | S |
| `mdm` has no third state | `['Enrolled','Not enrolled']` — nowhere for "MDM did not answer". | S |
| `secondFactor` has no `'none'` | Required field, so every `1fa` rule carries a meaningless `'any'`. | XS |
| No `IN` operator named anywhere | Multi-value set membership is an unnamed convention on `is`; the vocabulary says equality. | XS |
| `matchEstimate` is authored | A hand-written integer nothing recomputes; `reach()` sums overlapping groups without deduping. | S |
| `rule()` unexported; `FALLBACK_NAME` | Fixtures must live inside `data.ts`; 28 of them violate the one-legal-name constant. | XS |
| Helpers can't build an OR group | `card()`/`namedCard()` take no join; `when()` sets none; `emptyGroup()` returns a group the publish gate blocks (PE320). The *builder* can do it; the exported API cannot. | S |

---

# What the engine already gets right

Honest in both directions. Several of these are **ahead of the document**.

1. **`unknown` is not a pass.** `evalCond` returns three states and refuses to claim a match on a fact it never had. This is the correct call, and it is the reason G1 is visible rather than silent. Do not "fix" G1 by making unknown permissive.
2. **`Hook.onFailure` is required, has no default, and is linted.** `'fail-open' | 'fail-closed'`, the create form refuses to save without it, and PE131/132/133 report the three consequences ("this rule stops denying when the hook is unavailable"; "an outage locks these users out"; latency). The doc only asks for provider fail-modes in S10/S15 — the engine got there first, for hooks.
3. **Named library objects with usage counts and delete guards.** Zone, Hook, FingerprintProfile, MethodSet, plus `usage.ts:policiesUsing` and a real "what depends on this" answer. Finding #12's *architecture* is present; only its coverage is short.
4. **`ZoneScope` (`'ip' | 'location'`).** A genuinely good separation of "where the packet came from" from "where the map says" — better than the doc's own model, and the right remedy for S3's stated break case. `Zone.location.countries` being a free `string[]` is what makes Japan and a sanctioned list sayable at all.
5. **The predicate carries more shape than the doc's builder promises.** Per-level joiners give `ANY OF (X, Y)`, `A AND (B OR C)`, and `(A OR B) AND (C OR D)` — verified reachable from the builder, not just the model. `grouped` and `label` exist for finding #11's readability ask. Two-level DNF is sufficient for S21–S23 with margin; S19 and S20 are where the shape gets tested and it holds.
6. **`Policy.fallback` is typed as a full `Rule`.** Finding #3 ("Default Rule ≠ always DENY") is right in the type. The evaluator has to catch up (G7), but the modelling decision is already made and argued in the file.
7. **Audience and rule conditions are separate mechanisms.** Finding #15 — a fast-rotating operational group belongs in a *condition*, never as an assignment target — is satisfied by construction. (The directory then can't populate it: G8.)
8. **A real simulator, a gauntlet, an impact arena and a publish gate.** Finding #7 asked for a rule simulator; `walk` produces a step-by-step trace with per-rule hit / miss / unreached / off and a reason string, and PE104 flags shadowing statically. The diagnostics families (PE1xx/PE3xx) are a genuine blocking model, not decoration.
9. **Multi-value OR is correct**, including the wrap-midnight time window.
10. **`monitor` status** is the rollout mechanism the doc's §6.4 asks for and does not name.
11. **Deliberate, argued modelling choices** that a naïve sheet-conformance pass would break: `device-reg`'s third `Unregistered` state (two shipped scenarios depend on it), the refusal of `appIds: string[]`, the deletion of the synthetic `all` group, the removal of `Rule.description`. Each is documented in-file with its reasoning. Treat the catalogue-delta report's proposed removals (`user`, `fingerprint`) as **rejected** — both have silent failure modes documented there.

---

# Recommended order of work

### Tier A — make the 23 readable at all *(nothing else can be judged until this lands)*

Today a designer opening the console sees 26 new policies, 11 of which deny everyone and 5 of which are half-dead, and **cannot tell which of those are engine gaps and which are fixture bugs.** That is the state to leave first.

| # | Work | Gap | Size | Why first |
|---|---|---|---|---|
| A1 | **Teach `evalCond` the twelve missing types.** If it must be staged: `ip`, `day`, `os`, `device-type` first (they free S1, S2, S6, S7, S14, S16, S17, S19, S21), then `posture`, `webhook`, `user-attr`, `browser`, `mac`. | G1 | L | 30 of 50 rules. Everything below is invisible until this is done. |
| A2 | **Multi-group membership + populate the directory + rewire the audiences.** `User.groups: string[]`, then point each scenario policy at the group the document names and give the 13 empty groups members. | G8 | M | The groups were added and never used. Without this, retargeting a policy at `devops` simulates against nobody, and S21 stays unrepresentable. |
| A3 | **Collapse the two method vocabularies into one** — delete `rule-form.METHODS`, read `AUTH_METHODS` filtered by `use`. | G6a | S | A day's work that stops the editor silently deleting stored method names, and makes every fixture buildable through the console for the first time. |
| A4 | **Read the whole Default Rule; lint it; make a missing one a publish blocker that fails closed.** | G7 | S/M | The tenant's current safe default *allows on one factor*. This is a correctness bug in the shipped estate, not just a scenario gap. |
| A5 | **Export `rule()`; settle `FALLBACK_NAME` vs `'Default rule'`.** | tail | XS | Lets the 23 fixtures leave `data.ts` and stops 28 policies violating a stated invariant. |

### Tier B — make them faithful

Ordered by witnesses ÷ size, with two deliberate exceptions.

| # | Work | Gap | Size | Note |
|---|---|---|---|---|
| B1 | `DENY(reason)` — a field, a control, and the trace/prose surfaces that print it | G3 | S | 20 scenarios; currently smuggled into rule names. |
| B2 | Session controls: `reAuthMinutes` + a sub-day remember window | G4 | S/M | 10 scenarios, and it un-collapses S10's and S15's ladders — which also deletes two linter false positives. |
| B3 | Custom attributes: `key` + `attrKeys` + typed operators | G5 | M | **Spec is written.** Unblocks S13, S22, S23 outright. |
| B4 | Webhook: `key` + `operand` + `Hook.outputs` | G11 | M | **Spec is written.** Same PR shape as B3 — they share `Condition.key`, so do them together. |
| B5 | Operators `>= / <=`, `IS_NULL`, and merge risk into one numeric row | G12 | S | Small, and it removes the off-by-one hacks from S12 and S20. |
| B6 | IP typing: four forms, validated, genuinely multi-valued, with an `in` operator | G14 | M | Pairs with A1's `ip` case. |
| B7 | Tenant-editable option lists (roles, countries as ISO, posture checks incl. jailbreak/patch-age) | G10 | M | Four scenario rows are currently *absent*, not approximated. |
| B8 | Policy-defined IANA timezone on the time condition | G9 | M | S14 is unrepresentable without it. |
| B9 | 1F as a set + factor-class validation; policy-wide `DISALLOW` by wiring `MethodSet` to a rule/policy field | G6b/c, G16 | M | One piece of work — both are "the factor plan has no structure". |
| B10 | MAC and CIDR list objects | G15 | M | |
| B11 | **The assignment layer** | G2 | L | Late in the tier *despite* ranking second, because it is the only Tier-B item that changes the console's navigation and its "which policy governs whom" story. Do it when the cheap fidelity work has stopped moving. |
| B12 | Linter: add the six missing checks, retune the four false positives | G20 | M | **Last in the tier by necessity** — half the false positives disappear once B2 and B3 give the rules a field to differ on. |

### Tier C — later, or decide now and build later

| Work | Gap | Why not now |
|---|---|---|
| **Classify every condition `ambient` \| `identity-bound`** | G17 (half) | Do this one **now**, in Tier B if you can. It is a flag on `ConditionType`, it costs almost nothing, and it keeps the two-phase option open. The phased evaluator itself is the expensive half. |
| Phased evaluation, candidate sets, `REQUIRE_1F/2F`, phase audit events | G17 | L, and it re-shapes `walk`, the trace, the log and the simulator at once. Blocks no scenario from being authored. |
| Provider objects: TTL, freshness, named instances, fail-mode beyond hooks | G18 | L. The concept already exists correctly for hooks — generalise it once the condition catalogue has stopped moving. |
| Revisions, publish records, membership and policy expiry | G19 | M/L, and it is an audit story more than a policy story. |
| Step-up node / conditional second factor | G21 | L for one scenario. Worth flagging to the doc's authors as a scope question before building. |
| Enrolment filtering + save-time method validation | G22 | Follows B9 — it needs the factor class first. |
| Attribute trust tiers + the lints that depend on them | G23 | Follows B12. |
| The tail: `coords` lat/long, `posture` agent flag, `mdm` third state, `group-attr`/`device-count` | tail | An honesty pass on sheet rows nobody's scenario uses. A day, whenever. |

**One sequencing warning.** B11 (assignment) and A1 (evaluator) both touch what the simulator means. Do A1 first: a precedence model whose per-policy verdicts are wrong is harder to review than no precedence model at all.