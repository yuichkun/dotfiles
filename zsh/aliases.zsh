LOG ALIASES
# Aliases

## Colorize ls command
alias ls='ls -GF'
## Shorthands 
alias la='ls -a'
alias ll='ls -l'
alias c='code .'
alias o='open .'
alias gc='git clone'
alias t='tmux'
alias grep='grep  --color=auto --exclude-dir={.bzr,CVS,.git,.hg,.svn}'

# Global Aliases
alias -g G='| grep -i'


# Functions

tl(){
	tree -L $1 $2 | less;
}

mcd(){
	mkdir $1;
	cd $1;
}

lh(){
	open "http://localhost:$1";
}

json(){
	cat $1 | jq
}
trash(){
	mv $1 ~/.Trash
}

archive_github(){
	mv $1 ~/Documents/github/
}
