
## 13. 30 Sep OWNER CHANGE — troubleshooting (a person in two groups, conflicts) and a THREE-node run with the board's cards

Owner, verbatim intent (selecting a policy-builder rule card: "1 In a corporate office · Ready · who [HR][FI] · if
Network zone in zone Corporate offices · then Second factor Password → Google Authenticator → Signed in"):
"The troubleshooting use case is not resolved yet — maybe the person is the problem, you can figure it out. Use case: one
person is in both groups, Engineering and Finance. On GitHub, for Engineering it can be one factor with password, but for
the Finance team it can be 2FA, and the person we chose is in both groups — how do we showcase this and how can the user
troubleshoot it? So we can add real people and groups in the person. Then, if we have a conflict, how do we show it? And
the experience takes the user too long to go through. What I want: one node for the PERSON with all the attributes, one
for the POLICY selection, and one for the OUTCOME. And this node looks very different from the one we use in the policy
builder — reuse those cards, because that one is very easy to scan and read."

### 13.1 The model (pure, tested)
- For a sign-in, besides the decider and its landing rule, work out what ELSE would apply to this person:
  - RULE conflicts — rules of the deciding policy AFTER the landing rule whose who + conditions also match this sign-in
    (evaluated on their own), with the decision each would give and the group(s) through which the person matches them
    ("via Finance"). Only those whose decision DIFFERS from the landing rule's are a conflict; same-decision ones are
    "also matches" (quiet).
  - POLICY conflicts — policies on the application AFTER the decider (engine order) that also cover the person and are on,
    with what they would decide.
  - For every rule's who-line: WHICH of the person's groups (or the named person) made it match ("Maya Iyer · via
    Engineering").
- Tests: the dual-group case gives exactly one rule conflict with the right via-group and decision; no conflicts on
  single-group sign-ins; parity with resolveSignIn is unchanged.
- SEED (showcase tenant, keep every scenario contract its tests pin): a real person in BOTH Engineering and Finance, and
  GitHub rules that give Engineering 1 factor (password) and Finance 2FA, in an order where the Engineering rule comes
  first — so the conflict is live in the demo. Also make sure a person picker can offer groups (see 13.3).

### 13.2 The run = three nodes on the vertical spine (supersedes the stage list in §8.6/§12.4, keeps its motion ideas)
1. PERSON node — "Who is signing in": face, name, email; EVERY group they are in (chips, names not initials); then the
   sign-in's attributes in the board card's row grammar (icon + label + value chips): application, network (and the zone it
   falls in), place, device (and the device profile it meets or not), time, risk — only the ones stated/read.
2. POLICY node — "Which policy decides": the deciding policy name and one line why ("First policy on GitHub Enterprise
   that covers Maya Iyer"), the other policies on the app as ONE compact line ("2 others: 1 switched off, 1 does not cover
   her" — expands). Inside: the policy's rules as the POLICY BUILDER'S RULE CARDS (reuse RuleCard's look/grammar: number,
   title, who / if / then rows with the same chips, faces, zone chips and the then-flow "Password → Google Authenticator →
   Signed in"), read-only, each with its result: matched (accent ring, ✓ on the rows that held), didn't match (compact to one
   line naming the failing row), not reached (quiet title). A CONFLICTING rule is NOT compacted: it shows in full with a
   notice chip "Also applies to Maya · via Finance" and "Not used — rule 2 matched first", its own then-flow, and a fix hint
   in one line ("Move it above rule 2 to ask Finance for 2FA") with "Open rule" (the board). Policy conflicts show as one
   line under the other-policies line with the same "Not used — <decider> comes first".
3. OUTCOME node — the decision, what the person is asked for, "Decided by <policy> · Rule N", and What they see (the
   player). When there is a conflict, one quiet line: "Maya Iyer is in Engineering and Finance — Engineering's rule applies
   first" linking to the conflicting card.
- Motion: the run still plays (finding inside the policy node, rules one by one, outcome last) but SHORTER to read and
  watch: ≈ 3–4 s total; Skip; reduced motion = settled.

### 13.3 The Person token
- The bar's Person picker lists REAL people with their groups on the option's second line ("Maya Iyer · Engineering,
  Finance") and, in a second group of options, GROUPS ("Anyone in Finance") — choosing a group tests a member of just that
  group. The person node then says "A member of Finance".
