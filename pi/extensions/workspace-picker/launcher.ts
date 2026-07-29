import { spawn } from "node:child_process";

export async function openInVsCode(directory: string): Promise<void> {
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
