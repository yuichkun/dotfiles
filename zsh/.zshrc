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
  ZPLUG_LOADFILE=$ZSH_ROOT/packages.zsh
  source ~/.zplug/init.zsh
  zplug load --verbose
  # set tmux lancher
  source $ZSH_ROOT/tmux.zsh
  # load commands
  source $ZSH_ROOT/commands.zsh

  unfunction LOG
}

INIT_ZSH
