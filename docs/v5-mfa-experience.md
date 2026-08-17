# V5 · MFA Experience — captured spec

Read off `xecurify-idp-prototype.vercel.app` → 2-Factor Authentication → variant
switch (`.tf-variant-switch`) set to **V5**. This is the target to recreate
as-is before improving it.

The switcher offers five variants; V5 is the default:

| value | label |
|---|---|
| `v5` | MFA Experience (Methods / Enrollment / Recovery) |
| `v1` | Expandable cards |
| `v2` | Slide-over drawer |
| `v3` | Tiered + sub-methods |
| `v4` | Health cards + zoned drawer |

## Page head

- Title: **2-Factor Authentication** (to be renamed *Authentication methods*)
- Caption: "Manage authentication factors, how users enroll, and recovery
  options — all in one place."

## Tabs (`.tf-tab`)

`Methods` · `Enrollment` · `Recovery` · `Hardware Tokens`

Note: no "Sets" tab. Our current `AuthMethods.tsx` has one; V5 does not.

## Policy banner (`.tf-policy-banner`)

Dismissible, left accent bar, info icon, then:

> Methods you enable here appear in your policy rules. Enrollee and policy-rule
> counts are live data.

…a spacer, a `Go to Policy Builder →` link, and an `×` close button.

## Methods tab — three tiers (`.t3-tier`)

Heads (`.t3-tier-head`): `.tf-h2` title, `.tf-sub` description, and a right side
(`.t5-head-right`) carrying a phishing badge and an `N of M enabled` count chip
(`.tf-count-chip`).

1. **Phishing-Resistant** — "Cryptographically bound credentials. Cannot be
   replayed or intercepted." · `1 of 2 enabled`
2. **Standard MFA** — "One-time codes and push notifications. Effective but
   susceptible to phishing." · `5 of 11 enabled`
3. **Fallback & Recovery**

## Method card (`.t4-card`)

State classes observed: `on` / `off`, `accent-green` / `accent-gray` /
`accent-amber` / `accent-orange`, plus `t4-card-disabled` and `zero`.

```
.t4-card.on.accent-green
  .t4-card-left
    .t4-card-row1
      .t4-card-ico            ← 20px icon on a solid colour tile (inline bg)
      .t4-card-name           ← "WebAuthn / FIDO2 + Passkeys"
      .t3-phish-badge         ← "Phishing-resistant"
      svg.t5-info             ← info icon, aria-label carries the caveat
    .t4-card-desc             ← one sentence
    .t4-chips
      .t4-chip.on             ← "FIDO2 / Passkey"
  .t4-card-right
    button.tf-toggle.on > .knob
    .t4-card-enrolled         ← "1,203 enrolled"
    .t4-card-usage.link       ← "Used in 2 policy rules →"
```

Also present: `.t5-flag` (a per-card flag/annotation).

## What we already have

`src/brand/screens/AuthMethods.tsx` covers the same catalogue and the four-state
model (`configured` / `active` / `allowed` / `enrolled`, via `methodBlocker()` in
`src/brand/methods.ts`). The rebuild is a re-layout onto V5's shape, not new
data — the tier grouping, the card anatomy above, and dropping the Sets tab.

## Still to capture

The Enrollment, Recovery and Hardware Tokens tab bodies were not read; only the
Methods tab was open. Capture those before building them.
