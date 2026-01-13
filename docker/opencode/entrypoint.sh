#!/bin/bash

# イメージのバージョンと現在のバージョンを比較
IMAGE_VERSION=$(cat /root-default/.image-version 2>/dev/null || echo "0")
CURRENT_VERSION=$(cat /root/.image-version 2>/dev/null || echo "0")

if [ "$IMAGE_VERSION" != "$CURRENT_VERSION" ]; then
    echo "Image updated ($CURRENT_VERSION -> $IMAGE_VERSION), syncing new files..."
    # 新しいファイルのみコピー（既存ファイルは上書きしない）
    cp -an /root-default/. /root/
    echo "$IMAGE_VERSION" > /root/.image-version
fi

exec opencode "$@"
