import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	fuzzyFilter,
	Input,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import { paint } from "../shared/color-policy.ts";
import { ModalFrame } from "../shared/modal-frame.ts";
import {
	BaseModal,
	showModal,
	type ModalContext,
} from "../shared/modal.ts";
import {
	discoverWorkspaces,
	type Workspace,
} from "./discovery.ts";
import {
	loadWorkspaceHistory,
	recordWorkspaceOpen,
} from "./history.ts";
import { openInVsCode } from "./launcher.ts";

const DEFAULT_TERMINAL_ROWS = 30;
const MODAL_SCREEN_RATIO = 0.9;
const MIN_VISIBLE_ROWS = 8;

function abbreviateHome(path: string): string {
	const home = homedir();
	return path === home
		? "~"
		: path.startsWith(`${home}/`)
			? `~/${path.slice(home.length + 1)}`
			: path;
}

function getWorkspaceSearchText(workspace: Workspace): string {
	return `${workspace.name} ${workspace.path}`;
}

function sortWorkspaces(
	workspaces: readonly Workspace[],
	recentPaths: readonly string[],
	currentDirectory: string,
): Workspace[] {
	const currentPath = resolve(currentDirectory);
	const recentRank = new Map(
		recentPaths.map((path, index) => [path, index]),
	);
	return [...workspaces].sort((left, right) => {
		const leftIsCurrent = resolve(left.path) === currentPath;
		const rightIsCurrent = resolve(right.path) === currentPath;
		if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1;

		const leftRank = recentRank.get(left.path);
		const rightRank = recentRank.get(right.path);
		if (leftRank !== undefined || rightRank !== undefined) {
			if (leftRank === undefined) return 1;
			if (rightRank === undefined) return -1;
			return leftRank - rightRank;
		}
		return left.name.localeCompare(right.name, undefined, {
			sensitivity: "base",
		});
	});
}

export class WorkspacePickerComponent extends BaseModal<string> {
	private readonly input = new Input();
	private readonly workspaces: readonly Workspace[];
	private readonly currentDirectory: string;
	private filteredWorkspaces: Workspace[];
	private selectedIndex = 0;

	constructor(
		workspaces: readonly Workspace[],
		currentDirectory: string,
		context: ModalContext<string>,
	) {
		super(context);
		this.workspaces = workspaces;
		this.currentDirectory = resolve(currentDirectory);
		this.filteredWorkspaces = [...workspaces];
	}

	protected override onFocusChange(focused: boolean): void {
		this.input.focused = focused;
	}

