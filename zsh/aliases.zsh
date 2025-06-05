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
start_pr_review(){
  reviews_awaiting_me | grep -v 'DRAFT' | fzy | awk '{print $1}' | xargs gh pr checkout --recurse-submodules --force
  gh pr view --web
}
my_pr(){
  gh pr list --author "@me" | fzy | awk '{print $1}' | xargs gh pr checkout --recurse-submodules --force
}
alias docker_who_died='docker-compose ps | grep -v Up'

# Global Aliases
alias -g G='| grep -i'
alias -g N='; notify'

function create-three-project() {
    if [ -z "$1" ]; then
        echo "Error: Project name is required"
        echo "Usage: create-three-project <project-name>"
        return 1
    fi
    
    npm create vite@latest "$1" -- --template vanilla-ts
    cd "$1"
    npm install three
    npm install -D @types/three
}

function create-r3f-project() {
    if [ -z "$1" ]; then
        echo "Error: Project name is required"
        echo "Usage: create-three-project <project-name>"
        return 1
    fi
    
    npm create vite@latest "$1" -- --template react-ts
    cd "$1"
    npm install three @react-three/fiber @react-three/drei
    npm install -D @types/three
}