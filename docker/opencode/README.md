# OpenCode Docker 環境

ローカル開発用の OpenCode Docker 環境。

## 概要

- **ベースイメージ**: `mcr.microsoft.com/devcontainers/universal:linux`
- **含まれる言語**: Node.js, Python, Go, Java, Ruby, C++, .NET 等
- **プリインストール**: opencode
- **oh-my-opencode 等**: 自分でコンテナ内にインストール

## ファイル構成

```
docker/opencode/
├── Dockerfile      # イメージ定義
├── entrypoint.sh   # 初回起動時の初期化処理
└── README.md       # このファイル
```

## コマンド一覧

| コマンド | 説明 |
|----------|------|
| `opencode` / `oc` | opencode 起動 |
| `opencode-shell` | コンテナにシェルで入る |
| `opencode-build` | イメージをビルド（Dockerfile変更時） |

## 永続化の構造

```
ホストマシン
├── ~/dotfiles/docker/opencode/    ← Dockerfile, entrypoint.sh
├── ~/your-project/                ← $(pwd) → /workspace にマウント
└── /var/lib/docker/volumes/opencode-home/_data/
    └── (Docker が管理)            ← /root にマウント
        ├── .local/                opencode セッション、認証
        ├── .config/               opencode.json, oh-my-opencode設定
        ├── .npm/                  npm キャッシュ
        └── (npm -g で入れたもの等)

コンテナ (my-opencode)
├── /root                   ← opencode-home ボリューム
├── /root-default           ← イメージ内（初期化用バックアップ）
├── /workspace              ← ホストの $(pwd)
└── /usr/local/bin/opencode ← イメージに焼かれた opencode
```

## セットアップ

### 初回

```bash
# 1. イメージビルド
opencode-build

# 2. シェルで入って oh-my-opencode 等をインストール
opencode-shell
$ npm install -g oh-my-opencode
$ npx oh-my-opencode install --no-tui --claude=yes --chatgpt=no --gemini=no
$ exit

# 3. 以降は普通に使う
opencode
```

## 更新方法

### opencode 本体の更新

```bash
opencode-shell
$ opencode upgrade
$ exit
```

または Dockerfile を更新して `opencode-build`。

### oh-my-opencode の更新

```bash
opencode-shell
$ npm update -g oh-my-opencode
$ exit
```

## 発展性

| やりたいこと | 方法 |
|--------------|------|
| npm パッケージ追加 | `opencode-shell` → `npm install -g xxx` |
| Python パッケージ追加 | `opencode-shell` → `pip install xxx` |
| 別のツール追加 | `opencode-shell` → `apt install xxx` |
| MCP サーバーをローカル実行 | 言語環境揃ってるのでそのまま動く |
| 設定のリセット | `docker volume rm opencode-home` |

## npm グローバルパッケージの永続化

デフォルトでは npm グローバルパッケージは `/usr/local/lib/node_modules` にインストールされ、永続化されない。

永続化するには、コンテナ内で以下を実行:

```bash
npm config set prefix /root/.npm-global
echo 'export PATH=/root/.npm-global/bin:$PATH' >> /root/.bashrc
source /root/.bashrc
```

以降、`npm install -g` したものは `/root/.npm-global` に入り、永続化される。
