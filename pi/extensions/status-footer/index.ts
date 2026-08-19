import type {
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import {
	parseGitPorcelain,
	StatusFooterComponent,
	type WorkingTreeStatus,
} from "./footer.ts";

const GIT_REFRESH_TOOLS = new Set(["edit", "write", "bash"]);

interface FooterRuntime {
	ctx: ExtensionContext;
	tui: TUI;
	workingTree: WorkingTreeStatus;
	controller: AbortController;
	unsubscribeBranch: () => void;
	refreshing: boolean;
	refreshPending: boolean;
	disposed: boolean;
	dispose(): void;
}

export default function statusFooterExtension(pi: ExtensionAPI): void {
	let active: FooterRuntime | undefined;

	const requestRender = (): void => {
		const runtime = active;
		if (runtime && !runtime.disposed) runtime.tui.requestRender();
	};

	const refreshGitStatus = async (runtime: FooterRuntime): Promise<void> => {
		if (runtime.disposed) return;
		if (runtime.refreshing) {
			runtime.refreshPending = true;
			return;
		}
		runtime.refreshing = true;
		try {
			do {
				runtime.refreshPending = false;
				let next: WorkingTreeStatus = "unknown";
				try {
					const result = await pi.exec(
						"git",
						["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=normal"],
						{
							cwd: runtime.ctx.cwd,
							signal: runtime.controller.signal,
							timeout: 5_000,
						},
					);
					if (result.code === 0) next = parseGitPorcelain(result.stdout);
				} catch {
					// A missing repository or an aborted refresh leaves the branch neutral.
				}
				if (runtime.disposed || runtime.controller.signal.aborted) return;
				runtime.workingTree = next;
				runtime.tui.requestRender();
			} while (runtime.refreshPending && !runtime.disposed);
		} finally {
			runtime.refreshing = false;
		}
	};

	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			active?.dispose();
			const controller = new AbortController();
			const runtime: FooterRuntime = {
				ctx,
				tui,
				workingTree: "unknown" as WorkingTreeStatus,
				controller,
				unsubscribeBranch: () => {},
				refreshing: false,
				refreshPending: false,
				disposed: false,
				dispose() {
					if (runtime.disposed) return;
					runtime.disposed = true;
					runtime.controller.abort();
					runtime.unsubscribeBranch();
					if (active === runtime) active = undefined;
				},
			};
			runtime.unsubscribeBranch = footerData.onBranchChange(() => {
				runtime.tui.requestRender();
				void refreshGitStatus(runtime);
			});
			active = runtime;
			void refreshGitStatus(runtime);

			return new StatusFooterComponent(
				() => ({
					cwd: ctx.cwd,
					branch: footerData.getGitBranch(),
					workingTree: runtime.workingTree,
					model: ctx.model?.id ?? "no-model",
					thinkingLevel: pi.getThinkingLevel(),
					contextPercent: ctx.getContextUsage()?.percent ?? null,
				}),
				theme,
				() => runtime.dispose(),
			);
		});
	});

	pi.on("model_select", requestRender);
	pi.on("thinking_level_select", requestRender);
	pi.on("message_end", (event) => {
		if (event.message.role === "assistant") requestRender();
	});
	pi.on("tool_execution_end", (event) => {
		const runtime = active;
		if (!runtime || !GIT_REFRESH_TOOLS.has(event.toolName)) return;
		void refreshGitStatus(runtime);
	});
	pi.on("session_shutdown", () => {
		active?.dispose();
		active = undefined;
	});
}
