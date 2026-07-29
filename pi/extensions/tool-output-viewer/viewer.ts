import {
	highlightCode,
	type ExtensionContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	fuzzyFilter,
	Input,
	Key,
	matchesKey,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import {
	BaseModal,
	showModal,
	type ModalContext,
} from "../shared/modal.ts";
import { ModalFrame } from "../shared/modal-frame.ts";
import {
	collectToolOutputs,
	formatToolArguments,
	getFullOutputPath,
	getToolOutputText,
	type ToolOutputRecord,
} from "./history.ts";

const MIN_VISIBLE_ROWS = 7;
const DEFAULT_TERMINAL_ROWS = 30;
const MODAL_SCREEN_RATIO = 0.9;

type ViewerMode = "browse" | "search" | "detail";
type ListMode = Exclude<ViewerMode, "detail">;
type ToolColor = Parameters<Theme["fg"]>[0];
type SearchMatchSource = "primary" | "context";

interface TurnGroup {
	turnNumber: number;
	totalTurns: number;
	userPrompt: string;
	records: ToolOutputRecord[];
}

interface TurnTreeNode {
	type: "turn";
	key: string;
	group: TurnGroup;
}

interface ToolTreeNode {
	type: "tool";
	key: string;
	group: TurnGroup;
	record: ToolOutputRecord;
	isLast: boolean;
}

type TreeNode = TurnTreeNode | ToolTreeNode;

interface SearchResult {
	record: ToolOutputRecord;
	source: SearchMatchSource;
}

interface DetailCache {
	recordId: string;
	width: number;
	lines: string[];
}

const TOOL_COLORS: Record<string, ToolColor> = {
	bash: "syntaxFunction",
	read: "syntaxType",
	write: "success",
	edit: "warning",
	grep: "syntaxKeyword",
	find: "syntaxVariable",
	ls: "accent",
};

const FALLBACK_TOOL_COLORS: readonly ToolColor[] = [
	"accent",
	"syntaxFunction",
	"syntaxType",
	"syntaxKeyword",
	"syntaxVariable",
	"syntaxString",
	"syntaxNumber",
];

function getToolColor(toolName: string): ToolColor {
	const known = TOOL_COLORS[toolName];
	if (known) return known;
	let hash = 0;
	for (const char of toolName) {
		hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
	}
	return FALLBACK_TOOL_COLORS[hash % FALLBACK_TOOL_COLORS.length]!;
}

function formatRelativeTurn(turnNumber: number, totalTurns: number): string {
	const turnsAgo = Math.max(0, totalTurns - turnNumber);
	return turnsAgo === 0
		? "current turn"
		: `${turnsAgo} turn${turnsAgo === 1 ? "" : "s"} ago`;
}

function formatTurnPosition(record: ToolOutputRecord): string {
	if (record.turnNumber <= 0) return "Conversation position unavailable";
	const toolPosition =
		record.toolIndexInTurn > 0 && record.toolCountInTurn > 0
			? ` · Tool ${record.toolIndexInTurn}/${record.toolCountInTurn}`
			: "";
	return `Turn ${record.turnNumber}${toolPosition} · ${formatRelativeTurn(record.turnNumber, record.totalTurns)}`;
}

function formatTime(timestamp: number): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function appendWrapped(
	target: string[],
	lines: readonly string[],
	width: number,
): void {
	for (const line of lines) {
		if (!line) {
			target.push("");
			continue;
		}
		target.push(...wrapTextWithAnsi(line, width));
	}
}

function turnKey(turnNumber: number): string {
	return `turn:${turnNumber}`;
}

function toolKey(recordId: string): string {
	return `tool:${recordId}`;
}

function buildTurnGroups(
	records: readonly ToolOutputRecord[],
): TurnGroup[] {
	const groups = new Map<number, TurnGroup>();
	for (const record of records) {
		let group = groups.get(record.turnNumber);
		if (!group) {
			group = {
				turnNumber: record.turnNumber,
				totalTurns: record.totalTurns,
				userPrompt: record.userPrompt,
				records: [],
			};
			groups.set(record.turnNumber, group);
		}
		group.records.push(record);
	}
	return [...groups.values()];
}

function getPrimarySearchText(record: ToolOutputRecord): string {
	return `${record.toolName} ${record.summary}`;
}

function containsQueryTokens(text: string, query: string): boolean {
	const normalizedText = text.toLowerCase();
	const tokens = query
		.toLowerCase()
		.split(/[\s/]+/)
		.filter(Boolean);
	return (
		tokens.length > 0 &&
		tokens.every((token) => normalizedText.includes(token))
	);
}

function toSearchResults(
	records: readonly ToolOutputRecord[],
	source: SearchMatchSource,
): SearchResult[] {
	return records.map((record) => ({ record, source }));
}

function searchRecords(
	records: readonly ToolOutputRecord[],
	query: string,
): SearchResult[] {
	const primaryExactCandidates = records.filter((record) =>
		containsQueryTokens(getPrimarySearchText(record), query),
	);
	const primaryExact = fuzzyFilter(
		primaryExactCandidates,
		query,
		getPrimarySearchText,
	);
	const primaryExactIds = new Set(
		primaryExact.map((record) => record.id),
	);
	const contextExactCandidates = records.filter(
		(record) =>
			!primaryExactIds.has(record.id) &&
			containsQueryTokens(record.userPrompt, query),
	);
	const contextExact = fuzzyFilter(
		contextExactCandidates,
		query,
		(record) => record.userPrompt,
	);

	// Substring/token matches are more predictable. Only fall back to broad
	// subsequence matching when there are no exact-token results at all.
	if (primaryExact.length > 0 || contextExact.length > 0) {
		return [
			...toSearchResults(primaryExact, "primary"),
			...toSearchResults(contextExact, "context"),
		];
	}

	const primaryFuzzy = fuzzyFilter(
		[...records],
		query,
		getPrimarySearchText,
	);
	const primaryFuzzyIds = new Set(
		primaryFuzzy.map((record) => record.id),
	);
	const contextFuzzy = fuzzyFilter(
		records.filter(
			(record) =>
				!primaryFuzzyIds.has(record.id) && Boolean(record.userPrompt),
		),
		query,
		(record) => record.userPrompt,
	);
	return [
		...toSearchResults(primaryFuzzy, "primary"),
		...toSearchResults(contextFuzzy, "context"),
	];
}

class ToolOutputViewerComponent extends BaseModal<void> {
	private readonly input = new Input();
	private readonly records: readonly ToolOutputRecord[];
	private readonly groups: readonly TurnGroup[];
	private readonly recordsById: Map<string, ToolOutputRecord>;
	private readonly collapsedTurns = new Set<number>();
	private selectedBrowseKey?: string;
	private searchResults: SearchResult[] = [];
	private selectedSearchIndex = 0;
	private detailRecordId?: string;
	private detailReturnMode: ListMode = "browse";
	private mode: ViewerMode = "browse";
	private detailScroll = 0;
	private detailLineCount = 0;
	private detailCache?: DetailCache;

	constructor(
		records: readonly ToolOutputRecord[],
		context: ModalContext<void>,
	) {
		super(context);
		this.records = records;
		this.groups = buildTurnGroups(records);
		this.recordsById = new Map(
			records.map((record) => [record.id, record]),
		);

		for (const group of this.groups.slice(0, -1)) {
			this.collapsedTurns.add(group.turnNumber);
		}
		const latestRecord = records.at(-1);
		this.selectedBrowseKey = latestRecord
			? toolKey(latestRecord.id)
			: this.groups.at(-1)
				? turnKey(this.groups.at(-1)!.turnNumber)
				: undefined;
	}

	protected override onFocusChange(focused: boolean): void {
		this.input.focused = focused && this.mode === "search";
	}

	override handleInput(data: string): void {
		switch (this.mode) {
			case "browse":
				this.handleBrowseInput(data);
				break;
			case "search":
				this.handleSearchInput(data);
				break;
			case "detail":
				this.handleDetailInput(data);
				break;
		}
	}

	override invalidate(): void {
		this.input.invalidate();
		this.detailCache = undefined;
	}

	override render(width: number): string[] {
		if (width < 4) {
			return [truncateToWidth("Tool Outputs", width, "")];
		}
		switch (this.mode) {
			case "browse":
				return this.renderBrowse(width);
			case "search":
				return this.renderSearch(width);
			case "detail":
				return this.renderDetail(width);
		}
	}

	private handleBrowseInput(data: string): void {
		if (this.isCancelInput(data)) {
			this.cancel();
			return;
		}
		if (matchesKey(data, "/")) {
			this.enterSearchMode();
			return;
		}
		if (
			matchesKey(data, Key.left) ||
			this.keybindings.matches(data, "app.tree.foldOrUp")
		) {
			this.foldOrSelectParent();
			return;
		}
		if (
			matchesKey(data, Key.right) ||
			this.keybindings.matches(data, "app.tree.unfoldOrDown")
		) {
			this.unfoldOrSelectChild();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up")) {
			this.moveBrowseSelection(-1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			this.moveBrowseSelection(1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageUp")) {
			this.moveBrowseSelection(-this.getBrowseVisibleRows());
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageDown")) {
			this.moveBrowseSelection(this.getBrowseVisibleRows());
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			this.activateBrowseNode();
		}
	}

	private handleSearchInput(data: string): void {
		if (this.isCancelInput(data)) {
			this.exitSearchMode();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up")) {
			this.moveSearchSelection(-1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			this.moveSearchSelection(1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageUp")) {
			this.moveSearchSelection(-this.getSearchVisibleRows());
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageDown")) {
			this.moveSearchSelection(this.getSearchVisibleRows());
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			this.activateSearchResult();
			return;
		}

		const previousQuery = this.input.getValue();
		this.input.handleInput(data);
		if (this.input.getValue() !== previousQuery) {
			this.updateSearchResults();
		}
		this.requestRender();
	}

	private handleDetailInput(data: string): void {
		if (this.isCancelInput(data)) {
			this.mode = this.detailReturnMode;
			this.input.focused = this.focused && this.mode === "search";
			this.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up")) {
			this.scrollDetail(-1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			this.scrollDetail(1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageUp")) {
			this.scrollDetail(-this.getDetailVisibleRows());
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageDown")) {
			this.scrollDetail(this.getDetailVisibleRows());
		}
	}

	private renderBrowse(width: number): string[] {
		const frame = new ModalFrame(this.theme, width);
		const lines = [frame.top("Tool Outputs · Browse")];
		const nodes = this.getBrowseNodes();
		this.reconcileBrowseSelection(nodes);
		const visibleRows = this.getBrowseVisibleRows();
		let renderedRows = 0;

		if (nodes.length === 0) {
			lines.push(
				frame.row(
					`  ${this.theme.fg("dim", "No tool outputs in the current branch")}`,
				),
			);
			renderedRows++;
		} else {
			const { start, end } = this.getBrowseVisibleRange(
				nodes,
				visibleRows,
			);
			for (let index = start; index < end; index++) {
				const node = nodes[index];
				if (!node) continue;
				const selected = node.key === this.selectedBrowseKey;
				lines.push(
					frame.row(this.renderTreeNode(node, selected), {
						selected,
					}),
				);
				renderedRows++;
			}
		}
		while (renderedRows < visibleRows) {
			lines.push(frame.row());
			renderedRows++;
		}

		const selectedNode = nodes.find(
			(node) => node.key === this.selectedBrowseKey,
		);
		this.appendContextRows(lines, frame, selectedNode?.group, selectedNode);
		lines.push(frame.separator());
		lines.push(
			frame.row(
				` ${this.theme.fg("dim", `↑↓ navigate · ←→ tree · Enter select · / search · Esc close · ${this.records.length}`)}`,
			),
		);
		lines.push(frame.bottom());
		return lines;
	}

	private renderSearch(width: number): string[] {
		const frame = new ModalFrame(this.theme, width);
		const lines = [frame.top("Tool Outputs · Search")];
		const inputWidth = Math.max(1, frame.innerWidth - 2);
		const inputLine = this.input.render(inputWidth)[0] ?? "";
		lines.push(frame.row(` ${inputLine}`));
		lines.push(frame.separator());

		const visibleRows = this.getSearchVisibleRows();
		let renderedRows = 0;
		if (this.searchResults.length === 0) {
			const message = this.input.getValue().trim()
				? "No matching tool outputs"
				: "Type to search tool names, commands, paths, or user context";
			lines.push(frame.row(`  ${this.theme.fg("dim", message)}`));
			renderedRows++;
		} else {
			const { start, end } = this.getSearchVisibleRange(visibleRows);
			for (let index = start; index < end; index++) {
				const result = this.searchResults[index];
				if (!result) continue;
				const selected = index === this.selectedSearchIndex;
				lines.push(
					frame.row(this.renderSearchResult(result, selected), {
						selected,
					}),
				);
				renderedRows++;
			}
		}
		while (renderedRows < visibleRows) {
			lines.push(frame.row());
			renderedRows++;
		}

		const selectedResult = this.searchResults[this.selectedSearchIndex];
		const selectedGroup = selectedResult
			? this.groups.find(
					(group) => group.turnNumber === selectedResult.record.turnNumber,
				)
			: undefined;
		this.appendContextRows(
			lines,
			frame,
			selectedGroup,
			selectedResult
				? {
						type: "tool",
						key: toolKey(selectedResult.record.id),
						group: selectedGroup!,
						record: selectedResult.record,
						isLast: false,
					}
				: undefined,
		);
		lines.push(frame.separator());
		lines.push(
			frame.row(
				` ${this.theme.fg("dim", `↑↓ results · Enter inspect · Esc browse · ${this.searchResults.length}/${this.records.length}`)}`,
			),
		);
		lines.push(frame.bottom());
		return lines;
	}

	private renderDetail(width: number): string[] {
		const record = this.detailRecordId
			? this.recordsById.get(this.detailRecordId)
			: undefined;
		if (!record) {
			this.mode = this.detailReturnMode;
			return this.mode === "search"
				? this.renderSearch(width)
				: this.renderBrowse(width);
		}

		const frame = new ModalFrame(this.theme, width);
		const status = record.result.isError
			? this.theme.fg("error", "error")
			: this.theme.fg("success", "success");
		const time = formatTime(record.timestamp);
		const toolName = this.theme.fg(
			getToolColor(record.toolName),
			this.theme.bold(record.toolName),
		);
		const turnPosition = formatTurnPosition(record);
		const meta = ` ${toolName}  ${status}${this.theme.fg("muted", ` · ${turnPosition}`)}${time ? this.theme.fg("dim", ` · ${time}`) : ""}`;
		const prompt = record.userPrompt || "(User prompt unavailable)";
		const detailWidth = Math.max(1, frame.innerWidth - 2);
		const detailLines = this.getDetailLines(record, detailWidth);
		const visibleRows = this.getDetailVisibleRows();
		this.detailLineCount = detailLines.length;
		this.detailScroll = Math.min(
			this.detailScroll,
			Math.max(0, detailLines.length - visibleRows),
		);

		const visible = detailLines.slice(
			this.detailScroll,
			this.detailScroll + visibleRows,
		);
		const lines = [
			frame.top(`Tool Output · ${record.toolName}`),
			frame.row(meta),
			frame.row(
				` ${this.theme.fg("accent", "User ›")} ${this.theme.fg("text", prompt)}`,
			),
			frame.separator(),
		];
		let renderedDetailLines = 0;
		for (const line of visible) {
			lines.push(frame.row(` ${line}`));
			renderedDetailLines++;
		}
		while (renderedDetailLines < visibleRows) {
			lines.push(frame.row());
			renderedDetailLines++;
		}

		lines.push(frame.separator());
		const start = detailLines.length === 0 ? 0 : this.detailScroll + 1;
		const end = Math.min(
			this.detailScroll + visibleRows,
			detailLines.length,
		);
		lines.push(
			frame.row(
				` ${this.theme.fg("dim", `↑↓ scroll · PageUp/PageDown · Esc back to ${this.detailReturnMode} · ${start}-${end}/${detailLines.length}`)}`,
			),
		);
		lines.push(frame.bottom());
		return lines;
	}

	private appendContextRows(
		lines: string[],
		frame: ModalFrame,
		group: TurnGroup | undefined,
		node: TreeNode | undefined,
	): void {
		lines.push(frame.separator());
		if (!group) {
			lines.push(frame.row());
			lines.push(frame.row());
			return;
		}

		const position =
			node?.type === "tool"
				? formatTurnPosition(node.record)
				: `Turn ${group.turnNumber} · ${group.records.length} tools · ${formatRelativeTurn(group.turnNumber, group.totalTurns)}`;
		lines.push(frame.row(` ${this.theme.fg("muted", position)}`));
		const prompt = group.userPrompt || "(User prompt unavailable)";
		lines.push(
			frame.row(
				` ${this.theme.fg("accent", "User ›")} ${this.theme.fg("text", prompt)}`,
			),
		);
	}

	private renderTreeNode(node: TreeNode, selected: boolean): string {
		if (node.type === "turn") {
			const expanded = !this.collapsedTurns.has(node.group.turnNumber);
			const marker = expanded ? "▼" : "▶";
			const title = `Turn ${node.group.turnNumber} · ${node.group.records.length} tools · ${formatRelativeTurn(node.group.turnNumber, node.group.totalTurns)}`;
			const titleText = selected
				? this.theme.fg("accent", this.theme.bold(title))
				: this.theme.fg("muted", this.theme.bold(title));
			const prompt = node.group.userPrompt
				? this.theme.fg("dim", `  User › ${node.group.userPrompt}`)
				: "";
			return ` ${marker} ${titleText}${prompt}`;
		}

		const connector = node.isLast ? "└─" : "├─";
		return `   ${connector} ${this.renderToolLabel(node.record, selected)}`;
	}

	private renderSearchResult(
		result: SearchResult,
		selected: boolean,
	): string {
		const prefix = selected ? " › " : "   ";
		const source =
			result.source === "context"
				? this.theme.fg("muted", "context ")
				: "";
		const position = this.theme.fg(
			"dim",
			` · T${result.record.turnNumber}.${result.record.toolIndexInTurn}`,
		);
		return (
			prefix +
			source +
			this.renderToolLabel(result.record, selected) +
			position
		);
	}

	private renderToolLabel(
		record: ToolOutputRecord,
		selected: boolean,
	): string {
		const status = record.result.isError
			? this.theme.fg("error", "✗")
			: this.theme.fg("success", "✓");
		const name = this.theme.fg(
			getToolColor(record.toolName),
			selected ? this.theme.bold(record.toolName) : record.toolName,
		);
		const summary = record.summary
			? this.theme.fg("text", `  ${record.summary}`)
			: "";
		const time = formatTime(record.timestamp);
		return (
			status +
			" " +
			name +
			summary +
			(time ? this.theme.fg("dim", ` · ${time}`) : "")
		);
	}

	private getBrowseNodes(): TreeNode[] {
		const nodes: TreeNode[] = [];
		for (const group of this.groups) {
			nodes.push({
				type: "turn",
				key: turnKey(group.turnNumber),
				group,
			});
			if (this.collapsedTurns.has(group.turnNumber)) continue;
			for (let index = 0; index < group.records.length; index++) {
				const record = group.records[index]!;
				nodes.push({
					type: "tool",
					key: toolKey(record.id),
					group,
					record,
					isLast: index === group.records.length - 1,
				});
			}
		}
		return nodes;
	}

	private activateBrowseNode(): void {
		const nodes = this.getBrowseNodes();
		const node = nodes.find((item) => item.key === this.selectedBrowseKey);
		if (!node) return;
		if (node.type === "tool") {
			this.openDetail(node.record, "browse");
			return;
		}
		if (this.collapsedTurns.has(node.group.turnNumber)) {
			this.collapsedTurns.delete(node.group.turnNumber);
		} else {
			this.collapsedTurns.add(node.group.turnNumber);
		}
		this.requestRender();
	}

	private activateSearchResult(): void {
		const result = this.searchResults[this.selectedSearchIndex];
		if (result) this.openDetail(result.record, "search");
	}

	private openDetail(record: ToolOutputRecord, returnMode: ListMode): void {
		this.detailRecordId = record.id;
		this.detailReturnMode = returnMode;
		this.mode = "detail";
		this.input.focused = false;
		this.detailScroll = 0;
		this.detailCache = undefined;
		this.requestRender();
	}

	private enterSearchMode(): void {
		this.mode = "search";
		this.input.setValue("");
		this.input.focused = this.focused;
		this.searchResults = [];
		this.selectedSearchIndex = 0;
		this.requestRender();
	}

	private exitSearchMode(): void {
		this.mode = "browse";
		this.input.focused = false;
		this.input.setValue("");
		this.searchResults = [];
		this.selectedSearchIndex = 0;
		this.requestRender();
	}

	private updateSearchResults(): void {
		const query = this.input.getValue().trim();
		this.searchResults = query
			? searchRecords(this.records, query)
			: [];
		this.selectedSearchIndex = 0;
	}

	private foldOrSelectParent(): void {
		const nodes = this.getBrowseNodes();
		const node = nodes.find((item) => item.key === this.selectedBrowseKey);
		if (!node) return;
		if (node.type === "tool") {
			this.selectedBrowseKey = turnKey(node.group.turnNumber);
			this.requestRender();
			return;
		}
		if (!this.collapsedTurns.has(node.group.turnNumber)) {
			this.collapsedTurns.add(node.group.turnNumber);
			this.requestRender();
		}
	}

	private unfoldOrSelectChild(): void {
		const nodes = this.getBrowseNodes();
		const node = nodes.find((item) => item.key === this.selectedBrowseKey);
		if (!node || node.type === "tool") return;
		if (this.collapsedTurns.has(node.group.turnNumber)) {
			this.collapsedTurns.delete(node.group.turnNumber);
			this.requestRender();
			return;
		}
		const child = this.getBrowseNodes().find(
			(item) => item.type === "tool" && item.group === node.group,
		);
		if (child) {
			this.selectedBrowseKey = child.key;
			this.requestRender();
		}
	}

	private reconcileBrowseSelection(nodes: TreeNode[]): void {
		if (
			this.selectedBrowseKey &&
			nodes.some((node) => node.key === this.selectedBrowseKey)
		) {
			return;
		}
		if (this.selectedBrowseKey?.startsWith("tool:")) {
			const record = this.recordsById.get(
				this.selectedBrowseKey.slice("tool:".length),
			);
			const parentKey = record ? turnKey(record.turnNumber) : undefined;
			if (parentKey && nodes.some((node) => node.key === parentKey)) {
				this.selectedBrowseKey = parentKey;
				return;
			}
		}
		this.selectedBrowseKey = nodes.at(-1)?.key;
	}

	private moveBrowseSelection(delta: number): void {
		const nodes = this.getBrowseNodes();
		if (nodes.length === 0) return;
		this.reconcileBrowseSelection(nodes);
		const currentIndex = Math.max(
			0,
			nodes.findIndex((node) => node.key === this.selectedBrowseKey),
		);
		const nextIndex = Math.max(
			0,
			Math.min(currentIndex + delta, nodes.length - 1),
		);
		this.selectedBrowseKey = nodes[nextIndex]?.key;
		this.requestRender();
	}

	private moveSearchSelection(delta: number): void {
		if (this.searchResults.length === 0) return;
		this.selectedSearchIndex = Math.max(
			0,
			Math.min(
				this.selectedSearchIndex + delta,
				this.searchResults.length - 1,
			),
		);
		this.requestRender();
	}

	private scrollDetail(delta: number): void {
		const maxScroll = Math.max(
			0,
			this.detailLineCount - this.getDetailVisibleRows(),
		);
		this.detailScroll = Math.max(
			0,
			Math.min(this.detailScroll + delta, maxScroll),
		);
		this.requestRender();
	}

	private getTargetModalHeight(): number {
		const terminalRows =
			this.tui.terminal?.rows ?? DEFAULT_TERMINAL_ROWS;
		return Math.max(
			MIN_VISIBLE_ROWS + 9,
			Math.floor(terminalRows * MODAL_SCREEN_RATIO),
		);
	}

	private getBrowseVisibleRows(): number {
		return Math.max(
			MIN_VISIBLE_ROWS,
			this.getTargetModalHeight() - 7,
		);
	}

	private getSearchVisibleRows(): number {
		return Math.max(
			MIN_VISIBLE_ROWS,
			this.getTargetModalHeight() - 9,
		);
	}

	private getDetailVisibleRows(): number {
		return Math.max(
			MIN_VISIBLE_ROWS,
			this.getTargetModalHeight() - 7,
		);
	}

	private getBrowseVisibleRange(
		nodes: readonly TreeNode[],
		visibleRows: number,
	): { start: number; end: number } {
		const selectedIndex = Math.max(
			0,
			nodes.findIndex((node) => node.key === this.selectedBrowseKey),
		);
		const start = Math.max(
			0,
			Math.min(
				selectedIndex - Math.floor(visibleRows / 2),
				nodes.length - visibleRows,
			),
		);
		return {
			start,
			end: Math.min(start + visibleRows, nodes.length),
		};
	}

	private getSearchVisibleRange(
		visibleRows: number,
	): { start: number; end: number } {
		const start = Math.max(
			0,
			Math.min(
				this.selectedSearchIndex - Math.floor(visibleRows / 2),
				this.searchResults.length - visibleRows,
			),
		);
		return {
			start,
			end: Math.min(start + visibleRows, this.searchResults.length),
		};
	}

	private getDetailLines(
		record: ToolOutputRecord,
		width: number,
	): string[] {
		if (
			this.detailCache?.recordId === record.id &&
			this.detailCache.width === width
		) {
			return this.detailCache.lines;
		}

		const lines: string[] = [];
		lines.push(this.theme.fg("muted", this.theme.bold("Arguments")));
		const args = formatToolArguments(record);
		const language = record.toolName === "bash" ? "bash" : "json";
		appendWrapped(lines, highlightCode(args, language), width);
		lines.push("");
		lines.push(this.theme.fg("muted", this.theme.bold("Output")));

		const output = getToolOutputText(record);
		if (output) {
			const styledOutput = output
				.split("\n")
				.map((line) => this.theme.fg("toolOutput", line));
			appendWrapped(lines, styledOutput, width);
		} else {
			lines.push(this.theme.fg("dim", "(No textual output)"));
		}

		const fullOutputPath = getFullOutputPath(record);
		if (fullOutputPath) {
			lines.push("");
			appendWrapped(
				lines,
				[
					this.theme.fg(
						"warning",
						`Full output was saved to ${fullOutputPath}`,
					),
				],
				width,
			);
		}

		this.detailCache = { recordId: record.id, width, lines };
		return lines;
	}
}

export async function openToolOutputViewer(
	ctx: ExtensionContext,
): Promise<void> {
	const records = collectToolOutputs(ctx.sessionManager.getBranch());
	await showModal<void>(
		ctx,
		(modalContext) =>
			new ToolOutputViewerComponent(records, modalContext),
		{
			overlayOptions: {
				width: "90%",
				maxHeight: "90%",
			},
			unavailableMessage:
				"Tool Output Viewer is only available in TUI mode",
		},
	);
}
