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

kubectl-exec-bash(){
  kubectl get po --field-selector=status.phase=Running -o name -n $1 | fzy | xargs -t -o -I % kubectl exec -n $1 -it % -- /bin/bash
}

success() {
  afplay $ZSH_ROOT/success.mp3
}

failure() {
  afplay $ZSH_ROOT/failure.mp3
}

co() {
  local branches branch
  branches=$(git branch -a) &&
  branch=$(echo "$branches" | fzf +s +m -e) &&
  git checkout $(echo "$branch" | sed "s:.* remotes/origin/::" | sed "s:.* ::")
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

zen() {
  figlet "Zen Mode"
  tmux split-window -h
  tmux split-window -v
  tmux select-pane -t 0
  tmux split-window -v
}

slice-video-by-time(){
  # $1 = video file
  # $2 = start time
  # $3 = end time
  ffmpeg -ss $2 -i $1 -to $3 -c copy output.mp4
}