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
alias reviews_awaiting_me='gh pr list -S review-requested:yuichkun'
alias my_pr=' gh pr list --author "@me"'
start_pr_review(){
  reviews_awaiting_me | grep -v 'DRAFT' | fzy | awk '{print $1}' | xargs gh pr checkout --recurse-submodules
  gh pr view --web
}
checkout_to_my_pr(){
  my_pr | fzy | awk '{print $1}' | xargs gh pr checkout --recurse-submodules
}
alias docker_who_died='docker-compose ps | grep -v Up'

# Global Aliases
alias -g G='| grep -i'
alias -g N='; notify'
