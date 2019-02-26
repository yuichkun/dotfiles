ZSH_ROOT=~/dotfiles/zsh

# init zsh plugins
source ~/.zplug/init.zsh
zplug load --verbose
source ~/enhancd/init.sh

# set tmux lancher
source $ZSH_ROOT/tmux.zsh
# set aliases
source $ZSH_ROOT/aliases.zsh
# load basic settings
source $ZSH_ROOT/settings.zsh
# load env variables
source $ZSH_ROOT/env.zsh

