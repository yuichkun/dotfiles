---
name: ticket-it
description: Turn a feature idea, bug, refactor, or UI tweak into a zero-ambiguity GitHub Issue that a junior-level worker AI (Cursor's Composer 2, or a similarly cheap model) can implement without making a single meaningful decision. Grills the user relentlessly one question at a time, researches the codebase, compares libraries, and records rejected alternatives so the worker can't drift mid-implementation. Use this skill whenever the user asks to "ticket this", "make an issue", "spec this out", "hand this off to Composer / Cursor / the worker", "チケット化して", "Issueにして", "prepare a spec", or gives you a GitHub Issue URL and asks to update the description. Make sure to use this skill for ANY handoff from planning (Opus 4.6) to implementation (cheap worker model) — features, bugs, refactors, or UI — even when the user doesn't explicitly say "issue" or "ticket" but the intent is to write a worker-ready spec.
---

# ticket-it

Turn a vague intent into a **zero-ambiguity GitHub Issue** that a junior-level worker AI (Cursor's Composer 2, or similar) can implement without making a single meaningful decision.

The target consumer is a model that is:
- **bad at reasoning** — any unresolved decision will be made wrong
- **good at following explicit instructions** — steps, file paths, commands, checkboxes
- **capable of running Cursor Cloud Agents with Computer Use** (cloud VM with desktop + browser), so it can self-verify UI behavior by actually operating the browser

Your job is to do *all the thinking* before the worker sees the ticket.

---

## Core principles

### 1. Grill relentlessly, one question at a time

Ask questions one at a time. For each question, **propose a recommended answer with reasoning** (so the user can just say "yes, that"). Never ask 5 questions at once — it drops the user's cognitive load per answer and you lose signal on what they actually care about.

If a question can be answered by reading a file, `git grep`ing, running `gh`, or fetching library docs via context7 — do that *first* and don't ask the user.

Stop conditions (all of them):
- Every section of the issue template (see @references/issue-template.md) can be filled with specifics — no "TBD", "depends", or "use what makes sense"
- User explicitly says "enough, draft it" (but push back if critical gaps remain and show what's missing)

### 2. Document the roads not taken

When you compare alternatives (library A vs B, pattern X vs Y, approach 1 vs 2), record both the chosen option **and the rejected ones with explicit reasons**.

Why this matters:
- Prevents the worker AI from second-guessing the choice mid-implementation and silently switching approaches
- Gives the worker a ranked fallback list if the primary approach fails — the worker doesn't need to escalate, it just moves to option 2

This is non-negotiable. Every decision section must have "Chosen: X — Rejected: Y (reason), Z (reason)".

### 3. English issue body, regardless of conversation language

Converse with the user in whatever language they start in (Japanese or English). The **issue body is always English** — worker AIs perform measurably better on English-language specs, and this skill's whole point is compensating for the worker's weaknesses.

### 4. Self-verifiable DoD

Every Definition of Done item must be checkable by the worker itself. Three categories:
- **Command-based:** exact command (e.g., `pnpm test src/user/profile.test.ts`) with expected output
- **Browser-based (UI):** exact steps the worker runs in Cloud Agents + Computer Use (open URL → click X → expect Y visible)
- **File-based:** exact file or code that must exist / change (e.g., `src/api/routes/user.ts` must export `GET /users/:id`)

No "verify it works" or "test the feature". Every item is a tickbox with an objective check.

### 5. Tool-neutral issue body

The issue doesn't mention Cursor, Composer 2, or any specific worker tool. It describes *what* and *how to verify* — not the workflow of a specific IDE. This keeps it readable by humans and any worker model. When you tell the worker to "verify in a browser", trust the worker to use its own tool (Computer Use, Playwright, whatever).

---

## Workflow

### Step 1: Determine mode

Scan the user's message and recent conversation for a GitHub Issue URL (`github.com/<owner>/<repo>/issues/<n>`).

- URL present → **update mode**
- No URL → **create mode**

### Step 2: Gather repo context (both modes)

Run these in parallel. Fail gracefully if any are missing.

```bash
gh repo view --json nameWithOwner,defaultBranchRef,description
git log -20 --oneline
gh auth status
```

Then, in parallel, Read (if they exist):
- `README.md` — product/project framing
- `CLAUDE.md`, `AGENTS.md` — AI-agent conventions (note filenames, don't quote bulk content into the issue)
- `.github/ISSUE_TEMPLATE/` contents — repo-defined issue templates to respect

If no git repo or no `gh` CLI authentication, stop and tell the user how to fix it. Do not proceed.

### Step 3: Seed from conversation history

Before asking anything, **re-read the current conversation**. The user may have already described the feature, shared designs, argued about approaches. Extract what's already there. Only ask about gaps.

This is especially important when the user has been talking through a design with you and then says "ok, ticket this" — most of the content is already in the transcript.

### Step 4: Research (before and during grilling)

Every issue needs these research passes. Do them proactively — don't wait for the user to ask.

- **Similar implementations in the repo.** Grep for patterns matching the feature (existing endpoints, existing components, existing migrations). Quote `file:line` ranges in the issue.
- **Data models / types touched.** Read them. Summarize shape in the issue so the worker doesn't have to.
- **Libraries.** If a new dependency might be added, compare 2-3 alternatives via context7 or web search. Axes: API ergonomics, last release date, maintenance, bundle size, license, open-issue count. Write the comparison into "Decisions → Rejected alternatives" in the issue.
- **Project conventions.** Note the test runner, type checker, linter, and formatter by inspecting `package.json` / `pyproject.toml` / etc. Put the exact commands in the Completion Checklist — don't assume the worker knows.

Cite `file:line` for every claim you make about the codebase. The worker should be able to open exactly what you cite.

### Step 5: Grill until zero ambiguity

Load @references/question-bank.md and walk through the categories that apply to this task type. For each question:

1. Before asking the user, check if you can answer from code/docs yourself.
2. If the user must decide, ask one question with a recommended answer.
3. Log the answer into the draft issue section it populates.
4. Continue until every section of @references/issue-template.md is filled with concrete content.

If the user tries to end early ("enough, make the issue"), check against @references/issue-template.md. If critical sections are still vague, push back: "I still need: X, Y. Without these the worker will have to guess."

### Step 6: Draft the issue

Use the exact structure in @references/issue-template.md. Pull task-type-specific DoD examples from @references/dod-patterns.md (feature / bug / refactor / UI-tweak each have different DoD flavors).

Write the body in English. Write markdown. Use `<details>` for long code references if needed to keep scroll length reasonable.

Save the draft to: `/tmp/ticket-it-<slug>.md` where `<slug>` is a kebab-case summary (max 40 chars) of the feature name.

### Step 7: Present for approval

Display inline:
- **Title** (full)
- **Section headings** (not section bodies — the body is too long)
- **Decision summary table** — just the "chosen" options from the Decisions section, one line each
- **Completion Checklist** (full — this is load-bearing for the worker)
- The full draft path: `/tmp/ticket-it-<slug>.md` so the user can open it

Then use AskUserQuestion:
- "Approve and create/update issue"
- "Request changes" (they type what to change)
- "Abort"

Loop on "Request changes" — update the draft file, re-present the same summary, repeat.

### Step 8: Create or update via gh

**Create mode** — after approval:
```bash
gh issue create \
  --repo <owner/repo> \
  --title "<title>" \
  --body-file /tmp/ticket-it-<slug>.md
```

Do not pass `--label`, `--assignee`, `--milestone`, `--project` — leave metadata for the human.

**Update mode** — after approval:
```bash
gh issue edit <url> --body-file /tmp/ticket-it-<slug>.md
```

Print the resulting issue URL for the user.

### Step 9: Split if the spec is big

If the draft exceeds ~500 lines OR covers more than one "atomic unit of work" (e.g., backend API + frontend form + migration), propose splitting into a parent + sub-issues using GitHub's native task list.

Propose a split plan to the user first:
```
Parent: "Implement user profile page"
  └─ Sub 1: "Add GET /users/:id endpoint"
  └─ Sub 2: "Add profile page route + data fetching"
  └─ Sub 3: "Add profile edit form"
```

After approval:
1. Draft each sub-issue body (full template, per sub-issue) into its own `/tmp/ticket-it-<slug>-sub-<n>.md`
2. Create sub-issues first with `gh issue create`, collecting their numbers
3. Draft the parent body with a `## Tasks` section linking to sub-issues: `- [ ] #123 Sub 1 title`
4. Create the parent

Each sub-issue is still a complete, standalone, worker-implementable ticket — it just lives under the parent for tracking.

---

## Update mode specifics

When the user gives you an Issue URL to update:

1. `gh issue view <url> --json title,body,labels,state` — read the existing content.
2. Parse the existing body into sections matching @references/issue-template.md.
3. Identify gaps:
   - Missing sections
   - Sections with vague/placeholder content (e.g., "TBD", "figure this out")
   - Sections that contradict info the user has given you in this conversation
4. Grill the user only on gaps and contradictions. Don't re-derive content that's already specific and correct.
5. Regenerate the full issue body from merged context — do not try to edit sections in place. The worker benefits from a coherent re-written body.
6. Present the full new body for approval. Highlight what changed vs the original (use a `diff` view if the body is short enough, otherwise describe the changes).
7. On approval, `gh issue edit <url> --body-file ...`.

---

## What a good grilling question looks like

Good (aggressive, specific, with recommendation and rationale):
> "When the user submits the form with an empty email, should the submit button be disabled, or should the submit go through and produce an inline error below the input? (Recommended: inline error — consistent with the validation pattern in `components/SignupForm.tsx:45-58`)"

> "The existing codebase uses `dayjs` (12 call sites). Should the new date picker also use `dayjs`, or introduce `date-fns`? (Recommended: `dayjs` — no new dependency, matches existing patterns. Rejected: `date-fns` because adding it would mean 2 date libraries in the bundle)"

> "If the backend returns 500 on submit, do we retry (how many times?) or fail immediately and show a toast? (Recommended: fail immediately, toast, log to Sentry — matches policy in `services/apiClient.ts:102`)"

Bad (abstract, defers to the worker — never ship these to the user):
- ❌ "How should we handle errors?"
- ❌ "What library should we use for X?"
- ❌ "Any edge cases to consider?"
- ❌ "What's the UX you want?"

---

## Tools this skill uses

- **Bash**: `gh` CLI (repo/issue view, create, edit), `git` (log, grep, blame)
- **Grep / Glob / Read**: codebase exploration for `file:line` citations
- **AskUserQuestion**: one question at a time with recommended answers
- **WebSearch / WebFetch / context7**: library comparison research
- **TaskCreate/Update**: track the grill → draft → approve → create flow if the session is long

---

## Safety

- **Never** run `gh issue create` or `gh issue edit` without explicit user approval on the exact draft shown.
- **Never** create sub-issues before the user approves the split plan (premature creation pollutes the tracker).
- **Never** add labels, assignees, milestones, or project-board entries — the user handles metadata post-create.
- If the current working directory has uncommitted changes that look related to the feature, mention it in the draft's "Context" section so the worker knows pre-existing WIP exists.
- If the repo has an existing `.github/ISSUE_TEMPLATE/*.md` that contradicts this skill's template, tell the user and ask whether to follow the repo template or this skill's template.
