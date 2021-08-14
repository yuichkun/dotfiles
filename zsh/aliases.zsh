LOG ALIASES
# Aliases

## Colorize ls command
alias ls='ls -GF'
## Shorthands 
alias la='ls -a'
alias ll='ls -l'
alias c='code .'
alias o='open .'
alias grep='grep  --color=auto --exclude-dir={.bzr,CVS,.git,.hg,.svn}'
alias git_cleans_what='git clean -fdxn'

# Global Aliases
alias -g G='| grep -i'
alias -g N='; notify'
