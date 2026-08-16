---
name: commit-with-claude-review
description: >-
  Creates small, coherent Git commits through a review-first approval workflow:
  challenge commit boundaries before staging; stage one atomic change at a time;
  validate it; normally run blind correctness and minimality reviews that also
  audit commit size; fingerprint the exact state; and require user approval.
  Also supports an explicit user-authorized emergency bypass when external
  reviewers are unavailable or urgency outweighs review latency. Use whenever
  the user asks to commit, split work into commits, stage and commit, "commit
  this", "コミットして", "変更をコミット", or requests a careful commit workflow.
compatibility: Requires git. The default reviewed path also requires the Claude Code CLI and explain-with-diagrams skill.
---

# Commit with Claude review

Turn a dirty working tree into the smallest coherent commit series that remains
buildable and understandable. Process **one commit at a time**. The default
reviewed path uses three gates, in order:

1. A blind correctness/regression reviewer explicitly approves the exact staged
   diff and proposed message.
2. A separate blind scope/minimality/maintenance reviewer explicitly approves the
   same staged diff and message.
3. The user explicitly approves that exact doubly reviewed state.

## Explicit user-authorized emergency bypass

Review is the default, not an authority above the user. Use this bypass only when
the user unambiguously instructs the agent to skip external review and commit the
current exact staged change now, for example because reviewers are unavailable or
the commit is urgent. Never infer authorization from impatience, silence, or a
request that merely says "commit".

For that commit only:

1. Skip the two Claude reviews and the diagram explanation. Do not invoke Claude,
   Fable, or another external reviewer after the bypass is authorized.
2. Still complete Phase 0, exact staging, ownership inspection, local validation,
   `git diff --cached --check`, and all Git-state safety checks.
3. Write the exact message under `${TMPDIR:-/tmp}` and capture `BASE_HEAD`,
   `BRANCH`, `TREE_OID`, `STAGED_OID`, and `MESSAGE_OID` before committing.
4. The bypass directive counts as final approval only when it explicitly says to
   commit the current staged result now. Otherwise present the exact message and
   stat and ask for approval normally.
5. Re-verify every fingerprint immediately before commit, use
   `git commit --cleanup=verbatim`, and perform the same parent/tree/message and
   hook-mutation checks from step 4. Never push unless separately requested.

Any staged-content, message, branch, or `HEAD` change after authorization voids
that approval. Reconfirm the exact changed state; do not broaden the bypass to
later commits.

## Non-negotiable gates

- Never commit before the selected path's gates pass: all three gates on the
  default path, or every emergency-bypass requirement plus explicit approval.
- On the default path, never treat silence, a CLI failure, a conditional
  approval, or "mostly LGTM" as approval. Each Claude approval requires a final
  line exactly equal to `VERDICT: LGTM`, a concrete attack ledger, and no
  actionable finding.
- On the default path, the two reviewers are blind within a round: neither packet
  may contain the other's same-round output, verdict, or framing.
- If staged content, message, `HEAD`, or branch changes after a review snapshot or
  bypass authorization, the corresponding LGTMs/approval are void.
- Require user approval for each commit. A qualifying emergency directive may
  provide it for that current exact change, never for a later commit.
- Never bypass failing validation or hooks. Never use `--no-verify`, force flags,
  or a different commit command to evade a failure.
- Do not add a repository script, dependency, config file, or generated artifact
  merely to execute this workflow. Use existing project commands or temporary
  files under `${TMPDIR:-/tmp}` unless an enduring repository need is proven and
  reviewed.
- Do not use destructive cleanup (`git reset`, `git restore`, `git checkout`, or
  `git stash`) unless the user explicitly asks for it.
- Review packets/outputs, the commit-message file, pending manifest, and
  explanation belong under `${TMPDIR:-/tmp}`, never in the repository or commit.
- Stop before staging on a detached or unborn `HEAD`, or during a merge,
  cherry-pick, revert, or rebase. This workflow only creates single-parent
  commits from an existing attached branch.

