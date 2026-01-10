#!/bin/bash

# /root が空（初回起動）なら初期ファイルをコピー
if [ ! -f /root/.initialized ]; then
    cp -a /root-default/. /root/
    touch /root/.initialized
fi

exec opencode "$@"
