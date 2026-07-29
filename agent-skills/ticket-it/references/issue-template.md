# Issue body template

The worker AI reads this issue and implements it with no further context. Every section below must be filled with **specifics** — no "TBD", no "figure this out". If a section doesn't apply to the task type (e.g., "Behavior" for a pure internal refactor), write `N/A — <reason>` so the worker knows the absence is intentional.

Write the entire body in **English**.

---

## Template

```markdown
# <Concise title in imperative form, e.g., "Add profile edit form to /users/:id page">

## 1. TL;DR

<One to three sentences: what will exist when this issue is closed.>

## 2. Context & Motivation

<Why this work exists. Link to designs, prior PRs, related issues, customer requests, or product docs. Two or three short paragraphs maximum. The worker doesn't need the full history — it needs enough context to make consistent judgment calls on details this issue may have missed.>

**Related:**
- Design: <URL or "none">
- Prior PR(s): <#123 / none>
- Related issue(s): <#456 / none>

## 3. Decisions Made (and Roads Not Taken)

<Every significant design choice. For each decision, state the chosen option AND explicitly-rejected alternatives with reasons. This prevents drift during implementation and gives a ranked fallback list.>

| Decision | Chosen | Rejected | Reason for rejection |
|---|---|---|---|
| State management | Zustand | Redux Toolkit | New dep not justified; Zustand already used in 3 other pages |
| Date parsing | dayjs | date-fns | Already 12 dayjs call sites; avoid double-lib |
| Error retry | None (fail fast) | 3-retry exponential | Matches `services/apiClient.ts:102` policy |

## 4. Out of Scope

<Explicit list of things this issue does NOT cover. Worker must not silently expand scope.>

- <Thing that seems related but isn't part of this ticket>
- <Follow-up work that will be a separate issue>

## 5. Behavior Specification

<What the system does. Cover happy, error, and edge paths. Be observable — describe what's visible to the user or what a test can assert, not internals.>

### 5.1 Happy path
1. <Step 1 — what user does, what system does>
2. <Step 2 — …>
3. <Terminal state — what's visible, what's persisted>

### 5.2 Error paths
- **Input validation:** <exact failure condition → exact user-visible result>
- **Backend failure (5xx):** <behavior>
- **Network timeout:** <behavior + timeout value>
- **Auth error (401 / 403):** <behavior>

### 5.3 Edge cases
- <Empty state>
- <Concurrent edits>
- <Permissions variants (admin vs member)>
- <Any other non-happy-but-valid inputs>

### 5.4 State machine (if applicable)
<Mermaid diagram or explicit state list. Skip if no meaningful state transitions.>

## 6. Implementation Plan

<Step-by-step. Each step names the file(s) to touch and what to do. No ambiguity about ordering.>

1. **<Step title>** — `<file/path.ts>`
   - <Concrete change to make, e.g., "Add `getUserById(id: string): Promise<User>` function using existing `apiClient`">
   - <Any constants, types, or imports the worker should reuse, with file:line>

2. **<Step title>** — `<file/path.ts>`
   - …

<If steps must run in a specific order, say so. If they can parallelize, say that too.>

### Files to create / modify

| File | Action | Purpose |
|---|---|---|
| `src/api/users.ts` | Modify | Add `getUserById` |
| `src/pages/users/[id].tsx` | Create | Profile page route |
| `src/tests/users.test.ts` | Modify | Add tests for new function |

### Libraries / dependencies

- **Adding:** <pkg@version — why needed>. Rejected alternatives listed in Section 3.
- **Removing:** <pkg — why safe to remove>
- **No changes to dependencies:** <state explicitly if true>

## 7. Testing & Verification

<Three buckets: automated tests the worker writes/runs, manual UI verification via browser, and pre-merge gates (type/lint).>

### 7.1 Unit / integration tests

<List the specific test files + test cases the worker must add or update.>

- `src/tests/users.test.ts`:
  - `getUserById returns parsed User on 200`
  - `getUserById throws DomainError on 404`
  - `getUserById retries once on network error, then throws`

**Run command:** `pnpm test src/tests/users.test.ts`
**Expected:** all tests pass, coverage on new code ≥ 90%

### 7.2 E2E tests (if present in repo, or if requested)

- `e2e/user-profile.spec.ts`:
  - <Specific E2E scenario with clear assertions>

**Run command:** `pnpm playwright test e2e/user-profile.spec.ts`
**Expected:** all tests pass

### 7.3 Manual UI verification (via worker's own browser control)

<If the change is visible in the UI, the worker must verify it by actually operating the browser. Specify exact steps. Do NOT say "verify the UI works" — spell out clicks and expected visible states.>

- **Setup:** run `pnpm dev` → open `http://localhost:3000/users/42`
- **Happy path:**
  1. Page loads within 2s
  2. Name "Alice Smith" is visible in an `<h1>`
  3. Click "Edit" button
  4. Form appears with `name` and `email` pre-filled
  5. Change name to "Alice B. Smith", click "Save"
  6. Toast "Profile saved" appears
  7. `<h1>` now reads "Alice B. Smith"
- **Error path:**
  1. Clear `email` field, click "Save"
  2. Inline error "Email is required" appears below the input
  3. "Save" button stays enabled (does not submit)

### 7.4 Type, lint, and format gates

| Gate | Command | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | 0 errors |
| Lint | `pnpm lint` | 0 errors, 0 warnings on changed files |
| Format | `pnpm format --check` | no diffs |

## 8. Fallback Plans

<If the primary approach fails during implementation, what should the worker do? Reference the rejected alternatives in Section 3 in priority order. The worker should NOT escalate back to a human for these — it should try the fallback.>

1. If <primary approach> fails because <likely reason>, use <alternative from Section 3> instead.
2. If <that> also fails, comment on this issue with the blocker and stop — do not invent a third approach.

## 9. Definition of Done — Completion Checklist

**The worker must tick every box below before claiming this issue is complete. Do NOT mark as done without going through this checklist.**

- [ ] All behaviors in Section 5 are implemented and observable
- [ ] All unit tests in Section 7.1 exist and pass
- [ ] All E2E tests in Section 7.2 exist and pass (if applicable)
- [ ] Manual UI verification in Section 7.3 completed — all steps produced the expected result
- [ ] `pnpm typecheck` passes (0 errors)
- [ ] `pnpm lint` passes (0 errors / warnings on changed files)
- [ ] `pnpm format --check` passes
- [ ] No decisions from Section 3 were silently changed; if a decision had to change, this issue is updated before merging
- [ ] Nothing in Section 4 (Out of Scope) was implemented
- [ ] PR description links back to this issue and lists which checklist items were verified

## 10. Reference material

<Anything else the worker should be able to find quickly.>

- Existing code to mirror: `<file:line>`
- Existing types to reuse: `<file:line>`
- Relevant docs: <URL>
- Prior discussion: <PR or issue URL>
```

---

## Notes on using the template

- **Tables for Decisions and Files** — they scan fast and force specificity.
- **Checkbox list for DoD** — the worker's completion protocol runs off these. Every item must be objectively checkable.
- **Exact commands everywhere** — never "run the tests"; always `pnpm test path/to/file.ts`. If you don't know the command yet, inspect `package.json` / `Makefile` / `pyproject.toml` and find it before drafting.
- **file:line citations** — `components/SignupForm.tsx:45-58` beats "the signup form component". The worker can open the exact location.
- **Keep "Implementation Plan" steps small enough that each is one commit-worth of work** — this makes a broken step diagnosable.
