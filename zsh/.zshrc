function INIT_ZSH(){
  ZSH_ROOT=~/dotfiles/zsh
  # temporary logger
  function LOG(){
    local LIGHT_GREEN='\033[1;32m'
    local NC='\033[0m'
    echo "${LIGHT_GREEN}LOAD: ${NC}$1"
  }

  # load basic settings
  source $ZSH_ROOT/settings.zsh
  # set aliases
  source $ZSH_ROOT/aliases.zsh
  # load env variables
  source $ZSH_ROOT/env.zsh
  # init zsh plugins
  LOG LOAD_PLUGINS
  # brew shellenv は login shell でしか fpath に site-functions を足さないため、
  # login/non-login 間で fpath を揃えて compdump の相互無効化を防ぐ
  (( ${fpath[(I)/opt/homebrew/share/zsh/site-functions]} )) || \
    fpath=(/opt/homebrew/share/zsh/site-functions $fpath)

  source ~/.antidote/antidote.zsh
  antidote load $ZSH_ROOT/plugins.txt

  # compinit はシェル全体でここ1回のみ。dump が24時間以内なら再検証をスキップする
  autoload -Uz compinit
  if [[ -n ${ZDOTDIR:-$HOME}/.zcompdump(#qN.mh-24) ]]; then
    compinit -C
  else
    compinit
  fi
  # load commands
  source $ZSH_ROOT/commands.zsh

  eval "$(mcfly init zsh)"

  unfunction LOG
}

INIT_ZSH
