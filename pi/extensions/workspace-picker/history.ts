import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

interface WorkspaceHistoryFile {
	recent: string[];
}

const MAX_RECENT_WORKSPACES = 20;

function getAgentDirectory(): string {
	return (
		process.env.PI_CODING_AGENT_DIR ??
		join(homedir(), ".pi", "agent")
	);
}

export function getWorkspaceHistoryPath(): string {
	return join(
		getAgentDirectory(),
		"state",
		"workspace-picker.json",
	);
}

export async function loadWorkspaceHistory(): Promise<string[]> {
	try {
		const text = await fs.readFile(getWorkspaceHistoryPath(), "utf8");
		const value = JSON.parse(text) as Partial<WorkspaceHistoryFile>;
		return Array.isArray(value.recent)
			? value.recent.filter(
					(path): path is string => typeof path === "string",
				)
			: [];
	} catch {
		return [];
	}
}

export async function recordWorkspaceOpen(path: string): Promise<void> {
	const previous = await loadWorkspaceHistory();
	const history: WorkspaceHistoryFile = {
		recent: [path, ...previous.filter((entry) => entry !== path)].slice(
			0,
			MAX_RECENT_WORKSPACES,
		),
	};
	const historyPath = getWorkspaceHistoryPath();
	await fs.mkdir(dirname(historyPath), { recursive: true });
	await fs.writeFile(
		historyPath,
		`${JSON.stringify(history, null, 2)}\n`,
		"utf8",
	);
}
