source ~/.zplug/init.zsh
# Aliases
# Colorize ls command
alias ls='ls -GF'
alias la='ls -a'
# wrap brew-file
if [ -f $(brew --prefix)/etc/brew-wrap ];then
  source $(brew --prefix)/etc/brew-wrap
fi

# set env variables
export PATH=$HOME/.nodebrew/current/bin:$PATH
export GOPATH=$HOME/go
export PATH="$HOME/.pyenv/versions/anaconda3-5.1.0/bin:$PATH"
export LANG=ja_JP.UTF-8
export PATH=/usr/local/mecab/bin:$PATH
ENHANCD_FILTER=fzy; export ENHANCD_FILTER

# Apps Secret Keys
# Tity
export TITY_CONSUMER_KEY="6K4nMAT1OK4XDbkIyWRzybgcw"
export TITY_CONSUMER_SECRET_KEY="oS4yQKRwFZyThpkDqVbV5UMQVAX3J6QeeiKrbZYr7XhCwrBkxT"

# ヒストリの設定
HISTFILE=~/.zsh_history
HISTSIZE=1000000
SAVEHIST=1000000
bindkey -v
bindkey '^R' history-incremental-search-backward

autoload -Uz compinit
compinit
autoload -Uz colors
colors
setopt auto_cd
setopt auto_pushd
# 重複したディレクトリを追加しない
setopt pushd_ignore_dups
setopt correct
export BG_COLOR=237


# 同時に起動したzshの間でヒストリを共有する
setopt share_history

# 同じコマンドをヒストリに残さない
setopt hist_ignore_all_dups

# スペースから始まるコマンド行はヒストリに残さない
setopt hist_ignore_space

# ヒストリに保存するときに余分なスペースを削除する
setopt hist_reduce_blanks

# 高機能なワイルドカード展開を使用する
setopt extended_glob

# 単語の区切り文字を指定する
autoload -Uz select-word-style
select-word-style default
# ここで指定した文字は単語区切りとみなされる
# / も区切りと扱うので、^W でディレクトリ１つ分を削除できる
zstyle ':zle:*' word-chars " /=;@:{},|"
zstyle ':zle:*' word-style unspecified

# 補完で小文字でも大文字にマッチさせる
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'

# ../ の後は今いるディレクトリを補完しない
zstyle ':completion:*' ignore-parents parent pwd ..

# sudo の後ろでコマンド名を補完する
zstyle ':completion:*:sudo:*' command-path /usr/local/sbin /usr/local/bin \
                   /usr/sbin /usr/bin /sbin /bin /usr/X11R6/bin

# ps コマンドのプロセス名補完
zstyle ':completion:*:processes' command 'ps x -o pid,s,args'
# 日本語ファイル名を表示可能にする
setopt print_eight_bit

# beep を無効にする
setopt no_beep

# フローコントロールを無効にする
setopt no_flow_control

# Ctrl+Dでzshを終了しない
setopt ignore_eof

# '#' 以降をコメントとして扱う
setopt interactive_comments


# Prompt Color
PROMPT="%F{196}%n %~ %f"

# Then, source plugins and add commands to $PATH
zplug load --verbose
bindkey "^N" autosuggest-accept
# load enhancd
source ~/enhancd/init.sh

