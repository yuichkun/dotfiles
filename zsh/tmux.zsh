LOG TMUX

zen() {
  figlet "Zen Mode"
  tmux split-window -h
  tmux split-window -v
  tmux select-pane -t 0
  tmux split-window -v
}