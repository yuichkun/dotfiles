import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	getCapabilities,
	hyperlink,
	sliceByColumn,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import { paint } from "../shared/color-policy.ts";
import {
	getBranchParts,
	getToolSignature,
	type SignatureArgument,
	type ToolDisplayStatus,
} from "./tool-format.ts";

export interface ToolHeaderOptions {
	toolName: string;
	args: Record<string, unknown>;
	status: ToolDisplayStatus;
	marker: string;
	markerColor: Parameters<Theme["fg"]>[0];
	semanticSummary: string;
	facts: readonly string[];
	errorTail?: string;
	summaryError?: string;
	runningDuration?: string;
	cwd?: string;
	theme: Theme;
}

function truncateTail(value: string, maxWidth: number): string {
	if (maxWidth <= 0) return "";
	if (visibleWidth(value) <= maxWidth) return value;
	if (maxWidth === 1) return "…";
	const tailWidth = maxWidth - 1;
	return `…${sliceByColumn(value, Math.max(0, visibleWidth(value) - tailWidth), tailWidth, true)}`;
}

function fitArgument(argument: SignatureArgument, maxWidth: number): SignatureArgument {
	return {
		...argument,
		text:
			argument.kind === "path"
				? truncateTail(argument.text, maxWidth)
				: truncateToWidth(argument.text, maxWidth, "…"),
	};
}

function fitArguments(
	arguments_: readonly SignatureArgument[],
	maxWidth: number,
): SignatureArgument[] {
	if (arguments_.length === 0 || maxWidth <= 0) return [];
	const separatorWidth = Math.max(0, arguments_.length - 1) * 2;
	const contentWidth = Math.max(arguments_.length, maxWidth - separatorWidth);
	if (
		arguments_.reduce((total, argument) => total + visibleWidth(argument.text), separatorWidth) <=
		maxWidth
	) {
		return [...arguments_];
	}

	if (arguments_.length === 1) return [fitArgument(arguments_[0]!, contentWidth)];

	const baseWidth = Math.max(1, Math.floor(contentWidth / arguments_.length));
	let remaining = contentWidth;
	return arguments_.map((argument, index) => {
		const remainingItems = arguments_.length - index;
		const preferred = argument.kind === "path" ? baseWidth + Math.floor(baseWidth / 2) : baseWidth;
		const allotted = Math.max(1, Math.min(preferred, remaining - (remainingItems - 1)));
		remaining -= allotted;
		return fitArgument(argument, allotted);
	});
}

function pathHref(value: string, cwd: string | undefined): string | undefined {
	if (!cwd || !value || value === "?") return undefined;
	const withoutLocation = value.replace(/:\d+(?:-\d+)?$/, "");
	const expanded = withoutLocation === "~"
		? homedir()
		: withoutLocation.startsWith("~/")
			? resolve(homedir(), withoutLocation.slice(2))
			: withoutLocation;
	const absolute = isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
	return pathToFileURL(absolute).href;
}

function styleArgument(
	argument: SignatureArgument,
	original: SignatureArgument,
	theme: Theme,
	cwd: string | undefined,
): string {
	const primary = paint(theme, "primary", argument.text);
	const href = original.kind === "path" ? pathHref(original.text, cwd) : undefined;
	return href && getCapabilities().hyperlinks ? hyperlink(primary, href) : primary;
}

function countedPhrase(part: string, theme: Theme): string | undefined {
	const diff = part.match(/^Added (\d+) (lines?), removed (\d+) (lines?)$/);
	if (diff) {
		return `Added ${theme.bold(diff[1]!)} ${diff[2]}, removed ${theme.bold(diff[3]!)} ${diff[4]}`;
	}
	const shell = part.match(/^Ran (\d+) shell (commands?)$/);
	if (shell) {
		return theme.fg("muted", `Ran ${theme.bold(shell[1]!)} shell ${shell[2]}`);
	}
	return undefined;
}

function styleBranchPart(part: string, semanticSummary: string, theme: Theme): string {
	if (part === semanticSummary) return paint(theme, "primary", part);
	const counted = countedPhrase(part, theme);
	if (counted) return counted;
	if (part.startsWith("Error:") || /\b(?:failed|fatal)\b/i.test(part)) {
		return theme.fg("error", part);
	}
	const tests = part.match(/^(\d+ passed)\s*\/\s*(\d+ failed)$/i);
	if (tests) {
		return `${paint(theme, "completed", tests[1]!)}${paint(theme, "tertiary", " / ")}${paint(theme, "failure", tests[2]!)}`;
	}
	if (/\b(?:passed|passing|success)\b/i.test(part)) {
		return paint(theme, "completed", part);
	}
	if (/\b(?:truncated|warning)\b/i.test(part)) {
		return paint(theme, "caution", part);
	}
	if (/^\d+(?:\.\d+)?s$/.test(part) || /^batch call \d+\/\d+$/.test(part)) {
		return paint(theme, "tertiary", part);
	}
	return paint(theme, "secondary", part);
}

function indentation(width: number): { branch: string; continuation: string } {
	if (width >= 12) return { branch: "  ⎿ \u00a0", continuation: "     " };
	if (width >= 6) return { branch: "⎿ \u00a0", continuation: "   " };
	return { branch: "", continuation: "" };
}

export class ToolHeaderComponent implements Component {
	private options: ToolHeaderOptions;

	constructor(options: ToolHeaderOptions) {
		this.options = options;
	}

	setOptions(options: ToolHeaderOptions): void {
		this.options = options;
	}

	render(width: number): string[] {
		if (width <= 0) return [];
		const { theme } = this.options;
		const signature = getToolSignature(this.options.toolName, this.options.args);
		const runningSuffix = this.options.runningDuration
			? theme.fg("dim", ` · ${this.options.runningDuration}`)
			: "";
		const fixedPlain = `${this.options.marker} ${signature.name}()`;
		const availableArguments = Math.max(
			1,
			width - visibleWidth(fixedPlain) - visibleWidth(runningSuffix),
		);
		const fittedArguments = fitArguments(signature.arguments, availableArguments);
		const argumentText = fittedArguments
			.map((argument, index) =>
				styleArgument(argument, signature.arguments[index]!, theme, this.options.cwd),
			)
			.join(", ");
		const anchor =
			theme.fg(this.options.markerColor, this.options.marker) +
			" " +
			theme.bold(theme.fg("toolTitle", signature.name)) +
			"(" +
			argumentText +
			")" +
			runningSuffix;
		const lines = [truncateToWidth(anchor, width, "…")];

		const parts = getBranchParts({
			toolName: this.options.toolName,
			args: this.options.args,
			facts: this.options.facts,
			semanticSummary: this.options.semanticSummary,
			status: this.options.status,
			errorTail: this.options.errorTail,
		});
		if (this.options.summaryError) {
			parts.push(`summary fallback: ${this.options.summaryError.replace(/\s+/g, " ").trim().slice(0, 180)}`);
		}
		if (parts.length === 0) return lines;

		const indents = indentation(width);
		const contentWidth = Math.max(1, width - visibleWidth(indents.branch));
		const branchText = parts
			.map((part) => styleBranchPart(part, this.options.semanticSummary, theme))
			.join(theme.fg("dim", " · "));
		const wrapped = wrapTextWithAnsi(branchText, contentWidth);
		for (const [index, line] of wrapped.entries()) {
			const prefix = index === 0 ? indents.branch : indents.continuation;
			lines.push(truncateToWidth(theme.fg("muted", prefix) + line, width, ""));
		}
		return lines;
	}

	invalidate(): void {}
}
