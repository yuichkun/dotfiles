import { spawn } from "node:child_process";
import type { CommandPaletteRegistry } from "../registry.ts";

async function openInVsCode(directory: string): Promise<void> {
	const child = spawn("code", [directory], {
		cwd: directory,
		detached: true,
		stdio: "ignore",
	});

	await new Promise<void>((resolve, reject) => {
		child.once("spawn", resolve);
		child.once("error", reject);
	});
	child.unref();
}

export function registerWorkspaceActions(
	registry: CommandPaletteRegistry,
): void {
	registry.register({
		id: "workspace.open-vscode",
		title: "Open workspace in VS Code",
		description: "Open the current repository folder",
		keywords: ["code", "editor", "repository", "folder"],
		async run(ctx) {
			const directory = process.cwd();
			await openInVsCode(directory);
			ctx.ui.notify("Opening workspace in VS Code", "info");
		},
	});
}