## Phase 0: understand and split the work

Before staging anything, require `git rev-parse --verify HEAD` to succeed, require
`git branch --show-current` to be nonempty, and confirm no merge, cherry-pick,
revert, or rebase is in progress. Stop and ask rather than using this workflow to
create a root commit or finish an existing Git operation.

Then:

1. Read repository instructions such as `AGENTS.md` and `CLAUDE.md`.
2. Inspect `git status --short`, staged and unstaged diffs, untracked files, and
   `git log --format='%s' -20`.
3. Identify the project's relevant validation commands and commit-message style.
4. Divide the work into the smallest coherent commits.

A coherent commit has one purpose and can be reviewed on its own. Keep these
items together:

- an implementation change and its direct tests;
- a behavior change and documentation that describes that behavior;
- a bug fix and its regression test.

Prefer separate commits for independent features, mechanical refactors, tooling,
themes, or unrelated documentation. Order prerequisites before their consumers.
Do not split so aggressively that an intermediate commit is broken or misleading.
A request to "commit this" authorizes a commit workflow, not a single commit;
never use the user's singular wording as evidence that the whole dirty tree is one
atomic unit.

### Mandatory commit-boundary challenge

Before staging, challenge the proposed series from both the requester and reviewer
perspectives. Treat a commit as an **oversized candidate** when any of these warning
signals apply:

- more than 12 changed paths;
- more than 800 added-plus-deleted lines;
- more than one independently explainable behavior axis, such as data model or
  migration, runtime behavior, UI, and workflow/tooling.

These are review triggers, not automatic split points. For every oversized
candidate:

1. Propose at least two concrete alternative splits.
2. For each split, identify the prerequisite order, direct tests/docs, and whether
   every intermediate commit remains buildable, reviewable, and honest.
3. Explain why the selected boundary is smaller and more coherent than those
   alternatives. "The files are intertwined," "it is one user request," and
   "multiple reviews take longer" are not sufficient by themselves.
4. Show the user the path count, changed-line count, behavior axes, and selected
   split **before staging**. If still choosing the oversized single commit, obtain
   explicit user agreement to send that boundary to review; ordinary commit
   approval is not a substitute. That agreement does not bind either reviewer or
   excuse a coherent smaller split they discover.

On the default reviewed path, the requester-side plan and both external reviews
are independent gates. A review finding that a coherent smaller split remains
returns the workflow to boundary planning; do not resubmit the unchanged unit on
strength of the prior user agreement. The implementing agent must not send an
obviously oversized commit to reviewers and expect them to repair the boundary
decision later. An explicit emergency bypass skips only the external-review gates
as defined above, never Phase 0's boundary challenge.

### Minimality inventory

Before accepting any added file, dependency, script, config, abstraction, or test
helper, write a minimality inventory:

- What concrete behavior or durable developer interface requires it?
- What breaks if it is omitted?
- Can an existing command, direct code, or temporary file provide the same value?
- Who or what keeps it correct as the project evolves?
- What maintenance, portability, security, or rot surface does it add?

The default is omission when the only benefit is convenience for the current
workflow. Tests and validation are required; committing a new harness to run them
is not automatically required.

### Record and present the series

Write down the complete proposed series before the first review. For every commit,
record:

- proposed message;
- purpose and user-visible effect;
- files or hunks it owns;
- dependency on earlier/later commits;
- validation expected for that commit.

Tell the user the proposed series briefly, including the boundary-challenge
metrics and alternatives for every oversized candidate. This is a plan, not
approval to commit. If meaningful boundaries are ambiguous, ask one focused
question before staging.

## Per-commit workflow

Use all four steps for the default reviewed path. For an explicitly authorized
emergency bypass, complete step 1, skip steps 2 and 3, capture the same immutable
fingerprints, and use step 4's approval, commit, hook, and post-commit checks.

### 1. Stage exactly one change

1. Confirm whether the index already contains changes. Never silently discard or
   absorb pre-existing staged work. If it does not exactly match the current
   commit, stop and ask the user how to handle it.
