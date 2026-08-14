import {
	getLanguageFromPath,
	highlightCode,
	keyHint,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	truncateToWidth,
	visibleWidth,
	type Component,
} from "@earendil-works/pi-tui";

export type DiffPreviewRowKind = "context" | "added" | "removed" | "ellipsis";

export interface DiffPreviewRow {
	kind: DiffPreviewRowKind;
	/** Padded line-number field from Pi's display-oriented diff. */
	lineNumber: string;
	/** Source text without the diff gutter and line number. */
	code: string;
	/** Human-readable explanation for a synthetic omission row. */
	omission?: string;
}

export interface DiffPreviewOptions {
	/** Hard height bound for the collapsed preview, including omission rows. */
	maxRows?: number;
}

export const DEFAULT_DIFF_PREVIEW_MAX_ROWS = 28;

const DISPLAY_DIFF_LINE = /^([+\- ])(\s*\d*)\s(.*)$/;
const DISPLAY_DIFF_ELLIPSIS = /^\s*\.\.\.\s*$/;

function ellipsis(omission?: string): DiffPreviewRow {
	return {
		kind: "ellipsis",
		lineNumber: "",
		code: "...",
		...(omission ? { omission } : {}),
	};
}

/**
 * Parse the public built-in edit result's display-oriented `details.diff` shape.
 *
 * Pi 0.84.1 emits `+<line> code`, `-<line> code`, ` <line> code`, and
 * whitespace-prefixed `...` rows. Unknown rows remain neutral context so older
 * resumed sessions degrade to readable text instead of disappearing.
 */
export function parseDisplayDiff(diffText: string): DiffPreviewRow[] {
	if (!diffText) return [];
	return diffText.replace(/\r\n?/g, "\n").split("\n").map((line) => {
		if (DISPLAY_DIFF_ELLIPSIS.test(line)) return ellipsis();
		const match = DISPLAY_DIFF_LINE.exec(line);
		if (!match) {
			return { kind: "context", lineNumber: "", code: line };
		}
		const prefix = match[1]!;
		return {
			kind: prefix === "+" ? "added" : prefix === "-" ? "removed" : "context",
			lineNumber: match[2]!,
			code: match[3]!,
		};
	});
}

function isChanged(row: DiffPreviewRow): boolean {
	return row.kind === "added" || row.kind === "removed";
}

function compactHunk(rows: readonly DiffPreviewRow[], maxRows: number): DiffPreviewRow[] {
	if (rows.length <= maxRows) return [...rows];
	if (maxRows <= 0) return [];

	const firstChange = rows.findIndex(isChanged);
	let lastChange = -1;
	for (let index = rows.length - 1; index >= 0; index--) {
		if (isChanged(rows[index]!)) {
			lastChange = index;
			break;
		}
	}
	if (firstChange < 0 || lastChange < 0) return rows.slice(0, maxRows);

	const leading = rows.slice(0, firstChange);
	const changedRegion = rows.slice(firstChange, lastChange + 1);
	const trailing = rows.slice(lastChange + 1);
	const fixedRows = leading.length + trailing.length;
	const changedBudget = Math.max(2, maxRows - fixedRows - 1);
	if (changedRegion.length <= changedBudget) {
		return [...leading, ...changedRegion, ...trailing].slice(0, maxRows);
	}

	const headCount = Math.ceil(changedBudget / 2);
	const tailCount = Math.floor(changedBudget / 2);
	const omitted = changedRegion.length - headCount - tailCount;
	return [
		...leading,
		...changedRegion.slice(0, headCount),
		ellipsis(`${omitted} changed ${omitted === 1 ? "line" : "lines"} omitted`),
		...changedRegion.slice(changedRegion.length - tailCount),
		...trailing,
	].slice(0, maxRows);
}

interface DiffHunks {
	leadingEllipsis: boolean;
	trailingEllipsis: boolean;
	hunks: DiffPreviewRow[][];
}

function splitHunks(rows: readonly DiffPreviewRow[]): DiffHunks {
	const hunks: DiffPreviewRow[][] = [];
	let current: DiffPreviewRow[] = [];
	const flush = (): void => {
		if (current.some(isChanged)) hunks.push(current);
		current = [];
	};

	for (const row of rows) {
		if (row.kind === "ellipsis") {
			flush();
			continue;
		}
		current.push(row);
	}
	flush();
	return {
		leadingEllipsis: rows[0]?.kind === "ellipsis",
		trailingEllipsis: rows.at(-1)?.kind === "ellipsis",
		hunks,
	};
}

/**
 * Keep complete built-in context windows whenever possible. If a pathological
 * diff exceeds the collapsed height budget, changed content is compacted first;
 * later hunks are omitted as whole units so a visible hunk never loses only its
 * trailing context. Ctrl+O still exposes Pi's authoritative full renderer.
 */
export function selectDiffPreviewRows(
	rows: readonly DiffPreviewRow[],
	options: DiffPreviewOptions = {},
): DiffPreviewRow[] {
	const maxRows = Math.max(1, Math.floor(options.maxRows ?? DEFAULT_DIFF_PREVIEW_MAX_ROWS));
	if (rows.length <= maxRows) return [...rows];

	const { leadingEllipsis, trailingEllipsis, hunks } = splitHunks(rows);
	if (hunks.length === 0) return rows.slice(0, maxRows);

	const output: DiffPreviewRow[] = [];
	if (leadingEllipsis) output.push(ellipsis());

	for (let index = 0; index < hunks.length; index++) {
		const hunk = hunks[index]!;
		const separatorRows = output.length > 0 && output.at(-1)?.kind !== "ellipsis" ? 1 : 0;
		const remainingHunks = hunks.length - index - 1;
		const reserveForTail = (remainingHunks > 0 || trailingEllipsis) ? 1 : 0;
		const available = maxRows - output.length - separatorRows - reserveForTail;

		if (available <= 0 || (index > 0 && hunk.length > available)) {
			const omittedHunks = hunks.length - index;
			if (output.length < maxRows) {
				output.push(ellipsis(`${omittedHunks} more ${omittedHunks === 1 ? "hunk" : "hunks"} omitted`));
			}
			return output.slice(0, maxRows);
		}

		if (separatorRows > 0) output.push(ellipsis());
		output.push(...compactHunk(hunk, available));
	}

	if (trailingEllipsis && output.length < maxRows && output.at(-1)?.kind !== "ellipsis") {
		output.push(ellipsis());
	}
	return output.slice(0, maxRows);
}

