#!/usr/bin/env bash
set -euo pipefail

# Link Claude Code user CLAUDE.md from this dotfiles repository.
# Existing non-matching targets are backed up before replacement.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${CLAUDE_BACKUP_DIR:-$HOME/.claude-backup/$(date +%Y%m%d-%H%M%S)}"
DRY_RUN=0

usage() {
  cat <<'USAGE'
Usage: claude/install.sh [options]

Options:
  -n, --dry-run  Print what would change, but do not modify files
  -h, --help     Show this help

Environment:
  CLAUDE_BACKUP_DIR  Override backup dir for replaced files

Managed paths, if present under dotfiles/claude:
  CLAUDE.md -> ~/.claude/CLAUDE.md
USAGE
}

log() { printf '[claude-install] %s\n' "$*"; }

run() {
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '[dry-run] %q' "$1"
    shift
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

is_same_link() {
  local target="$1"
  local source="$2"
  [[ -L "$target" && "$(readlink "$target")" == "$source" ]]
}

backup_existing() {
  local target="$1"
  local rel="$2"

  if [[ ! -e "$target" && ! -L "$target" ]]; then
    return 0
  fi

  local backup_target="$BACKUP_DIR/$rel"
  log "backup $target -> $backup_target"
  run mkdir -p "$(dirname "$backup_target")"
  run mv "$target" "$backup_target"
}

link_path() {
  local rel="$1"
  local source="$SCRIPT_DIR/$rel"
  local target="$HOME/.claude/$rel"

  if [[ ! -e "$source" && ! -L "$source" ]]; then
    return 0
  fi

  if is_same_link "$target" "$source"; then
    log "ok $target -> $source"
    return 0
  fi

  backup_existing "$target" "$rel"
  log "link $target -> $source"
  run mkdir -p "$(dirname "$target")"
  run ln -s "$source" "$target"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--dry-run)
      DRY_RUN=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

link_path CLAUDE.md
log "done"