2. Stage only this commit:
   - Prefer `git add -- <exact paths>` when a whole file belongs to it.
   - Use `git add -p -- <exact paths>` when one file contains changes for several
     commits and hunk selection is unambiguous.
   - If intertwined hunks cannot be separated safely, do not guess. Rework the
     split or ask the user.
   - Never use `git add .` or `git add -A` in a dirty multi-commit tree.
3. Inspect the complete staged result:

   ```bash
   git diff --cached --check
   git diff --cached --stat
   git diff --cached --name-status
   git diff --cached --no-ext-diff
   ```

4. Also inspect what remains unstaged. Confirm that tests and documentation needed
   to make the current commit honest are not accidentally deferred.
5. If the staged diff is empty, stop. Do not create an empty commit.

Run the smallest project-appropriate validation that meaningfully covers this
commit. Prefer validating the exact index by materializing it under
`${TMPDIR:-/tmp}` with `git checkout-index -a --prefix=...`. Keep dependency
links, generated config, and one-off commands there. If exact-index validation is
not practical, state precisely what was tested from the working tree and which
unstaged changes could affect it. Do not auto-stash to isolate tests and do not
commit a validation harness merely to make the command shorter.

### 2. Run two blind adversarial reviews until both return explicit LGTM

Each round has two fresh `claude -p` calls over the same staged diff and evidence,
but with different mandates. Complete both calls before sharing either result
with the other. They are independent attempts by the same model, not independent
models; blindness and distinct mandates reduce anchoring but do not prove truth.

#### Build the shared evidence packet

Before either reviewer starts, create a unique temporary review directory and
write the exact proposed message to a nonempty file there. Capture the immutable
review snapshot at this point, not after the reviewers return:

```bash
REVIEW_DIR="${TMPDIR:-/tmp}/commit-with-claude-review/$(basename "$PWD")-$$"
mkdir -p "$REVIEW_DIR"
COMMIT_MESSAGE_FILE="$REVIEW_DIR/commit-message.txt"
# Write the exact proposed subject/body to COMMIT_MESSAGE_FILE before continuing.
test -s "$COMMIT_MESSAGE_FILE"
BASE_HEAD="$(git rev-parse --verify HEAD)"
BRANCH="$(git branch --show-current)"
test -n "$BASE_HEAD"
test -n "$BRANCH"
TREE_OID="$(git write-tree)"
STAGED_OID="$(git diff --cached --binary --no-ext-diff --no-textconv | git hash-object --stdin)"
MESSAGE_OID="$(git hash-object "$COMMIT_MESSAGE_FILE")"
```

Embed these values and the exact message in both packets. Create a base Markdown
packet under `${TMPDIR:-/tmp}/commit-with-claude-review/` containing:

1. **Review contract** — read-only adversarial review; the staged diff is primary.
2. **User objective and explicit preferences** — including minimality and
   maintenance constraints, not merely the implementer's framing.
3. **Complete commit series** — prior SHAs/messages/purposes, current commit, and
   all future messages/purposes/paths/dependencies.
4. **Proposed commit message** — exact body and trailers included.
5. **Validation evidence** — exact commands, outputs, whether the index or working
   tree was tested, and every known limitation. Author-reported PASS is a claim,
   not reviewer-verified evidence.
6. **Minimality inventory** — every added file/dependency/script/config/helper,
   what breaks without it, alternatives considered, and maintenance surface.
7. **Previous rounds** — findings from both reviewers, resolution or rebuttal,
   evidence, and rerun validation. Same-round outputs remain absent.
8. **Repository state** — branch, `HEAD`, status, recent message style, staged
   stat, and remaining unstaged stat.
9. **Full staged diff** — never summarize or truncate it. Split the commit if the
   full diff is too large for a useful review.
10. **Relevant surrounding code and future diff excerpts** — enough to test
    interactions, without unrelated context inflation.
11. **Standalone honesty** — identify exactly which earlier commits are allowed
    dependencies. A future commit or series-scoped document cannot excuse a
    broken, misleading, unnecessary, or untested current commit.
