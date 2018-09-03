cd ~

# Install Homebrew
if ! type "brew" > /dev/null; then
    ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
fi

mkdir ~/.brewfile
cp ~/dotfiles/brewfile/Brewfile ~/.brewfile

brew install rcmdnk/file/brew-file
brew file install


# @TODO
# zplug
# iTerm2
# vim
