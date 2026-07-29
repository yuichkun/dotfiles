# Grill question bank

Walk through the categories that apply. Ask one question at a time. For each question, propose a recommended answer with a one-line rationale grounded in the codebase when possible.

**Answer yourself first.** For every question below, check whether you can answer it by reading code, running `gh`, searching the web, or fetching library docs via context7. Only escalate to the user when:
- The decision is a priority / tradeoff / UX call only the user can make
- The codebase has no precedent to copy
- The user has stated a preference that contradicts the codebase precedent

---

## A. Framing (ask first, always)

- **A1.** What exactly is being built? Summarize the feature in one sentence you can quote into the issue's TL;DR.
- **A2.** Who is the user? (end-user, admin, internal engineer, automated system)
- **A3.** What's the "I'll know it's done when…" moment? This becomes the first line of the DoD.
- **A4.** Is this a new feature, a bug fix, a refactor, or a UI tweak? (Each has a different DoD flavor — see @references/dod-patterns.md.)
- **A5.** Is there a time constraint or deadline context? (Not embedded in the issue, but useful for scoping decisions.)

---

## B. Scope & boundaries (prevent scope creep by the worker)

- **B1.** What's explicitly NOT in this issue? List follow-ups.
- **B2.** Are there adjacent features that look similar but are out of scope? Name them.
- **B3.** Should existing behavior change, or only be added to? Be explicit about backwards compatibility.
- **B4.** Are there feature flags / environment variables to gate this?
- **B5.** Does this affect anyone else's in-flight work? (Check `git log`, open PRs, related branches.)

---

## C. User-visible behavior (for anything with UI or API)

- **C1.** Happy path — walk me through one complete successful interaction, step by step.
- **C2.** Empty state — what's visible when there's no data yet?
- **C3.** Loading state — what's visible while the data is fetching?
- **C4.** Error state — for each failure mode (validation, 4xx, 5xx, network timeout), what does the user see?
- **C5.** Edge cases — long strings, missing optional fields, concurrent edits, stale data, pagination boundaries, permissions variants (admin vs member vs guest).
- **C6.** Accessibility — keyboard navigation, focus order, ARIA labels, contrast. Only ask about this if the feature adds interactive UI.
- **C7.** Mobile / responsive — if applicable, what breakpoints matter? What changes?

---

## D. Data & API

- **D1.** Data shape — exact schema of inputs, outputs, and any new persisted entities. (Try to derive from existing types first.)
- **D2.** Validation rules — per field: required? format? length limits? server-side or client-side?
- **D3.** API endpoint(s) — method, path, request body, response body, status codes. If adding new endpoints, name the file to put them in based on repo conventions.
- **D4.** Database migrations — does this need a schema change? If so: forward + backward migration, index needs, data backfill required?
- **D5.** Authn / authz — who can call this? Which existing middleware/guard to reuse?
- **D6.** Rate limiting / quotas / throttling — needed?
- **D7.** Caching — client, CDN, server-side cache? Invalidation rules?

---

## E. Non-functional

- **E1.** Performance target — e.g., P95 latency ≤ 200ms; frontend time-to-interactive ≤ 1.5s. If nothing specific, use the repo's existing SLOs from docs or code comments.
- **E2.** Observability — what should be logged? What metric(s) should increment? Any alerts needed? (Ask only if the repo has observability infra.)
- **E3.** Security — threat model touches? User-generated HTML? File upload? Cross-tenant data?
- **E4.** Internationalization — is the new text i18n'd? Reference the repo's existing i18n file locations.
- **E5.** Feature flags — rollout plan? Default on or off?

---

## F. Implementation choices

For each, **check the codebase for precedent before asking the user**.