12. **Verdict contract** — final line exactly `VERDICT: LGTM` or
    `VERDICT: REQUEST_CHANGES` and nowhere else.

Both packets must also include **commit-boundary evidence**: changed paths,
added-plus-deleted lines, behavior axes, at least two split candidates for an
oversized commit, why the chosen unit is standalone, and any explicit user
agreement to send an oversized unit to review. Both reviewers must recompute the
size signals from the full staged diff and perform the audit regardless of the
requester's classification. Missing or understated boundary evidence invalidates
the round.

Do not send secrets, credentials, private keys, `.env` values, or unrelated
personal data. Stop and ask if load-bearing context is sensitive.

The packet is the reviewer's complete evidence set. The reviewer has no tools and
must not request, emit, simulate, or claim a Bash/Read/Grep/tool call. If the
packet lacks load-bearing evidence, it must mark the claim unverifiable and
request changes instead of trying to inspect the repository.

#### Reviewer A: correctness and regression attacker

Append a role-specific mandate that requires the reviewer to:

- Begin from a skeptical prior and try to falsify the implementation, tests, and
  validation claims rather than confirm the packet's narrative.
- Trace changed behavior through relevant call sites and public contracts.
- Construct concrete failure hypotheses and edge cases, including tests that can
  pass while behavior is wrong, broken intermediate states, error paths,
  compatibility, performance, and security when relevant.
- Separate facts visible in the diff/context from author assertions; mark any
  load-bearing assertion that cannot be verified.
- Review commit atomicity and message accuracy. Independently propose at least one
  smaller split and test whether it would preserve buildability, migration
  compatibility, and direct test coverage. Reject a boundary whose only defense
  is that a future commit repairs its intermediate state, while leaving
  repository-surface minimality as Reviewer B's primary responsibility.

#### Reviewer B: scope, minimality, and maintenance attacker

Append a different mandate that requires the reviewer to:

- Audit **every changed path**, with explicit scrutiny for each added file,
  dependency, script, config, helper, abstraction, and documentation artifact.
- Ask what observable behavior breaks if each addition is removed, and compare it
  with existing commands, direct implementation, or a temporary external setup.
- Reject convenience-only repository surface unless an enduring need and owner
  are demonstrated.
- Attack scope creep, duplicate mechanisms, hidden coupling, portability,
  long-term maintenance, stale documentation, and likely rot.
- Treat future commits and the author's declared series as context, not as an
  exemption from current-commit honesty or standalone validity.
- Review whether tests prove the claimed behavior and whether the commit message
  admits the real scope.
- Treat commit-boundary quality as a first-class review item. Independently propose
  at least one smaller split for every commit and reject the commit when that
  split is coherent and independently reviewable, even if the user previously
  agreed to send the larger boundary for review. Reviewer effort, packet
  preparation cost, and the fact that all changes serve one broad feature are not
  reasons to approve an oversized unit.

#### Require a concrete attack ledger

Both packets require this response structure before the verdict:

```text
## Commit-boundary audit
- Size signals: <paths, changed lines, behavior axes>
- Smaller split attempted: <concrete boundary and dependency order>
- Result: <why current unit is minimal, or actionable split finding>

## Claims checked
- <claim>: <verified, contradicted, or unverifiable> — <evidence>

## Attack ledger
- Target: <specific file, behavior, boundary, or test>
  Hypothesis: <concrete way it could be wrong or unnecessary>
  Evidence: <diff/context examined and reasoning>
  Result: <finding or why the attack did not hold>

## Findings
- <actionable finding with severity and evidence, or "None">

<exactly one allowed verdict token on the final line>
```

A missing or generic commit-boundary audit, or a generic ledger such as
"reviewed tests; looks good," is malformed and cannot approve. The reviewer must
name concrete split alternatives, targets, and attempted counterexamples.
Do not demand fabricated findings: an evidence-backed failed attack is valid.

#### Execute the blind round

