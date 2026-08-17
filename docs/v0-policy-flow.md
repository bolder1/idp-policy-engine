# V0 — the deployed prototype's policy flow, captured end to end

Walked on `xecurify-idp-prototype.vercel.app` by actually creating a policy:
New Policy → scenario → Name & App → builder → every toolbar surface. Read off
the live DOM, not from screenshots.

This is the reference for a faithful **V0** recreation, and the checklist v3
must clear.

---

## 1. Create modal — "Start from a scenario"

Subtitle: *Recommended for most admins*. A left list of scenarios grouped by
section, a right preview pane, and `Use this template →`.

| Section | Scenarios |
|---|---|
| **YOUR TEMPLATES** | Require MFA for all users · Adaptive device trust (90-day) · Block anonymized traffic |
| **QUICK PROTECTION** | Require MFA for all users `Identity` · Block access outside office network `Network` · Stricter auth for contractors `Identity` · Passwordless for executives `Identity` |
| **DEVICE-BASED** | Adaptive device trust (90-day) `Device` *(badged `RECOMMENDED FOR SIB/HRS`)* · Block compromised devices `Device` · Managed devices only `Device` |
| **RISK-BASED** | Step up on suspicious login `Risk` · Block anonymized traffic `Network` · New country detection `Risk` |
| **COMPLIANCE** | First login enforcement `SIB/HRS` `Identity` · Session limits for contractors |

Also present: `Search scenarios…`, and a file input (import).

## 2. Wizard — Name & App

Two labelled steps in a rail: **Name & App** → **Build rules**.

- *What should this policy be called?* — "Choose a name that reflects the app
  and user group this policy protects." Input placeholder
  `e.g. Finance Team – High Security`, pre-filled with the scenario name.
- *Which app does this policy protect?* — grid of 10 apps with protocol
  (`Salesforce SAML`, `GitHub Enterprise OIDC`, …), plus `Search your applications…`
- `Skip for now →` with "You can assign an app later from the builder."
- Footer: `Back` · `Create policy →`

## 3. Builder

**Breadcrumb** `Policies / <name>` · type badge `App Access` · a one-line
summary of the first rule: *"Not compliant with Corporate Managed → Deny"*.

**Toolbar:** `Decision log` · `Test policy` · `Assign apps (0)` ·
`Save as template` · `Review & Save`

**Warning banner** when unassigned:
*"No apps assigned — this policy isn't protecting anything yet. Assign apps →"*

**Flow column** — header `Flow`, caption *"Top to bottom. First match wins."*
```
User attempts login
   No match ↓
1  Block compromised devices    1 condition   Match →  Deny
   No match ↓
2  Off-network finance access   3 conditions  Match →  MFA
   No match ↓
   + Add Rule
   No match ↓
   Default Rule — Everyone      → Allow
```

**Editor column**
- `Applies to` — group chips (`🏷 All Employees`) + `+ Add group`
- `IF` `Conditions` with a live count *"~108 users match"*
- Condition rows: type · operator (`compliant with` / `not compliant with`) ·
  value · `+ Add condition`
- Caption *"When these conditions match…"*
- `THEN` `Apply when conditions match` — `Action set`
- `ACCESS DECISION`: **Deny** (Block access) · **1 factor** (One step) ·
  **2 factors** (Two steps)
- Explanatory copy per decision, e.g. *"Blocked users see an access-denied page.
  No MFA prompt, no alternate path."*
- ML note: *"The ML engine may escalate this decision based on behavioral
  signals. A Deny here is always final. Learn more →"*

**Reusable Objects rail**
- `ZONES` `+ New` — Office Network `IP` 6 · EU Countries `Geo` 2 ·
  Corporate ASN `ASN` 1 · Anonymizers `Proxy` 4 · `Import zones from file →`
- `DEVICE POSTURE` `+ New` — Corporate Managed `Strict` 3 · BYOD Baseline
  `Standard` 5 · Kiosk Devices `Minimal` 1
- `METHOD SETS` `+ New`
- every row has `+ Add`

## 4. Decision log

`Export CSV`. Filters: `All decisions` / `Allow` / `Deny` / `Challenge`, and
`Last 24h` / `Last 7 days`.
Summary line: *"Showing 10 evaluations — 4 allowed / 2 denied / 4 challenged"*.
Rows: time · user · app · matched rule · decision.

## 5. Test policy

- `SIMULATE FOR` — `Search for a user…` + Priya Sharma / Arun Patel / Contractor X
- `LOGIN CONTEXT`
  - **Connecting from** — Any location · Office Network · Outside all zones · Tor exit node · Known proxy
  - **Device** — New / unknown · Known < 90 days · Known > 90 days · Expired trust · Managed (MDM) · Non-compliant
  - **Auth state** — Normal returning user · First time login · MFA recently reset · No MFA configured
  - **Risk signal** — Low · Medium · High
- `Close` · `Run simulation`

## 6. Assign apps

Title *"Assign apps to &lt;policy&gt;"*, type filter tabs, the app list,
`N selected`, `Create new policy for this app →`, `Done`.

## 7. Save as template

`Template name` · `Description (optional)` · `Category` (Quick Protection ·
Device-based · Risk-based · Compliance · Uncategorized) ·
`THIS TEMPLATE INCLUDES:` + rule names · `Cancel` / `Save template`.

## 8. Review & Save

*"Review your policy"* — name, type, status `Inactive`, apps warning, then each
rule as prose:

> **1 Block compromised devices → Deny**
> IF: users in All Employees AND Not compliant with Corporate Managed
> THEN: → Access is blocked. No alternative path.

Ends with a `MULTI-GROUP USE` section. Commit: `Confirm & Save`.

---

## Gap analysis — what v3 still cannot do

v3 today covers: trigger step, ordered rule steps, condition picker, per-step
setup/warn/ready status, condition editing with typed value controls, outcome
choice, live impact with basis, per-step diagnostics, publish gating.

Missing against V0/v1, in the order they block a real user:

| # | Gap | Where it lives in V0 | Notes for the build |
|---|---|---|---|
| 1 | **Applies to / groups** | Editor column | `Rule.appliesTo` already exists and `impactOf` reads it — v3 renders the audience but cannot edit it. Highest-value gap: every rule has one. |
| 2 | **AND / OR joiner** | Condition rows | `Condition.joiner` exists in the model and `diagnose` has a `mixed` warning for it. v3 shows the joiner in the sentence but offers no control. |
| 3 | **Assign apps** | Toolbar + warning banner | `Policy.appIds` / `allApps`. Also needs the "not protecting anything" banner. |
| 4 | **Review & Save** | Toolbar | Prose rendering per rule. v1 has `ReviewDialog`, `ruleSentence`, `summarize` — module-private, so lift or re-implement. |
| 5 | **Test policy** | Toolbar | The four context axes above. v1 has `TestDrawer` + the trace walk (reduced-motion safe, budget-capped). |
| 6 | **Decision log** | Toolbar | Seeded `LogEntry[]` already in `data.ts`. Filters + CSV export. |
| 7 | **Save as template** | Toolbar | Writes to the template list. |
| 8 | **Reusable objects rail** | Right rail | v2 has this in its palette; v3 has no home for it yet — likely a picker section rather than a permanent rail, since v3 has no third column. |

**Two things v3 already does that V0 does not**, worth keeping when closing the
gaps: per-step status with publish gating (V0 lets you save an unfinished
policy), and `impactOf`'s `basis` flag, which marks an estimate as an estimate
where V0 prints `~108 users match` with no such qualification.
