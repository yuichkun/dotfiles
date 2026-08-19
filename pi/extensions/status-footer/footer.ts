import { homedir } from "node:os";
import { sep } from "node:path";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	sliceByColumn,
	truncateToWidth,
	visibleWidth,
	type Component,
} from "@earendil-works/pi-tui";

export type WorkingTreeStatus = "clean" | "staged" | "dirty" | "unknown";

export interface StatusFooterState {
	cwd: string;
	branch: string | null;
	workingTree: WorkingTreeStatus;
	model: string;
	thinkingLevel: string;
	contextPercent: number | null;
}

function singleLine(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

export function formatFooterCwd(cwd: string, home = homedir()): string {
	if (cwd === home) return "~";
	const prefix = home.endsWith(sep) ? home : `${home}${sep}`;
	return cwd.startsWith(prefix) ? `~${sep}${cwd.slice(prefix.length)}` : cwd;
}

function truncateTail(value: string, width: number): string {
	if (width <= 0) return "";
	if (visibleWidth(value) <= width) return value;
	if (width === 1) return "…";
	const tailWidth = width - 1;
	return `…${sliceByColumn(value, visibleWidth(value) - tailWidth, tailWidth, true)}`;
}

function fitProject(
	cwd: string,
	branch: string | null,
	width: number,
): { cwd: string; branchLabel: string | null } {
	if (!branch) return { cwd: truncateTail(cwd, width), branchLabel: null };
	const branchLabel = `[${branch}]`;
	if (visibleWidth(cwd) + 1 + visibleWidth(branchLabel) <= width) {
		return { cwd, branchLabel };
	}
	if (width <= 2) return { cwd: truncateTail(cwd, width), branchLabel: null };

	const branchBudget = Math.min(
		visibleWidth(branchLabel),
		Math.max(1, width - 2),
	);
	const fittedBranchLabel = truncateToWidth(branchLabel, branchBudget, "…");
	const cwdBudget = Math.max(1, width - visibleWidth(fittedBranchLabel) - 1);
	return {
		cwd: truncateTail(cwd, cwdBudget),
		branchLabel: fittedBranchLabel,
	};
}

function contextLabel(percent: number | null): string {
	return percent === null ? "ctx ?" : `ctx ${Math.round(percent)}%`;
}

function fitRuntimeParts(parts: [string, string, string], width: number): [string, string, string] {
	const separatorWidth = 6;
	const fullWidth = parts.reduce((sum, part) => sum + visibleWidth(part), separatorWidth);
	if (fullWidth <= width) return parts;

	let remaining = Math.max(3, width - separatorWidth);
	const contextWidth = Math.min(visibleWidth(parts[2]), Math.max(1, Math.floor(remaining / 2)));
	remaining -= contextWidth;
	const thinkingWidth = Math.min(visibleWidth(parts[1]), Math.max(1, Math.floor(remaining / 2)));
	remaining -= thinkingWidth;
	const modelWidth = Math.max(1, remaining);
	return [
		truncateToWidth(parts[0], modelWidth, "…"),
		truncateToWidth(parts[1], thinkingWidth, "…"),
		truncateToWidth(parts[2], contextWidth, "…"),
	];
}

function branchColor(status: WorkingTreeStatus): Parameters<Theme["fg"]>[0] {
	switch (status) {
		case "clean":
			return "success";
		case "staged":
			return "warning";
		case "dirty":
			return "error";
		case "unknown":
			return "muted";
	}
}

function renderProject(state: StatusFooterState, width: number, theme: Theme): string {
	const cwd = singleLine(formatFooterCwd(state.cwd)) || "?";
	const branch = state.branch ? singleLine(state.branch) : null;
	const fitted = fitProject(cwd, branch, width);
	const cwdText = theme.fg("muted", fitted.cwd);
	if (!fitted.branchLabel) return truncateToWidth(cwdText, width, "");
	const branchText = theme.fg(branchColor(state.workingTree), fitted.branchLabel);
	return truncateToWidth(`${cwdText} ${branchText}`, width, "");
}

function renderRuntime(state: StatusFooterState, width: number, theme: Theme): string {
	const rawParts: [string, string, string] = [
		singleLine(state.model) || "no-model",
		singleLine(state.thinkingLevel) || "off",
		contextLabel(state.contextPercent),
	];
	const parts = fitRuntimeParts(rawParts, width);
	const separator = theme.fg("dim", " · ");
	return truncateToWidth(
		[
			theme.fg("muted", parts[0]),
			theme.fg("muted", parts[1]),
			theme.fg("muted", parts[2]),
		].join(separator),
		width,
		"",
	);
}

export function parseGitPorcelain(output: string): WorkingTreeStatus {
	let staged = false;
	let dirty = false;
	for (const line of output.replace(/\r\n?/g, "\n").split("\n")) {
		if (!line) continue;
		const index = line[0] ?? " ";
		const worktree = line[1] ?? " ";
		if (index !== " ") staged = true;
		if (worktree !== " ") dirty = true;
	}
	if (dirty) return "dirty";
	if (staged) return "staged";
	return "clean";
}

export class StatusFooterComponent implements Component {
	private readonly state: () => StatusFooterState;
	private readonly theme: Theme;
	private readonly onDispose: () => void;
	private disposed = false;

	constructor(
		state: () => StatusFooterState,
		theme: Theme,
		onDispose: () => void = () => {},
	) {
		this.state = state;
		this.theme = theme;
		this.onDispose = onDispose;
	}

	render(width: number): string[] {
		if (width <= 0) return [];
		const state = this.state();
		const project = renderProject(state, width, this.theme);
		const runtime = renderRuntime(state, width, this.theme);
		const combinedWidth = visibleWidth(project) + 2 + visibleWidth(runtime);
		if (combinedWidth <= width) {
			return [
				project + " ".repeat(width - visibleWidth(project) - visibleWidth(runtime)) + runtime,
			];
		}
		return [project, runtime];
	}

	invalidate(): void {}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.onDispose();
	}
}
