---
name: codex-review-loop
description: >-
  Run one cycle of the Codex PR review loop. Use when the user asks to
  handle Codex review back-and-forth (`/loop /codex-review-loop`,
  レビュー対応して).
---

# Codex review loop

You are running an autonomous back-and-forth with codex on a GitHub PR. The user handed you the loop because they trust your judgment on the reviewer's findings; don't bounce every finding back for approval, and don't either blindly comply or reflexively decline. Think each one through on the merits.

## How this skill is invoked

The skill is designed for `/loop /codex-review-loop` (dynamic-pacing mode). Each invocation does **one cycle**. At the end:

- Call `ScheduleWakeup(600, ...)` → `/loop` re-invokes the skill in 10 minutes (the next cycle).
- Return without calling `ScheduleWakeup` → the loop ends cleanly. No explicit "stop" command is needed.

Design corollary: **be stateless across invocations**. Reconstruct every piece of context from git + `gh` at the top of each cycle. The only cross-invocation memory is what lives on GitHub (commits, PR comments, reactions) and in the working tree.

## Cycle outline

1. **Identify the PR and the latest commit SHA.** If the user didn't specify a PR number, derive from the current branch: `gh pr view --json number,headRefOid,state,url`. Store `headRefOid` as `LATEST_SHA` — it's the reference point for "is this review about the current state?".
2. **Calibrate to the project** (only the parts you actually need this cycle — don't do all of this if the cycle is just a heartbeat check):
   - Test / validate command: read `CLAUDE.md` if present. Else infer: `package.json` scripts (prefer `vp run <x>` if the repo uses Vite+, else `pnpm`/`npm` scripts), `Cargo.toml` (`cargo test`), `Makefile`, `go.mod` (`go test ./...`). Cross-reference with the last few commits' messages ("ran `vp check` before push" → use that).
   - Commit style: `git log --format='%s' -20`. Match the prefix convention (`feat(sub-x):`, `fix:`, conventional, plain imperative). If recent commits include `Co-Authored-By:` trailers, keep appending them; if not, don't.
   - Relevant user memory: skim `~/.claude/projects/.../memory/MEMORY.md` for entries about codex, PR handling, or reviewer philosophy. The user's `feedback_codex_rereview_mention` and `feedback_review_fairness` memories in particular shape this loop.
3. **Read the GitHub state** for this PR — and crucially, codex posts different *kinds* of feedback to different endpoints, so you must check all three:
   - **PR reviews** (findings carrying inline comments): `gh api repos/<OWNER>/<REPO>/pulls/<N>/reviews --jq '[.[] | select(.user.login | startswith("chatgpt-codex"))] | sort_by(.submitted_at) | last'` — **capture this review's `.id` and `.submitted_at`**; you need the id for the next step. **Read the review's `.body` IN FULL** (`gh api repos/<OWNER>/<REPO>/pulls/<N>/reviews/<REVIEW_ID> --jq '.body'`) — codex routinely appends a finding to the body *after* the `### 💡 Codex Review … Reviewed commit:` boilerplate, so do NOT stop reading at the template prefix. A single review often carries one finding in the body AND one (or more) as inline comments; both are findings to evaluate. (See the review-body blindspot below.)
   - **Inline findings from the latest review** — select the inline comments **belonging to that review** by its `pull_request_review_id`, NOT by `commit_id`: `gh api repos/<OWNER>/<REPO>/pulls/<N>/comments --jq "[.[] | select(.pull_request_review_id == <REVIEW_ID>)]"`. This is the set of findings codex *newly raised this round*. (See the carry-forward blindspot below for why `commit_id` is wrong.)
   - **PR timeline comments (issue comments)** — **this is where codex LGTMs land, NOT in /reviews**: `gh api repos/<OWNER>/<REPO>/issues/<N>/comments --jq '[.[] | select(.user.login | startswith("chatgpt-codex"))] | last'`
   - Your own most recent `@codex review` comment (if any), for the 👀 heartbeat check: `gh api repos/<OWNER>/<REPO>/issues/<N>/comments --jq '[.[] | select(.body | startswith("@codex review"))] | last'` — note `.id` for the reaction check.

   **Classic blindspot** (what the user had to catch for me when building this skill): codex's approval message — e.g. `"Codex Review: Didn't find any major issues. Chef's kiss."` — is posted as a PR timeline comment, not a review submission. If you only scan `/reviews`, you will sit forever waiting for an approval that already arrived. Always scan `/issues/<N>/comments` on every cycle.

   **Carry-forward blindspot** (the one that bit me — load-bearing): an inline review comment's `commit_id` is **silently updated to the latest commit the comment still applies to** as the diff moves forward (the commit it was *first* posted on is preserved as `original_commit_id`). So `select(.commit_id == "<LATEST_SHA>")` returns the **union of every still-applicable comment across all past reviews** — including ones you already addressed whose flagged source line simply didn't change — and you will keep mistaking old comments for "new findings codex re-posted". **Never scope inline comments by `commit_id`. Always scope by the latest review's `pull_request_review_id`** — that alone is "what codex said this round". Cross-check with `.original_commit_id` (where it was first raised) if you need the history. A comment with `line: null` is outdated: its anchored line changed, usually because you already fixed it.

   **Review-body blindspot** (cost the user a correction): codex puts findings in TWO places per review — inline comments AND the **review `.body` itself**, appended after the `### 💡 Codex Review … Reviewed commit:` boilerplate. If you read only the first lines of the body you'll see the template and wrongly conclude "body is just boilerplate, only the inline finding matters", silently dropping the body finding every round. **Always read the full `.body`** and count it as a finding. Corollary: when the user says they see more findings/reviews than you've reported, assume YOUR fetch is incomplete (un-read body, missed endpoint, pagination) — re-fetch exhaustively and grep for the exact title they name; never explain away their first-hand view of the UI with your partial data.
4. **Decide the state** (tree below) and act. At most one action per cycle.
5. **Decide cadence**: call `ScheduleWakeup` to continue, or return to stop. Tell the user in chat what you did and what comes next.

## State → action table

Given the reads from step 3, there are ~five meaningful states. Match against the first one that applies:

| # | State | Action | Next cycle? |
|---|---|---|---|
| 1 | Newest codex message on the PR (either a review on `LATEST_SHA`, a PR timeline comment from the codex bot, or an APPROVED review) is LGTM-shaped (see below) AND posted after your last `@codex review` comment | Post final summary to the user in chat (not a PR comment). Confirm nothing else is outstanding. | **Stop** (return without ScheduleWakeup) |
| 2 | Latest codex **review** is on `LATEST_SHA` **and** carries new findings (inline comments whose `pull_request_review_id` == that latest review's id, and/or a review body with actionable complaints) | Evaluate each finding on the merits (§ Evaluating). Address the legitimate ones (§ Addressing). Push. Post a fresh `@codex review` PR comment (§ Re-requesting). | Continue, `ScheduleWakeup(600, ...)` |
| 3 | You have a prior `@codex review` comment, no newer codex response on any endpoint, **and** your comment has a 👀 reaction | Codex is processing. No action. | Continue, `ScheduleWakeup(600, ...)` |
| 4 | You have a prior `@codex review` comment, no newer codex response on any endpoint, **and** no 👀 reaction on your comment despite ≥10 min elapsed | The mention was dropped. Post a fresh `@codex review` comment explicitly referencing `LATEST_SHA`. | Continue, `ScheduleWakeup(600, ...)` |
| 5 | State 4 has already happened once this run AND still no 👀 after the second re-mention | Codex appears unreachable. Tell the user and pause. | **Stop (escalation)** |

**"newer codex response on any endpoint"** = either: a codex PR review whose `submitted_at` is later than your last `@codex review` comment (its inline findings are the comments with that review's `pull_request_review_id` — **never** matched by `commit_id`), or a PR timeline comment from `chatgpt-codex-connector[bot]` newer than your comment. Check both. A review carried over from an earlier round (older `submitted_at`) is NOT a new response, even though its comments' `commit_id` now points at `LATEST_SHA`.

Other cases: be honest with the user about what you see and stop. Don't synthesize behavior from ambiguous GitHub state.

## What counts as LGTM

Codex LGTMs are **explicit**, not silent — the user has been clear about this. Require at least one of:

- A review with `state: "APPROVED"` on `LATEST_SHA`.
- A **PR timeline comment** (`/issues/<N>/comments`) from `chatgpt-codex-connector[bot]` posted after your last re-request whose body contains approving language. Observed canonical forms:
  - `"Codex Review: Didn't find any major issues. Chef's kiss."` — codex's standard no-findings signoff
  - Shorter variants: `"LGTM"`, `"looks good"`, `"no further suggestions"`, `"Chef's kiss"`
- A bare approving review *body* on `LATEST_SHA` (rare — codex typically uses a timeline comment for this).

**Silence is never LGTM.** If codex goes quiet for 30+ minutes after a confirmed 👀, something is off — escalate rather than declare victory.

**Double-check before declaring LGTM**: confirm the approving comment was posted *after* your most recent `@codex review` comment (by timestamp). An approval from a previous round, left unread, is not an approval of the current state.

## Evaluating a finding fairly

This is the part the user trusted you with. For each finding:

1. **Is it factually correct?** Open the file, reproduce the claim. If codex says a regex accepts `foo--bar`, actually test it. A surprising number of bot findings are outright wrong.
2. **Does it matter?** P1-labelled findings usually do. P3-labelled ones sometimes don't (pure style on throwaway code). But a P3 that's a 30-second fix and a real papercut is worth addressing; a P1 that contradicts an explicit design decision in the linked issue is worth declining.
3. **Does it contradict earlier agreed scope?** If the PR's linked issue explicitly excluded something and codex is asking you to add it back, that's a decline (with a pointer to the issue decision).
4. **Quick fix + cheap regression test available?** If yes, usually address. The bar for "legitimate" isn't "I'd do this on my own initiative" — it's "reasonable reviewer has a point".
5. **Does this need user judgment?** Yes when the fix implies a scope change, a breaking API decision, a philosophical tradeoff the user hasn't weighed in on, or you're legitimately unsure whether the finding is correct after investigating. In those cases — stop the loop and ask.

Never decline a finding because of fatigue, "we've been at this N rounds", or "codex is pedantic". Decline only with a concrete merit-based reason. Accept not because "codex usually wins" but because the point holds up.

## Addressing findings

- **Batch one codex round into logical-change commits.** The fix and its regression test are ONE commit, not two. Split only when findings touch different subsystems.
- **Include a regression test** when the finding is testable. Bug fixes without tests regress. Test-first when faster; otherwise right after the fix, before the commit.
- **Validate before push**: run the project's validate command (from calibration). If it fails and you can't fix in-cycle, that's a user escalation, not a push.
- **Commit message** matches project conventions. Include a line attributing the finding — `Reported by @codex on #<PR>.` — so `git log` alone is sufficient to reconstruct the trail.
- **Push** with plain `git push`. Avoid `--force-with-lease` unless the branch has rebases in flight. Confirm the push succeeded before moving on.

## Re-requesting review

**Always a fresh top-level PR comment.** Replies inside a review thread do NOT re-trigger codex — this is codified in the user's memory (`feedback_codex_rereview_mention`) and is load-bearing.

```bash
gh pr comment <N> --repo <OWNER>/<REPO> --body "@codex review

Addressed on <NEW_SHA>:
- <finding A>: <one-line fix summary> (<commit SHA>)
- <finding B>: <one-line fix summary> (<commit SHA>)

Declined:
- <finding C>: <one-line merit-based reason>
"
```

Keep it short and informative. Record the returned comment URL's trailing integer as the comment ID — the next cycle will use it to check reactions.

## Telling the user what you did, each cycle

At the end of every cycle, before `ScheduleWakeup` / return, post a short chat message:

- What state you observed (e.g., "new codex review with 2 findings on abc1234", "👀 present, no new review yet", "no 👀 after 10 min — re-mentioned").
- What you did (commits pushed, comment posted, declined-with-reason).
- What the next cycle (if any) will check for.

Keep it under ~8 lines. The user is watching the loop; they need to see progress without reading the whole PR history each cycle.

## Escalation

When you escalate (states 5, user-judgment-needed, local validation failure, codex unreachable, etc.):

1. Tell the user what codex said.
2. Share your merit-based read of it (the user hired you for judgment — share it).
3. State the specific question you need them to answer.
4. Return **without** `ScheduleWakeup`. The loop ends.

When the user responds, they can re-run `/loop /codex-review-loop` to resume.

## Cadence notes

- **10-minute wakeups** default. Codex typically returns 3–5 min after a push; 10 min catches it with one cache-miss per round, cheaper than 2–3× shorter polls paying the miss repeatedly.
- **Don't poll faster than 5 min.** Codex latency is bimodal — either fast or dropped — so shorter polls burn cache without changing outcomes.
- **Don't sleep longer than 20 min during an active loop** — the user wants observable progress.

## Appendix: minimal gh snippets

```bash
# Current PR + latest commit SHA for the checked-out branch
gh pr view --json number,headRefOid,state,url

# Latest codex review on the given commit
gh api repos/<OWNER>/<REPO>/pulls/<N>/reviews \
  --jq '[.[] | select(.user.login | startswith("chatgpt-codex") or test("codex"; "i"))] | sort_by(.submitted_at) | last'

# Inline findings from the LATEST review only.
# NOT by commit_id — that carries forward across commits and re-surfaces
# already-addressed comments from past reviews. Scope by pull_request_review_id.
# 1) latest codex review id:
gh api repos/<OWNER>/<REPO>/pulls/<N>/reviews \
  --jq '[.[] | select(.user.login | test("codex"; "i"))] | sort_by(.submitted_at) | last | .id'
# 2) inline comments belonging to that review (substitute <REVIEW_ID>):
gh api repos/<OWNER>/<REPO>/pulls/<N>/comments \
  --jq "[.[] | select(.pull_request_review_id == <REVIEW_ID>)]"

# PR timeline comments from codex — this is where LGTMs land (NOT /reviews)
gh api repos/<OWNER>/<REPO>/issues/<N>/comments \
  --jq '[.[] | select(.user.login | startswith("chatgpt-codex"))] | last'

# Your most recent @codex review comment (for reaction + recency checks)
gh api repos/<OWNER>/<REPO>/issues/<N>/comments \
  --jq '[.[] | select(.body | startswith("@codex review"))] | last'

# Reactions on a specific PR comment (used for 👀 heartbeat)
gh api repos/<OWNER>/<REPO>/issues/comments/<COMMENT_ID>/reactions \
  --jq '[.[] | .content] | unique'

# Post top-level PR comment (re-request)
gh pr comment <N> --repo <OWNER>/<REPO> --body "@codex review ..."
```