- **F1.** Which files need to be created / modified / deleted?
- **F2.** Which existing functions, components, types, or utilities should be reused? Cite `file:line`.
- **F3.** Libraries — if a new dependency is considered, compare 2-3 candidates via context7 or WebSearch. Axes: ergonomics, maintenance status, bundle size, license, active issues. Write the comparison into "Decisions → Rejected".
- **F4.** Pattern to follow — does the codebase have an established pattern for this kind of work (e.g., API handler pattern, form pattern, store pattern)? Pin down which exact file demonstrates the canonical pattern.
- **F5.** Naming — what do new files / exports get named? Use the repo's existing naming conventions (extract by reading a similar existing module).

---

## G. Testing & verification

- **G1.** Which test files need to exist? Path + function-level test cases the worker must add.
- **G2.** What's the exact test command the worker runs to verify?
- **G3.** If UI-visible: exact browser steps for manual verification (setup → action → expected visible state) for happy AND error paths. Be explicit — "click the 'Save' button", "see the text 'Profile saved' in a toast".
- **G4.** Are there existing E2E tests that should be extended vs new ones written?
- **G5.** Type, lint, format commands and their expected pass state.
- **G6.** Any manual smoke checks that can't be automated? (e.g., visual design fidelity, cross-browser rendering if that matters in the repo.)

---

## H. Fallbacks & failure modes

- **H1.** If the primary approach doesn't work during implementation (e.g., the chosen library turns out to misbehave), what's the priority-ordered fallback? This comes from the "Rejected" column in the Decisions table.
- **H2.** What's the escalation trigger — i.e., under what condition should the worker stop and comment on the issue instead of pushing through? Typically: "if both primary and fallback fail", or "if any existing test outside the scope of this issue breaks".
- **H3.** Rollback plan — can this be reverted cleanly by reverting the PR? If there's a migration, what's the rollback migration?

---

## I. Documentation & communication

- **I1.** Does this change require user-facing docs? README updates? CHANGELOG entry? If yes, embed the doc copy directly into the ticket so the worker writes the exact text.
- **I2.** Does the PR description need any specific content (repo PR template compliance)?
- **I3.** Anyone to ping on the PR? (Not embedded in the issue body; just noted for you to mention in Section 2.)

---

## J. Task-type overrides

Depending on task type (from A4), some categories are critical and others skippable.

- **New feature:** all categories apply. Focus hardest on C (behavior), F (impl choices), G (testing).
- **Bug fix:** add category K (Bug diagnosis).
- **Refactor:** C becomes "no observable behavior change — same inputs produce same outputs". Add category L (Refactor invariants). G (testing) is about *regression coverage*, not new tests.
- **UI tweak:** C is the primary focus. F is minimal. G.3 (browser steps) is the entire verification story.

### K. Bug fix additional questions

- **K1.** Reproduction steps — exact sequence that triggers the bug. This becomes the first Playwright / manual regression test.
- **K2.** Root cause — if known, state it. If not, investigate with Grep/Read before asking the user to guess.
- **K3.** Scope of fix — is this the surface bug only, or the underlying class of bugs?
- **K4.** Regression test — the repro steps become a new test case. Where does it live? What's the assertion?

### L. Refactor additional questions

- **L1.** Invariants — what behaviors must be preserved exactly? List them as "these tests must still pass" / "these metrics must not change".
- **L2.** Rollout — can this be done in one PR, or should it be incremental (e.g., introduce new abstraction alongside old, migrate callers one by one, delete old)?
- **L3.** Blast radius — grep for all call sites of the code being refactored. List them in the ticket.

---

## Stop condition

Walk through @references/issue-template.md mentally. If every section can be filled with concrete content, you're done grilling. Otherwise, identify which sections are still vague and grill on those.

**Don't grill forever.** If after ~15 rounds of questions the user is still answering vaguely on a category, escalate: "I'm not getting specific enough answers on X to make this worker-proof. Do you want me to (a) draft with my best guess and flag uncertainty in the ticket, (b) pause until you've decided, or (c) drop this category as out-of-scope?" Respect the answer.
