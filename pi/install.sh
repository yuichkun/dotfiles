#!/usr/bin/env bash
set -euo pipefail

# Bootstrap pi user configuration from this dotfiles repository.
# This script is intentionally conservative:
# - it symlinks only files/directories that exist under dotfiles/pi
# - it backs up existing non-matching targets before replacing them
# - it never copies auth/session/trust data
# - package installation is opt-in via --install-packages

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
BACKUP_DIR="${PI_BACKUP_DIR:-$HOME/.pi/agent-backup/$(date +%Y%m%d-%H%M%S)}"
DRY_RUN=0
INSTALL_PACKAGES=0

usage() {
  cat <<'USAGE'
Usage: pi/install.sh [options]

Options:
  -n, --dry-run           Print what would change, but do not modify files
      --install-packages  After linking settings, run `pi update --extensions`
                          to fetch package entries from settings.json
  -h, --help              Show this help

Environment:
  PI_CODING_AGENT_DIR     Override pi config dir (default: ~/.pi/agent)
  PI_BACKUP_DIR           Override backup dir for replaced files

Managed paths, if present under dotfiles/pi:
  settings.json, AGENTS.md, SYSTEM.md, APPEND_SYSTEM.md, keybindings.json, models.json
  extensions/, skills/, prompts/, themes/, agents/, chains/

Not managed on purpose:
  auth.json, trust.json, sessions/, npm/, git/
USAGE
}

log() { printf '[pi-install] %s\n' "$*"; }

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
  local target="$PI_DIR/$rel"

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

install_links() {
  run mkdir -p "$PI_DIR"

  local path
  for path in \
    settings.json \
    AGENTS.md \
    SYSTEM.md \
    APPEND_SYSTEM.md \
    keybindings.json \
    models.json \
    extensions \
    skills \
    prompts \
    themes \
    agents \
    chains
  do
    link_path "$path"
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--dry-run)
      DRY_RUN=1
      ;;
    --install-packages)
      INSTALL_PACKAGES=1
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

install_links

if [[ "$INSTALL_PACKAGES" == 1 ]]; then
  if ! command -v pi >/dev/null 2>&1; then
    log "pi command not found; skip package install"
  else
    log "install/update pi packages from settings"
    run pi update --extensions
  fi
else
  log "skip package install; pass --install-packages to fetch package entries"
fi

log "done"
log "next steps on a new machine: run pi /login, then trust projects as needed"
