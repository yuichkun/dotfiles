import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { OverlayHandle } from "@earendil-works/pi-tui";
import { registerPlanCommand } from "./command.ts";
import { buildPlanContext } from "./context.ts";
import { openPlanDashboard } from "./dashboard.ts";
import {
	PlanProgressHeader,
	type ProgressHeaderState,
} from "./progress-header.ts";
import {
	isPlanToolDetails,
	PLAN_TOOL_NAME,
	planRuntime,
	type PlanRuntimeState,
} from "./state.ts";
import { registerPlanTool } from "./tool.ts";

export default function planDashboardExtension(pi: ExtensionAPI): void {
	let activeContext: ExtensionContext | undefined;
	let progressHeader: PlanProgressHeader | undefined;
	let progressHeaderHandle: OverlayHandle | undefined;
	let creatingHeader = false;

	const headerState = (
		state: Readonly<PlanRuntimeState>,
	): ProgressHeaderState | undefined => {
		if (!state.plan) return undefined;
		return {
			plan: state.plan,
			workSinceUpdate: state.workSinceUpdate,
			turnsSinceUpdate: state.turnsSinceUpdate,
		};
	};

	const syncProgressHeader = (state: Readonly<PlanRuntimeState>): void => {
		const ctx = activeContext;
		if (!ctx || ctx.mode !== "tui") return;
		const next = headerState(state);
		if (!next) {
			progressHeaderHandle?.setHidden(true);
			return;
		}
		if (progressHeader && progressHeaderHandle) {
			progressHeader.setState(next);
			progressHeaderHandle.setHidden(false);
			return;
		}
		if (creatingHeader) return;
		creatingHeader = true;
		void ctx.ui
			.custom<void>(
				(tui, theme) => {
					const latest = headerState(planRuntime.getState()) ?? next;
					progressHeader = new PlanProgressHeader(
						latest,
						theme,
						() => tui.requestRender(),
					);
					return progressHeader;
				},
				{
					overlay: true,
					overlayOptions: {
						anchor: "top-center",
						width: "100%",
						maxHeight: 4,
						margin: 0,
						nonCapturing: true,
					},
					onHandle: (handle) => {
						progressHeaderHandle = handle;
						handle.setHidden(!planRuntime.getPlan());
					},
				},
			)
			.catch((error) => {
				const message =
					error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Plan progress header failed: ${message}`, "error");
			})
			.finally(() => {
				creatingHeader = false;
				progressHeader = undefined;
				progressHeaderHandle = undefined;
			});
	};

	const syncPlanToolAvailability = (
		state: Readonly<PlanRuntimeState>,
	): void => {
		const activeTools = pi.getActiveTools();
		const hasPlanTool = activeTools.includes(PLAN_TOOL_NAME);
		if (state.enabled === hasPlanTool) return;
		pi.setActiveTools(
			state.enabled
				? [...activeTools, PLAN_TOOL_NAME]
				: activeTools.filter((name) => name !== PLAN_TOOL_NAME),
		);
	};

	const syncRuntime = (state: Readonly<PlanRuntimeState>): void => {
		syncPlanToolAvailability(state);
		syncProgressHeader(state);
	};

	const unsubscribe = planRuntime.subscribe(syncRuntime);
	registerPlanCommand(pi, planRuntime);
	registerPlanTool(pi, planRuntime);

	pi.registerCommand("plan-dashboard", {
		description: "Open the living plan dashboard",
		handler: async (_args, ctx) => {
			try {
				await openPlanDashboard(ctx);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Plan Dashboard failed: ${message}`, "error");
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		activeContext = ctx;
		planRuntime.restore(ctx.sessionManager.getBranch());
		const { error } = planRuntime.getState();
		if (error) ctx.ui.notify(`Living plan state is invalid: ${error}`, "error");
	});

	pi.on("session_tree", async (_event, ctx) => {
		activeContext = ctx;
		planRuntime.restore(ctx.sessionManager.getBranch());
		const { error } = planRuntime.getState();
		if (error) ctx.ui.notify(`Living plan state is invalid: ${error}`, "error");
	});

	pi.on("context", async (event) => {
		const content = buildPlanContext(planRuntime.getState());
		if (!content) return;
		const messages = [...event.messages];
		messages.push({
			role: "custom",
			customType: "living-plan.context",
			content,
			display: false,
			timestamp: Date.now(),
		} as (typeof messages)[number]);
		return { messages };
	});

	pi.on("tool_result", async (event) => {
		if (event.toolName === PLAN_TOOL_NAME) return;
		planRuntime.recordToolResult(event.toolName, event.isError);
	});

	pi.on("turn_end", async (event) => {
		const updatedPlan = event.toolResults.some(
			(result) =>
				result.toolName === PLAN_TOOL_NAME &&
				isPlanToolDetails(result.details) &&
				result.details.kind === "plan",
		);
		if (!updatedPlan) planRuntime.recordTurn();
	});

	pi.on("session_shutdown", async () => {
		unsubscribe();
		progressHeaderHandle?.hide();
		progressHeader = undefined;
		progressHeaderHandle = undefined;
		activeContext = undefined;
	});
}
