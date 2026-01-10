FROM --platform=linux/amd64 mcr.microsoft.com/devcontainers/universal:linux

USER root

# opencode インストール
RUN curl -fsSL https://opencode.ai/install | bash -s -- --no-modify-path \
    && mv /root/.opencode/bin/opencode /usr/local/bin/opencode

# /root の初期状態を保存（ボリュームマウント時の初期化用）
RUN cp -a /root /root-default

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/entrypoint.sh"]
