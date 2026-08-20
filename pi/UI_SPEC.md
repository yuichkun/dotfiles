# Pi UI reduction spec

This document is the cross-surface implementation contract for Pi's reduced UI. Extension READMEs own local implementation details; this file owns the shared retain / on-demand / remove behavior. Preserve useful behavior and remove only agreed low-value chrome.

## Footer

Normal width uses one row with project context on the left and model context on the right:

```text
~/dotfiles [master]                         gpt-5.6-sol · xhigh · ctx 34%
```

When both groups do not fit with at least two spaces between them, switch to two rows instead of dropping a field:

```text
~/dotfiles [master]
gpt-5.6-sol · xhigh · ctx 34%
```

Rules:

- Model: model id only; omit provider.
- Context: rounded percentage only.
- Cwd: replace the home prefix with `~`.
- Git branch: render as `[branch]`; omit the label outside a Git repository.
- Branch color: clean = `success`; staged-only = `warning`; unstaged, untracked, conflicted, or mixed = `error`; status pending or unavailable = `muted`.
- Context remains `muted`; render unknown usage as `ctx ?`.
- At narrow widths that can represent all five identifiers, truncate values without dropping a field; below that minimum, remain width-safe.
- Do not render cost, cumulative tokens, cache stats, provider, session name, auto-compaction label, or extension statuses.

Runtime refresh, coalescing, and cleanup details are owned by the [status-footer README](extensions/status-footer/README.md). The cross-surface invariant is that footer values stay current without stale updates or leaked processes/listeners after session reload or shutdown.

## Conversation boundary

User messages use `#211f2a` as `userMessageBg`. Assistant messages keep the terminal background. Do not add speaker labels or separator rules.

```text
User prompt                         background: #211f2a

Assistant response                  background: terminal
```

The annotation above is non-literal; no border or label is rendered.

## Collapsed built-in Tool rows

Implementation details are owned by the [tool-ui README](extensions/tool-ui/README.md). Preserve the current signature, semantic WHY+WHAT summary, summary lifecycle, and mutation previews. Remove low-value deterministic counts and all collapsed durations.

### Read

```text
⏺ Read(src/index.ts)
  ⎿  調査対象を把握するため、実装を確認しました
```

Do not show `Read 128 lines` or duration.

### Write

```text
⏺ Write(src/new.ts)
  ⎿  新しい設定を適用するため、設定ファイルを作成しました
      <bounded syntax-highlighted content preview>
      <overflow hint with the bound expand key>
```

Do not show `Wrote 42 lines` or duration. Preserve the existing bounded preview and overflow hint.

### Edit

```text
⏺ Update(src/index.ts)
  ⎿  表示を簡素化するため、Tool formatterを更新しました
      <bounded syntax-aware diff with context on both sides>
```

Hide the diff count in collapsed mode because the preview already shows the mutation. Preserve the existing bounded preview and exact expanded count.

### Bash

```text
⏺ Bash(tests)
  ⎿  24 tests passed · 表示変更の退行を防ぐため、Tool UI testsを実行しました
```

Do not show `Ran 1 shell command` or duration. Keep test outcomes.

### Search / Find / List

Keep the semantic summary. Remove generic positive counts such as result lines, files, and entries. Keep zero-result outcomes (`no matches`, `0 files`, and `0 entries`) as `No matches`; also keep `truncated` and errors.

### Running and errors

Keep `summarizing…` while generated summaries are pending. Keep the current pending/running markers and spinner. Errors retain their final error line and failure summary.

An error remains diagnosable without expansion:

```text
⏺ Bash(tests)
  ⎿  Error: Command exited with code 1 · Tool UIの回帰確認に失敗しました
```

### Expanded mode

`Ctrl+O` remains unchanged and exposes exact arguments/commands for supported call renderers, complete output/diff, batch position, summary fallback reason, and facts omitted from collapsed mode. Settled Edit results keep the complete diff without rerunning their asynchronous exact-call renderer. Persisted compact metadata remains readable without regeneration.

## Living Plan Tool transcript

Implementation details for both Plan surfaces are owned by the [plan-dashboard README](extensions/plan-dashboard/README.md). Treat routine Plan operations as background orchestration:

- Hide collapsed call, running, success, inspection, and consultation-complete rows for `get`, `set`, `progress`, `compact`, and `consult`.
- Keep failures visible in collapsed mode.
- Restore the existing operation, revision, inspection, and consultation details when `Ctrl+O` expands tools.
- Do not change the stored Tool Result, Plan state, history, context injection, or staleness accounting.
- Rely on the standard `Working...` indicator for in-flight feedback and on the fixed Plan header for current state.

## Living Plan header

Use a four-row frame. Keep the Plan title in the top border, then keep the progress bar with exact done/total and the current or next Step title on separate content rows.

```text
╭─ PLAN · piの表示整理 ────────────────────╮
│ [━◆─────────] 1/8                       │
│ 表示要件を決める                           │
╰─────────────────────────────────────────╯
```

Rules:

- Do not show internal Step ids such as `S02`.
- Do not show `PROGRESS`, `NOW`, or `NEXT` labels.
- When stale, add only `⚠ STALE` to the top border; omit work/turn counters. Use `secondary` for mild staleness and `caution` for severe staleness.
- Preserve semantic progress colors for done, superseded, active, and remaining segments.
- When no current or ready Step remains, show neutral `✔ PLAN COMPLETE`.
- Truncate the Plan and Step titles at narrow widths without exceeding the frame; below four terminal columns, fall back to a single `PLAN` line.

## Explicitly unchanged

- Pi 0.84.2 standard working indicator: a blank row followed by the 80ms braille spinner and muted `Working...`.
- Hidden thinking content controlled by `settings.json` `hideThinkingBlock`, and the blank hidden-thinking label owned by `extensions/quiet-thinking/`.
- Tool summary generation, batching, usage accounting, fallback, deduplication, and persistence owned by `extensions/tool-ui/`.
- Expanded Tool rendering and output coloring.
- Write and Edit preview sizes.