export type DiffCodeHighlighter = (code: string, language?: string) => string[];

export interface HighlightedDiffPreviewRow extends DiffPreviewRow {
	highlightedCode: string;
}

function normalizedCode(row: DiffPreviewRow): string {
	return row.code.replace(/\t/g, "   ");
}

function highlightChunk(
	rows: readonly DiffPreviewRow[],
	language: string,
	theme: Theme,
	highlighter: DiffCodeHighlighter,
): HighlightedDiffPreviewRow[] {
	const oldSource: string[] = [];
	const newSource: string[] = [];
	const oldIndexes = new Map<number, number>();
	const newIndexes = new Map<number, number>();

	for (const [index, row] of rows.entries()) {
		const code = normalizedCode(row);
		if (row.kind !== "added") {
			oldIndexes.set(index, oldSource.length);
			oldSource.push(code);
		}
		if (row.kind !== "removed") {
			newIndexes.set(index, newSource.length);
			newSource.push(code);
		}
	}

	let highlightedOld: string[] = [];
	let highlightedNew: string[] = [];
	try {
		highlightedOld = highlighter(oldSource.join("\n"), language);
		highlightedNew = highlighter(newSource.join("\n"), language);
	} catch {
		// A highlighter failure must not make an authoritative edit result vanish.
	}

	return rows.map((row, index) => {
		const oldIndex = oldIndexes.get(index);
		const newIndex = newIndexes.get(index);
		const highlightedCode =
			(row.kind === "removed" && oldIndex !== undefined
				? highlightedOld[oldIndex]
				: newIndex !== undefined
					? highlightedNew[newIndex]
					: oldIndex !== undefined
						? highlightedOld[oldIndex]
						: undefined) ?? theme.fg("text", normalizedCode(row));
		return { ...row, highlightedCode };
	});
}

/** Highlight old and new hunk streams separately so multiline tokens survive each visible window. */
export function highlightDiffPreviewRows(
	rows: readonly DiffPreviewRow[],
	filePath: string | undefined,
	theme: Theme,
	highlighter: DiffCodeHighlighter = highlightCode,
): HighlightedDiffPreviewRow[] {
	const language = filePath ? getLanguageFromPath(filePath) : undefined;
	if (!language) {
		return rows.map((row) => ({
			...row,
			highlightedCode: theme.fg("text", normalizedCode(row)),
		}));
	}

	const output: HighlightedDiffPreviewRow[] = [];
	let chunk: DiffPreviewRow[] = [];
	const flush = (): void => {
		if (chunk.length > 0) output.push(...highlightChunk(chunk, language, theme, highlighter));
		chunk = [];
	};
	for (const row of rows) {
		if (row.kind === "ellipsis") {
			flush();
			output.push({ ...row, highlightedCode: "" });
		} else {
			chunk.push(row);
		}
	}
	flush();
	return output;
}

export class SyntaxDiffPreviewComponent implements Component {
	private readonly rows: DiffPreviewRow[];
	private readonly filePath: string | undefined;
	private readonly theme: Theme;
	private readonly highlighter: DiffCodeHighlighter;
	private highlightedRows: HighlightedDiffPreviewRow[];
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		diffText: string,
		filePath: string | undefined,
		theme: Theme,
		options: DiffPreviewOptions = {},
		highlighter: DiffCodeHighlighter = highlightCode,
	) {
		this.rows = selectDiffPreviewRows(parseDisplayDiff(diffText), options);
		this.filePath = filePath;
		this.theme = theme;
		this.highlighter = highlighter;
		this.highlightedRows = highlightDiffPreviewRows(
			this.rows,
			this.filePath,
			this.theme,
			this.highlighter,
		);
	}

	render(width: number): string[] {
		if (width <= 0) return [];
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;
		const lineNumberWidth = this.rows.reduce(
			(maximum, row) => Math.max(maximum, visibleWidth(row.lineNumber)),
			0,
		);
		const gutterWidth = lineNumberWidth + 2;
		const lines = this.highlightedRows.map((row) => {
			if (row.kind === "ellipsis") {
				const detail = row.omission
					? `… ${row.omission} (${keyHint("app.tools.expand", "to expand")})`
					: "…";
				return truncateToWidth(
					this.theme.fg("dim", `${" ".repeat(gutterWidth)}${detail}`),
					width,
					"…",
				);
			}
			const sign = row.kind === "added" ? "+" : row.kind === "removed" ? "-" : " ";
			const gutter = `${sign}${row.lineNumber.padStart(lineNumberWidth, " ")} `;
			const styledGutter = row.kind === "added"
				? this.theme.fg("toolDiffAdded", gutter)
				: row.kind === "removed"
					? this.theme.fg("toolDiffRemoved", gutter)
					: this.theme.fg("dim", gutter);
			return truncateToWidth(`${styledGutter}${row.highlightedCode}`, width, "…");
		});
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
		this.highlightedRows = highlightDiffPreviewRows(
			this.rows,
			this.filePath,
			this.theme,
			this.highlighter,
		);
	}
}
