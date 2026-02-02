#!/usr/bin/env node

const net = require("net");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

// Parse arguments: host-cmd-server <socket-path>
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: host-cmd-server <socket-path>");
  process.exit(1);
}

const socketPath = args[0];
const workspace = process.cwd();

// Generate project-key from workspace path for whitelist lookup
function toProjectKey(p) {
  return p.replace(/^\//, "").replace(/\//g, "-");
}

const projectKey = toProjectKey(workspace);
const configDir = path.join(process.env.HOME, ".config", "opencode-host");
const whitelistPath = path.join(configDir, `${projectKey}.json`);

// Load whitelist
let whitelist = { commands: [] };
try {
  const data = fs.readFileSync(whitelistPath, "utf8");
  whitelist = JSON.parse(data);
  console.log(`Loaded whitelist from ${whitelistPath}`);
  console.log(`Allowed patterns: ${whitelist.commands.join(", ")}`);
} catch (err) {
  if (err.code === "ENOENT") {
    console.log(
      `No whitelist found at ${whitelistPath}, all commands will be rejected`,
    );
  } else {
    console.error(`Error loading whitelist: ${err.message}`);
  }
}

// Simple glob pattern matching (supports * wildcard)
function globMatch(pattern, str) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
  return regex.test(str);
}

// Check if command matches whitelist
function isAllowed(commandArray) {
  const commandStr = commandArray.join(" ");
  for (const pattern of whitelist.commands) {
    if (globMatch(pattern, commandStr)) {
      return true;
    }
  }
  return false;
}

// Remove existing socket file
if (fs.existsSync(socketPath)) {
  fs.unlinkSync(socketPath);
}

const server = net.createServer((socket) => {
  let data = "";

  socket.on("data", (chunk) => {
    data += chunk.toString();
  });

  socket.on("end", () => {
    try {
      const request = JSON.parse(data);
      const { command } = request;

      if (!Array.isArray(command) || command.length === 0) {
        socket.write(
          JSON.stringify({
            success: false,
            error: "Invalid command format",
          }),
        );
        socket.end();
        return;
      }

      if (!isAllowed(command)) {
        socket.write(
          JSON.stringify({
            success: false,
            error: `Command not whitelisted: ${command.join(" ")}`,
          }),
        );
        socket.end();
        return;
      }

      const [cmd, ...cmdArgs] = command;
      execFile(cmd, cmdArgs, { cwd: workspace }, (err, stdout, stderr) => {
        socket.write(
          JSON.stringify({
            success: !err,
            exitCode: err ? err.code : 0,
            stdout,
            stderr,
            error: err ? err.message : null,
          }),
        );
        socket.end();
      });
    } catch (err) {
      socket.write(
        JSON.stringify({
          success: false,
          error: `Parse error: ${err.message}`,
        }),
      );
      socket.end();
    }
  });
});

server.listen(socketPath, () => {
  console.log(`host-cmd-server listening on ${socketPath}`);
  console.log(`Workspace: ${workspace}`);
});

// Cleanup on exit
process.on("SIGINT", () => {
  server.close();
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.close();
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }
  process.exit(0);
});
