---
name: host-cmd
description: Execute whitelisted commands on the host machine from inside a container
---

# Host Command Execution

Execute commands on the host machine via `host-cmd`.

## Usage

```bash
host-cmd <command> [args...]
```

## Rules

- Only whitelisted commands are allowed.
- If a command is rejected, ask the user to update the whitelist.
- Do not attempt to bypass or work around the whitelist.
- The whitelist protects the host environment.

## Examples

```bash
host-cmd npm run build
host-cmd git status
host-cmd docker-compose ps
```
