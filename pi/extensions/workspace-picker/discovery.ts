import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import {
	basename,
	isAbsolute,
	join,
	resolve,
} from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface WorkspaceEntryConfig {
	name?: string;
	path: string;
}

export interface WorkspaceConfig {
	roots: string[];
	entries: WorkspaceEntryConfig[];
	maxDepth: number;
}

export interface Workspace {
	name: string;
	path: string;
	source: "discovered" | "configured";
}

const DEFAULT_CONFIG: WorkspaceConfig = {
	roots: ["~/workspace"],
	entries: [{ name: "dotfiles", path: "~/dotfiles" }],
	maxDepth: 3,
};

const SKIPPED_DIRECTORIES = new Set([
	".git",
	"node_modules",
	"vendor",
	"dist",
	"build",
	"target",
	".cache",
]);

export function getWorkspaceConfigPath(): string {
	return join(getAgentDir(), "workspaces.json");
}

export function expandWorkspacePath(value: string): string {
	const trimmed = value.trim();
	if (trimmed === "~") return homedir();
	if (trimmed.startsWith("~/")) {
		return resolve(homedir(), trimmed.slice(2));
	}
	if (isAbsolute(trimmed)) return resolve(trimmed);
	return resolve(homedir(), trimmed);
}

function parseWorkspaceConfig(value: unknown): WorkspaceConfig {
	if (!value || typeof value !== "object") {
		throw new Error("workspaces.json must contain an object");
	}

	const config = value as Record<string, unknown>;
	const roots = Array.isArray(config.roots)
		? config.roots.filter(
				(root): root is string => typeof root === "string",
			)
		: [];
	const entries = Array.isArray(config.entries)
		? config.entries.flatMap((entry): WorkspaceEntryConfig[] => {
				if (!entry || typeof entry !== "object") return [];
				const candidate = entry as Record<string, unknown>;
				if (typeof candidate.path !== "string") return [];
				return [
					{
						path: candidate.path,
						...(typeof candidate.name === "string" &&
							candidate.name.trim() && {
								name: candidate.name.trim(),
							}),
					},
				];
			})
		: [];
	const rawMaxDepth =
		typeof config.maxDepth === "number"
			? Math.floor(config.maxDepth)
			: DEFAULT_CONFIG.maxDepth;

	return {
		roots,
		entries,
		maxDepth: Math.max(1, Math.min(rawMaxDepth, 8)),
	};
}

export async function loadWorkspaceConfig(): Promise<WorkspaceConfig> {
	try {
		const text = await fs.readFile(getWorkspaceConfigPath(), "utf8");
		return parseWorkspaceConfig(JSON.parse(text));
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return DEFAULT_CONFIG;
		}
		throw error;
	}
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await fs.stat(path)).isDirectory();
	} catch {
		return false;
	}
}

async function scanRoot(
	root: string,
	maxDepth: number,
	workspaces: Map<string, Workspace>,
): Promise<void> {
	async function visit(directory: string, depth: number): Promise<void> {
		let entries;
		try {
			entries = await fs.readdir(directory, { withFileTypes: true });
		} catch {
			return;
		}

		if (entries.some((entry) => entry.name === ".git")) {
			workspaces.set(directory, {
				name: basename(directory),
				path: directory,
				source: "discovered",
			});
			return;
		}
		if (depth >= maxDepth) return;

		await Promise.all(
			entries
				.filter(
					(entry) =>
						entry.isDirectory() &&
						!SKIPPED_DIRECTORIES.has(entry.name) &&
						!entry.name.startsWith("."),
				)
				.map((entry) =>
					visit(join(directory, entry.name), depth + 1),
				),
		);
	}

	if (await isDirectory(root)) await visit(root, 0);
}

export async function discoverWorkspaces(): Promise<Workspace[]> {
	const config = await loadWorkspaceConfig();
	const workspaces = new Map<string, Workspace>();

	await Promise.all(
		config.roots.map((root) =>
			scanRoot(
				expandWorkspacePath(root),
				config.maxDepth,
				workspaces,
			),
		),
	);

	for (const entry of config.entries) {
		const path = expandWorkspacePath(entry.path);
		if (!(await isDirectory(path))) continue;
		workspaces.set(path, {
			name: entry.name || basename(path),
			path,
			source: "configured",
		});
	}

	return [...workspaces.values()].sort((left, right) =>
		left.name.localeCompare(right.name, undefined, {
			sensitivity: "base",
		}),
	);
}
