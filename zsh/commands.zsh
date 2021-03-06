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

success() {
  afplay $ZSH_ROOT/success.mp3
}

failure() {
  afplay $ZSH_ROOT/failure.mp3
}

notify() {
  if [ "$?" = 0 ]; then
    success
  else
    failure
  fi
}

tl(){
	exa -T --color always $1 | less -R
}

lh(){
	open "http://localhost:$1";
}

trash(){
	mv $1 ~/.Trash
}