Create two packet files from the same base snapshot. Neither may contain the
other's same-round output. Define `CORRECTNESS_PACKET`, `MINIMALITY_PACKET`, both
`*_OUTPUT`, and both `*_ERROR` paths under the current temporary review
directory. Run separate read-only, non-persistent calls and keep stdout/stderr
separate:

```bash
REVIEW_SYSTEM_PROMPT='You are a skeptical read-only code reviewer. You have no tools. Treat the supplied packet as the complete evidence set. Never request, emit, simulate, or claim a tool or shell command. If evidence is missing, mark it unverifiable and request changes. Follow the packet output schema exactly.'

claude -p --safe-mode --setting-sources "" --tools "" \
  --system-prompt "$REVIEW_SYSTEM_PROMPT" \
  --no-session-persistence --output-format text \
  < "$CORRECTNESS_PACKET" > "$CORRECTNESS_OUTPUT" 2> "$CORRECTNESS_ERROR"

claude -p --safe-mode --setting-sources "" --tools "" \
  --system-prompt "$REVIEW_SYSTEM_PROMPT" \
  --no-session-persistence --output-format text \
  < "$MINIMALITY_PACKET" > "$MINIMALITY_OUTPUT" 2> "$MINIMALITY_ERROR"
```

#### Handle both results

- Non-zero exit, empty output, any requested/emitted/simulated tool call, a
  generic/missing commit-boundary audit or attack ledger, malformed verdict,
  contradictory output, or conditional LGTM fails that reviewer gate.
- Finish both blind calls, then investigate every finding on its merits.
- Fix valid findings, update direct tests/docs, restage only this commit, rerun
  validation, rebuild both complete packets, and rerun **both** reviewers.
- For a factually wrong finding, put a concise evidence-based rebuttal in both
  next-round packets. Both later explicit LGTMs are still required.
- Ask the user when a finding requires product/scope judgment. Do not invent a
  tradeoff merely to satisfy a reviewer.
- One reviewer cannot waive the other. Approval requires two final-line
  `VERDICT: LGTM` responses, two concrete attack ledgers, and no unresolved
  finding or condition in either output.

After both valid LGTMs, re-verify the pre-review snapshot before creating an
approval manifest:

```bash
test -s "$COMMIT_MESSAGE_FILE"
test "$(git rev-parse --verify HEAD)" = "$BASE_HEAD"
test "$(git branch --show-current)" = "$BRANCH"
test "$(git write-tree)" = "$TREE_OID"
test "$(git diff --cached --binary --no-ext-diff --no-textconv | git hash-object --stdin)" = "$STAGED_OID"
test "$(git hash-object "$COMMIT_MESSAGE_FILE")" = "$MESSAGE_OID"
```

Any mismatch voids both LGTMs. Create a pending-approval manifest containing
these pre-review values, the exact message,
both packet/output paths, validation evidence, and the commit's series position.
This carries both reviewer gates safely across the user-approval turn.

### 3. Explain the doubly reviewed change concisely

Only after both adversarial reviewers return valid LGTM, invoke the
`explain-with-diagrams` skill
(`/skill:explain-with-diagrams` in Pi, `/explain-with-diagrams` where exposed).
If skill commands are unavailable, load the sibling instructions from
`../explain-with-diagrams/SKILL.md` and follow them. If neither route is
available, stop before asking for approval and report the missing required
explanation dependency.

Apply these workflow-specific constraints, which override that skill's generic
length defaults:

- Save the Markdown under `${TMPDIR:-/tmp}`.
- Keep it concise. Prefer one small Mermaid diagram; add a second only when it
  replaces substantial prose. Include at most one short example when it makes the
  behavior concrete.
- Make it self-contained for a reader with no prior conversation context.
- Explain the motivation, resulting behavior or design, scope boundary, relation
  to earlier/later commits, validation, both reviewer mandates and LGTMs, and the
  exact planned commit message.
- Do not paraphrase the raw diff, enumerate obvious file edits, cite disposable
  line numbers, or repeat information the user can learn by reading the staged
  code.
