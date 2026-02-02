#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// Parse arguments: host-cmd-server <port>
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: host-cmd-server <port>");
  process.exit(1);
}

const port = parseInt(args[0], 10);
const workspace = process.cwd();

// Generate project-key from workspace path for whitelist lookup
function toProjectKey(p) {
  return p.replace(/^\//, "").replace(/\//g, "-");
}

const projectKey = toProjectKey(workspace);
const configDir = path.join(process.env.HOME, ".config", "opencode-host");
const whitelistPath = path.join(configDir, `${projectKey}.json`);

console.log(`Whitelist path: ${whitelistPath}`);

// Load whitelist (called on each request)
function loadWhitelist() {
  try {
    const data = fs.readFileSync(whitelistPath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`Error loading whitelist: ${err.message}`);
    }
    return { commands: [] };
  }
}

// Simple glob pattern matching (supports * wildcard)
function globMatch(pattern, str) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
  return regex.test(str);
}

// Check if command matches whitelist
function isAllowed(commandArray, whitelist) {
  const commandStr = commandArray.join(" ");
  for (const pattern of whitelist.commands) {
    if (globMatch(pattern, commandStr)) {
      return true;
    }
  }
  return false;
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/exec") {
    sendJson(res, 404, { success: false, error: "Not found" });
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    let request;
    try {
      request = JSON.parse(body);
    } catch (err) {
      sendJson(res, 400, { success: false, error: `Invalid JSON: ${err.message}` });
      return;
    }

    const { command } = request;

    if (!Array.isArray(command) || command.length === 0) {
      sendJson(res, 400, { success: false, error: "Invalid command format" });
      return;
    }

    const whitelist = loadWhitelist();

    if (!isAllowed(command, whitelist)) {
      sendJson(res, 403, {
        success: false,
        error: `Command not whitelisted: ${command.join(" ")}. Allowed: ${whitelist.commands.join(", ") || "(none)"}`,
      });
      return;
    }

    const [cmd, ...cmdArgs] = command;

    const child = spawn(cmd, cmdArgs, {
      cwd: workspace,
      env: process.env,
    });

    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (err) => {
      sendJson(res, 500, {
        success: false,
        exitCode: 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        error: err.message,
      });
    });

    child.on("close", (exitCode) => {
      sendJson(res, 200, {
        success: exitCode === 0,
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        error: null,
      });
    });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`host-cmd-server listening on http://127.0.0.1:${port}`);
  console.log(`Workspace: ${workspace}`);
});

process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.close();
  process.exit(0);
});
