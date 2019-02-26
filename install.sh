cd ~

# Install Homebrew
if ! type "brew" > /dev/null; then
    ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
fi

mkdir ~/.brewfile
cp ~/dotfiles/brewfile/Brewfile ~/.brewfile

brew install rcmdnk/file/brew-file
brew file install

# setup zsh
# install zplug
curl -sL --proto-redir -all,https https://raw.githubusercontent.com/zplug/installer/master/installer.zsh | zsh

# Install tmux package manager
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm

# @TODO

# enhancd?
# vim