	override handleInput(data: string): void {
		if (this.isCancelInput(data)) {
			this.cancel();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up")) {
			this.moveSelection(-1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			this.moveSelection(1);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageUp")) {
			this.moveSelection(-this.getVisibleRowCount());
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageDown")) {
			this.moveSelection(this.getVisibleRowCount());
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			const selected = this.filteredWorkspaces[this.selectedIndex];
			if (selected) this.close(selected.path);
			return;
		}

		const previousQuery = this.input.getValue();
		this.input.handleInput(data);
		if (this.input.getValue() !== previousQuery) this.updateFilter();
		this.requestRender();
	}

	override invalidate(): void {
		this.input.invalidate();
	}

	override render(width: number): string[] {
		if (width < 4) return [truncateToWidth("Workspaces", width, "")];

		const frame = new ModalFrame(this.theme, width);
		const lines = [frame.top("Open in VS Code")];
		const inputWidth = Math.max(1, frame.innerWidth - 2);
		lines.push(frame.row(` ${this.input.render(inputWidth)[0] ?? ""}`));
		lines.push(frame.separator());

		const visibleRows = this.getVisibleRowCount();
		let renderedRows = 0;
		if (this.filteredWorkspaces.length === 0) {
			const message = this.input.getValue().trim()
				? "No matching workspaces"
				: "No workspaces found in the configured roots";
			lines.push(frame.row(`  ${paint(this.theme, "tertiary", message)}`));
			renderedRows++;
		} else {
			const { start, end } = this.getVisibleRange(visibleRows);
			for (let index = start; index < end; index++) {
				const workspace = this.filteredWorkspaces[index];
				if (!workspace) continue;
				const selected = index === this.selectedIndex;
				lines.push(
					frame.row(this.renderWorkspace(workspace, selected), {
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

		lines.push(frame.separator());
		const selected = this.filteredWorkspaces[this.selectedIndex];
		const selectedPath = selected
			? abbreviateHome(selected.path)
			: "";
		lines.push(frame.row(` ${paint(this.theme, "primary", selectedPath)}`));
		lines.push(frame.separator());
		lines.push(
			frame.row(
				` ${paint(this.theme, "tertiary", `↑↓ navigate · Enter open · Esc close · ${this.filteredWorkspaces.length}/${this.workspaces.length}`)}`,
			),
		);
		lines.push(frame.bottom());
		return lines;
	}

	private renderWorkspace(
		workspace: Workspace,
		selected: boolean,
	): string {
		const prefix = selected ? paint(this.theme, "focus", " › ") : "   ";
		const name = selected
			? paint(this.theme, "focus", this.theme.bold(workspace.name))
			: paint(this.theme, "primary", workspace.name);
		const current =
			resolve(workspace.path) === this.currentDirectory
				? paint(this.theme, "focus", "  current")
				: "";
		const path = paint(
			this.theme,
			"secondary",
			`  ${abbreviateHome(workspace.path)}`,
		);
		return prefix + name + current + path;
	}

	private updateFilter(): void {
		const query = this.input.getValue().trim();
		this.filteredWorkspaces = query
			? fuzzyFilter(
					[...this.workspaces],
					query,
					getWorkspaceSearchText,
				)
			: [...this.workspaces];
		this.selectedIndex = 0;
	}

	private moveSelection(delta: number): void {
		if (this.filteredWorkspaces.length === 0) return;
		this.selectedIndex = Math.max(
			0,
			Math.min(
				this.selectedIndex + delta,
				this.filteredWorkspaces.length - 1,
			),
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

	private getVisibleRowCount(): number {
		return Math.max(
			MIN_VISIBLE_ROWS,
			this.getTargetModalHeight() - 9,
		);
	}

	private getVisibleRange(
		visibleRows: number,
	): { start: number; end: number } {
		const start = Math.max(
			0,
			Math.min(
				this.selectedIndex - Math.floor(visibleRows / 2),
				this.filteredWorkspaces.length - visibleRows,
			),
		);
		return {
			start,
			end: Math.min(
				start + visibleRows,
				this.filteredWorkspaces.length,
			),
		};
	}
}

export async function openWorkspacePicker(
	ctx: ExtensionContext,
): Promise<void> {
	const [discoveredWorkspaces, recentPaths] = await Promise.all([
		discoverWorkspaces(),
		loadWorkspaceHistory(),
	]);
	const currentPath = resolve(ctx.cwd);
	const workspacesByPath = new Map(
		discoveredWorkspaces.map((workspace) => [
			resolve(workspace.path),
			workspace,
		]),
	);
	if (!workspacesByPath.has(currentPath)) {
		workspacesByPath.set(currentPath, {
			name: basename(currentPath),
			path: currentPath,
			source: "configured",
		});
	}
	const workspaces = [...workspacesByPath.values()];
	const orderedWorkspaces = sortWorkspaces(
		workspaces,
		recentPaths,
		currentPath,
	);
	const selectedPath = await showModal<string>(
		ctx,
		(modalContext) =>
			new WorkspacePickerComponent(
				orderedWorkspaces,
				ctx.cwd,
				modalContext,
			),
		{
			overlayOptions: {
				width: "85%",
				maxHeight: "90%",
			},
			unavailableMessage:
				"Workspace Picker is only available in TUI mode",
		},
	);
	if (!selectedPath) return;

	const selected = workspaces.find(
		(workspace) => workspace.path === selectedPath,
	);
	await openInVsCode(selectedPath);
	try {
		await recordWorkspaceOpen(selectedPath);
	} catch {
		// Opening the editor succeeded; history persistence is best-effort.
	}
	ctx.ui.notify(
		`Opening ${selected?.name ?? abbreviateHome(selectedPath)} in VS Code`,
		"info",
	);
}
