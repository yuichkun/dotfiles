LOG COMMANDS


tovim(){
  tmp="$(mktemp)"
  set -e
  trap "rm -f \"$tmp\"" ERR
  cat - > "$tmp"
  vim "$tmp" </dev/tty >/dev/tty
  cat "$tmp"
  rm -f "$tmp"
}