FROM mcr.microsoft.com/devcontainers/base:ubuntu

USER root

# Node.js 24.x LTS (fnm経由)
RUN curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir /usr/local/bin --skip-shell \
    && /usr/local/bin/fnm install 24 \
    && /usr/local/bin/fnm default 24

# fnmのパス設定
ENV FNM_DIR=/root/.local/share/fnm
ENV PATH="/root/.local/share/fnm/aliases/default/bin:${PATH}"

# Bun
RUN curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/bun \
    && ln -s /usr/local/bin/bun /usr/local/bin/bunx

# Python + uv
RUN apt-get update && apt-get install -y python3 python3-venv \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && mv /root/.local/bin/uv /usr/local/bin/uv \
    && mv /root/.local/bin/uvx /usr/local/bin/uvx \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# OpenCode
RUN curl -fsSL https://opencode.ai/install | bash -s -- --no-modify-path \
    && mv /root/.opencode/bin/opencode /usr/local/bin/opencode

# host-cmd client
COPY host-cmd /usr/local/bin/host-cmd
RUN chmod +x /usr/local/bin/host-cmd

# host-cmd skill
COPY skills/host-cmd/SKILL.md /root/.claude/skills/host-cmd/SKILL.md

# Dockerfileのハッシュをバージョンとして記録（ボリューム同期判定用）
COPY Dockerfile /tmp/Dockerfile
RUN sha256sum /tmp/Dockerfile | cut -c1-12 > /root/.image-version && rm /tmp/Dockerfile

# /root の初期状態を保存（ボリュームマウント時の初期化用）
RUN cp -a /root /root-default

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/entrypoint.sh"]
