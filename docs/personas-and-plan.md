# Personas × the Policy tab — coverage, and what is left

Scope: the **Policies** section only. Personas are from the framework doc's *Gaps & Personas*
and *Conclusion*.

Everything below is generated from `src/brand/personas.ts`, and `src/brand/personas.test.ts`
asserts it. A need nobody built is a failing test, not a line in a document somebody has to
remember to re-read.

---

## 1. The switcher

Top bar, beside the edition switch. Picking a persona **loads their tenant into every tab** —
policies, zones, fingerprint profiles, method sets, hooks, the group directory, and the
enrolment counts on the methods catalogue — then lands you where that persona starts.

It is not a view filter and not a dashboard. The screens are the real screens; what changes
is what is in them. The gauntlet grades the loaded policies for real, the linter finds real
contradictions in them, and Coverage has real holes.

**Depth follows the persona**, because the doc gives every archetype a company size and the
sizes are the point — a 200-person tenant and a 20,000-person one are different problems, not
the same product with bigger numbers.

| Persona | Company size | Policies | Zones | Fingerprints | Hooks | Lands on |
|---|---|---|---|---|---|---|
| New admin · hour one | Day zero | 1 (the system catch-all) | 2 locked | — | — | Templates |
| IT Generalist | 50–500 | 4 | 3 | 1 | — | All Policies |
| Security IT Manager | 500–5,000 | 10 | 8 | 3 | 1 | All Policies |
| Enterprise Architect | 5,000+ | 24 | 10 | 3 | 3 | Zones |
| Platform Integrator | Usually large | 24 | 10 | 3 | 3 | External Hooks |
| Bulk operator | Any | 24 | 10 *(one holds 712 ranges)* | 3 | 3 | Zones |

The day-one tenant keeps the always-on Global Default and nothing else, because a real tenant
always has one and hiding it would misstate what a first sign-in actually gets.

---

## 2. Coverage — which tab serves which persona

Every inner tab is claimed by at least one persona; a test fails if one is not. That test
caught a genuine hole while this was written: **Device Fingerprint was claimed by nobody**,
even though SIB/HRS — the Configurator's own named requirement — is built on it.

| | All Policies | Templates | Zones | Fingerprint | Method Sets | Hooks |
|---|---|---|---|---|---|---|
| New admin | ● | ●● | ● | | | |
| IT Generalist | ●●●●● | | | | | |
| Security Manager | ●●●●● | | | ● | ● | |
| Architect | ●●●●● | | ● | ● | | |
| Integrator | | | | | | ●●●● |
| Bulk operator | ● | | ●●● | | | |

*(dots = declared needs served by that tab)*

---

## 3. What is still unbuilt

Six needs, across three personas. This list is asserted verbatim by a test, so it cannot drift
out of date quietly or be edited to look better without the diff showing it.

### Enterprise Architect — 3

| | Need | What is missing |
|---|---|---|
| A1 | Export policies for version control and review | No JSON export or import anywhere in the tab |
| A2 | Be told when two live policies disagree about the same app and group | Coverage shows the winner; nothing surfaces the disagreement behind it |
| A3 | Order policies against each other, not just rules within one | §6.2 proposes priority across scopes; policies are independent islands |

### Platform Integrator — 1

| | Need | What is missing |
|---|---|---|
| I1 | Sync attributes in and write ordinary conditions against them | Half built — attribute-sync hooks configure, but no condition reads a synced attribute or checks its freshness |

### Bulk operator — 2

| | Need | What is missing |
|---|---|---|
| B1 | Upload a file rather than paste | Paste-many covers most of it; no CSV or JSON upload |
| B2 | Get the rejected rows back in a form they can fix | Bad values are named on screen — a transcription exercise at 240 of them |

---

## 4. Plan

Ordered by *how many personas it unblocks per unit of work*, not by tier.

**Next — one week**

1. **A2 · Cross-policy conflicts.** Derivable today: Coverage already walks every app×group
   pair and resolves a winner. Keeping the runners-up and reporting where they disagree is a
   panel, not an engine change. Unblocks the Architect's most-cited complaint and is the
   precursor to A3.
2. **B2 · Rejected-rows export.** `parseEntries` already returns `bad[]`. What is missing is a
   download. An afternoon.
3. **B1 · File upload into a zone.** Same parser, a file input in front of it.

**Then — two weeks**

4. **A1 · Policy JSON export/import.** Straightforward to export; import needs a validation
   pass so a pasted document cannot create rules referencing zones the tenant does not have.
   Worth doing after A2, because a conflict check is what makes an imported policy safe to
   trust.
5. **I1 · Synced attributes as conditions.** A catalogue entry reading synced attributes, plus
   a freshness operator so a rule can refuse stale data. Completes P7's asynchronous half.

**Later — needs a decision first**

6. **A3 · Priority across policies.** The doc explicitly warns against Entra's
   "all matching policies combine" model as hard to debug, and proposes first-match-within-scope
   plus priority across scopes. That is a model change, not a screen, and it should not be
   built until §Open questions settles whether tenant-global scope exists at all.

**Two questions to settle rather than build**

- Method Sets already are Entra's authentication-strength abstraction under another name. Worth
  saying so out loud — it closes one of the doc's open questions without writing anything.
- Tenant-global scope is not modelled. The Global Default is a system catch-all, not an
  authorable layer. A3 depends on the answer.