- Do not invent labels or use project-internal nicknames. Use necessary public
  names sparingly and explain their meaning in plain language on first use.
- Optimize for the receiver: show the mental model, why the boundary is useful,
  and one concrete before/after flow when helpful.

After writing it, verify that `git diff --cached` is unchanged and that the
explanation file is not under the repository root.

### 4. Ask the user, then commit the exact reviewed state

Present only:

- both Claude reviewer LGTM statuses;
- exact proposed commit message;
- validation result;
- staged diff stat;
- explanation Markdown path;
- this commit's place in the remaining series.

Ask explicitly: **「このstaged内容を、上記メッセージでコミットしてよいですか？」**
Then stop and wait. Do not interpret review LGTM as user approval.

If the user requests code or message changes, apply them and return to step 1/2.
A changed staged diff or message always requires two fresh blind Claude reviews.
Explanation-only wording changes do not invalidate LGTM when code and message
are unchanged, but regenerate the explanation before asking again.

On explicit user approval, reload the pending manifest and verify:

```bash
test -s "$COMMIT_MESSAGE_FILE"
test "$(git rev-parse --verify HEAD)" = "$BASE_HEAD"
test "$(git branch --show-current)" = "$BRANCH"
test "$(git write-tree)" = "$TREE_OID"
test "$(git diff --cached --binary --no-ext-diff --no-textconv | git hash-object --stdin)" = "$STAGED_OID"
test "$(git hash-object "$COMMIT_MESSAGE_FILE")" = "$MESSAGE_OID"
git diff --cached --check
```

Also inspect `git status --short`. If any check fails, do not commit; explain what
changed and return to Claude review when relevant.

Commit with the exact reviewed message file:

```bash
git commit --cleanup=verbatim -F "$COMMIT_MESSAGE_FILE"
```

Never add `--no-verify`. If the command fails, inspect the index and working tree;
do not retry until any hook mutation is validated and both reviews and user
approval are renewed. If it succeeds, verify the created commit before reporting
success:

```bash
test "$(git rev-parse HEAD^)" = "$BASE_HEAD"
test "$(git rev-list --parents -n 1 HEAD | wc -w | tr -d ' ')" = 2
test "$(git rev-parse HEAD^{tree})" = "$TREE_OID"
test "$(git log -1 --format=%B)" = "$(cat "$COMMIT_MESSAGE_FILE")"
git show --stat --oneline --decorate HEAD
git status --short
```

A hook may mutate the tree or message and still let `git commit` succeed. If any
post-commit equality check fails, do not amend, reset, or rewrite automatically.
Report that an unapproved commit exists, show the divergence, and ask the user
how to proceed.

Report the new SHA and any remaining changes. Remove the pending manifest, add the
new commit to the "already created" section of the next review packet, and repeat
from step 1 for the next planned commit.

## Stop conditions

Stop and ask the user when:

- atomic boundaries are ambiguous;
- an oversized candidate still has a coherent smaller split, or sending it whole
  to review lacks the user's explicit boundary agreement;
- unrelated pre-staged work exists;
- required review context is sensitive;
- validation cannot pass;
- on the default path, either Claude reviewer cannot produce an unqualified,
  evidence-backed LGTM or a finding needs user judgment;
- the staged diff/message/branch/HEAD differs from the pre-review snapshot;
- `HEAD` is detached or unborn, or a merge/cherry-pick/revert/rebase is in
  progress;
- on the default path, the required explanation skill/instructions are unavailable;
- a hook fails or changes the reviewed state before a successful commit;
- a successful commit's parent, tree, or message differs from the approved values
  (report the existing commit and ask; never rewrite it automatically);
- the user rejects or has not yet approved the current commit.

Finishing the skill means every requested commit was independently staged,
validated, then either blind-dual-reviewed or explicitly bypass-authorized,
approved, and committed—or the workflow stopped safely at a clearly reported
gate. Never push unless the user separately asks for it.
