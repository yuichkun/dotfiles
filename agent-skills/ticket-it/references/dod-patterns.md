# Definition of Done patterns by task type

Every issue's DoD must be worker-self-verifiable. These patterns show what that looks like for each task type. Adapt the specific commands to the repo the skill is running in (don't hardcode `pnpm` if the repo uses `npm` or `yarn`).

---

## Pattern 1: New feature (with UI + API)

```markdown
## Definition of Done — Completion Checklist

- [ ] `POST /api/users/:id/profile` endpoint exists and accepts the schema defined in Section 5.1
- [ ] Endpoint validates input per Section 5.2; returns 422 with field-level errors on invalid input
- [ ] Endpoint returns 200 with the updated User on success
- [ ] Database has a new `updated_at` column on the `users` table (migration in `db/migrations/<date>_add_updated_at.sql`)
- [ ] Unit tests in `src/api/users.test.ts` exist and pass:
  - [ ] Happy path (PATCH with valid body → 200)
  - [ ] Invalid email format → 422
  - [ ] Non-existent user id → 404
  - [ ] Unauthorized caller → 403
- [ ] E2E test in `e2e/profile-edit.spec.ts` exists and passes
- [ ] Manual UI verification completed in the worker's browser:
  - [ ] Navigate to `http://localhost:3000/users/42` — "Alice Smith" renders in h1
  - [ ] Click "Edit" — form appears with name/email prefilled
  - [ ] Submit valid change — toast "Profile saved" visible, h1 updates
  - [ ] Submit empty email — inline error "Email is required" below input, no navigation
- [ ] `pnpm typecheck` → 0 errors
- [ ] `pnpm lint` → 0 errors / warnings on changed files
- [ ] `pnpm format --check` → no diffs
- [ ] PR description links this issue and notes which checklist items were verified
```

---

## Pattern 2: Bug fix

```markdown
## Definition of Done — Completion Checklist

- [ ] Reproduction steps from Section 2 no longer trigger the bug in the worker's browser:
  - [ ] Navigate to `/cart` with 0 items
  - [ ] Click "Checkout" — does NOT show "Cannot read property 'total' of undefined" in console
  - [ ] Instead shows "Your cart is empty" empty-state per design
- [ ] New regression test `src/cart/cart.test.ts > "handles empty cart at checkout"` exists and passes
- [ ] This new test fails on the pre-fix code (confirmed by checking out the previous commit and running it) — prevents the bug from regressing silently
- [ ] Related tests in `src/cart/cart.test.ts` still pass (no unintended behavior changes)
- [ ] `pnpm typecheck` → 0 errors
- [ ] `pnpm lint` → 0 errors / warnings on changed files
- [ ] Root cause documented in Section 3 is consistent with the fix applied
- [ ] No fix was applied outside `src/cart/` (scope was contained per Section 4)
- [ ] PR description links this issue and cross-references the Sentry / bug tracker entry
```

---

## Pattern 3: Refactor (no observable behavior change)

```markdown
## Definition of Done — Completion Checklist

- [ ] New abstraction from Section 5 exists at `src/services/dataFetcher.ts` and exports the API defined in Section 5.2
- [ ] All call sites listed in Section 5.3 now use the new abstraction (verified by `rg "oldFunction\\(" src/` returning 0 matches)
- [ ] Old implementation in `src/legacy/fetcher.ts` is deleted
- [ ] The full existing test suite passes without modification: `pnpm test` → all pass
- [ ] No test behavior assertions were changed (verified by reviewing the diff — only imports / internal code changed, no assertions)
- [ ] Key invariants from Section 4 verified:
  - [ ] `GET /users/:id` response shape identical (captured with a contract test `src/tests/contract/user-get.test.ts`)
  - [ ] P95 latency on `/users/:id` within 10% of pre-refactor baseline (confirmed locally via `wrk -d 30s http://localhost:3000/users/42`)
- [ ] `pnpm typecheck` → 0 errors
- [ ] `pnpm lint` → 0 errors / warnings
- [ ] Bundle size check: `pnpm build && du -sh dist/` within 5% of pre-refactor size (if frontend)
- [ ] PR description explains the motivation and confirms no behavior change
```

---

## Pattern 4: UI tweak (small, visual-only change)

```markdown
## Definition of Done — Completion Checklist

- [ ] CSS change in `src/components/Header.module.css` matches Section 5 spec
- [ ] Manual UI verification in the worker's browser at 3 viewport sizes:
  - [ ] Desktop (1440w): navbar items are horizontally spaced 32px apart, right-aligned
  - [ ] Tablet (768w): navbar items collapse into a hamburger menu button, top-right
  - [ ] Mobile (375w): hamburger menu opens a full-screen overlay on tap
- [ ] Accessibility check:
  - [ ] Keyboard tab order reaches each nav link; focus outline visible
  - [ ] Hamburger button has `aria-label="Open menu"` / `aria-expanded` correctly toggling
- [ ] Visual regression: screenshot at each viewport matches Section 5 design reference within 5% pixel diff (if the repo has a visual regression tool; otherwise: attach screenshots to the PR)
- [ ] No JavaScript / TypeScript files changed unless Section 6 explicitly lists them
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format --check` — all green
```

---

## Pattern 5: Internal migration / data backfill

```markdown
## Definition of Done — Completion Checklist

- [ ] Migration script at `scripts/migrations/<date>_backfill_user_roles.ts` exists and is idempotent (safe to re-run)
- [ ] Dry-run mode works: `tsx scripts/migrations/<date>_backfill_user_roles.ts --dry-run` prints the number of rows that would change without modifying the DB
- [ ] Execution mode works on a local DB: `tsx scripts/migrations/<date>_backfill_user_roles.ts --execute` — worker runs this against a seeded local DB and reports the outcome
- [ ] Migration is transaction-wrapped and will roll back cleanly on any row failure
- [ ] Rollback procedure documented in Section 8 has been verified end-to-end locally
- [ ] Observability: script logs progress every 1000 rows, final count summary on completion
- [ ] Unit tests in `src/tests/migrations/user-roles.test.ts` cover: empty DB, DB with mixed existing roles, idempotency (re-run produces no changes)
- [ ] No application code changed in this PR (scope is script-only)
- [ ] PR description includes a production rollout checklist the human will execute
```

---

## What makes these patterns work

- **Every box has an objective check.** "Tests pass" is objective (exit code 0). "Works well" is not.
- **Exact commands.** The worker doesn't have to infer `npm test` vs `pnpm test` vs `yarn test`.
- **Exact visible states.** "Toast 'Profile saved' appears" is verifiable in a browser. "UI works" is not.
- **Explicit scope boundaries as checkboxes.** "No code outside `src/cart/` was changed" is a diff check the worker can run.
- **Pre-fix regression verification (bug fix pattern).** Forcing the worker to confirm the test *fails* on the old code catches a whole class of "fix didn't actually fix anything" cases.

When you write the DoD section for a new issue, start from the applicable pattern and adapt the specifics. Don't invent a new structure per issue.
