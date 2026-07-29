#!/usr/bin/env bash
set -Eeuo pipefail

# Link the shared Agent Skills directory into Pi's cross-client location and
# Claude Code's personal skills location. Existing paths are backed up before
# replacement, and a failed installation is rolled back.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
BACKUP_DIR="${AGENT_SKILLS_BACKUP_DIR:-$HOME/.agent-skills-backup/$(date +%Y%m%d-%H%M%S)}"
DRY_RUN=0
BACKUP_CREATED=0
CHANGED_TARGETS=()
CHANGED_BACKUPS=()

usage() {
  cat <<'USAGE'
Usage: agent-skills/install.sh [options]

Options:
  -n, --dry-run  Print what would change without modifying files
  -h, --help     Show this help

Environment:
  AGENT_SKILLS_BACKUP_DIR  Override the backup directory
USAGE
}

log() {
  printf '[agent-skills] %s\n' "$*"
}

print_command() {
  printf '[dry-run]'
  printf ' %q' "$@"
  printf '\n'
}

is_same_link() {
  local target="$1"
  [[ -L "$target" && "$(readlink "$target")" == "$SCRIPT_DIR" ]]
}

validate_source() {
  local skill_count=0
  local skill_file

  shopt -s nullglob
  for skill_file in "$SCRIPT_DIR"/*/SKILL.md; do
    skill_count=$((skill_count + 1))
  done
  shopt -u nullglob

  if [[ "$skill_count" -eq 0 ]]; then
    log "error: no skill directories found under $SCRIPT_DIR"
    return 1
  fi

  log "source contains $skill_count skills"
}

rollback() {
  local status=$?
  trap - ERR
  set +e

  log "installation failed; rolling back"
  local index
  for ((index=${#CHANGED_TARGETS[@]} - 1; index >= 0; index--)); do
    local target="${CHANGED_TARGETS[$index]}"
    local backup="${CHANGED_BACKUPS[$index]}"

    if [[ -L "$target" && "$(readlink "$target")" == "$SCRIPT_DIR" ]]; then
      rm "$target"
    fi
    if [[ -n "$backup" && ( -e "$backup" || -L "$backup" ) ]]; then
      mkdir -p "$(dirname "$target")"
      mv "$backup" "$target"
    fi
  done

  exit "$status"
}

link_path() {
  local target="$1"
  local backup_rel="$2"

  if is_same_link "$target"; then
    log "ok $target -> $SCRIPT_DIR"
    return 0
  fi

  local backup=""
  if [[ -e "$target" || -L "$target" ]]; then
    backup="$BACKUP_DIR/$backup_rel"
    if [[ -e "$backup" || -L "$backup" ]]; then
      log "error: backup target already exists: $backup"
      return 1
    fi
    log "backup $target -> $backup"
  fi
  log "link $target -> $SCRIPT_DIR"

  if [[ "$DRY_RUN" == 1 ]]; then
    if [[ -n "$backup" ]]; then
      print_command mkdir -p "$(dirname "$backup")"
      print_command mv "$target" "$backup"
    fi
    print_command mkdir -p "$(dirname "$target")"
    print_command ln -s "$SCRIPT_DIR" "$target"
    return 0
  fi

  if [[ -n "$backup" ]]; then
    mkdir -p "$(dirname "$backup")"
    BACKUP_CREATED=1
    mv "$target" "$backup"
  fi

  CHANGED_TARGETS+=("$target")
  CHANGED_BACKUPS+=("$backup")
  mkdir -p "$(dirname "$target")"
  ln -s "$SCRIPT_DIR" "$target"
}

verify_link() {
  local target="$1"
  if ! is_same_link "$target"; then
    log "error: link verification failed: $target"
    return 1
  fi
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

validate_source

if [[ "$DRY_RUN" == 0 ]]; then
  trap rollback ERR
fi

link_path "$HOME/.agents/skills" ".agents/skills"
link_path "$HOME/.claude/skills" ".claude/skills"

if [[ "$DRY_RUN" == 0 ]]; then
  verify_link "$HOME/.agents/skills"
  verify_link "$HOME/.claude/skills"
  trap - ERR
fi

if [[ "$BACKUP_CREATED" == 1 ]]; then
  log "backup saved under $BACKUP_DIR"
fi
log "done"
