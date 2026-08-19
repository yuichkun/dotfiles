import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { openPlanDashboard } from "./dashboard.ts";
import { planIsComplete, PlanRuntime } from "./state.ts";

export async function openPlanHistory(ctx: ExtensionContext): Promise<void> {
	const runtime = new PlanRuntime();
	runtime.restore(ctx.sessionManager.getBranch());
	const history = runtime.getPlanHistory();
	if (history.length === 0) {
		ctx.ui.notify("No previous Living Plans exist on this branch", "info");
		return;
	}
	const labels = history.map((plan, index) => {
		const status = planIsComplete(plan) ? "complete" : "unfinished";
		return `${index + 1}. ${plan.title} · r${plan.revision} · ${status} · ${new Date(plan.updatedAt).toLocaleString()}`;
	});
	const selectedLabel = await ctx.ui.select("Open Plan History", labels);
	if (!selectedLabel) return;
	const selectedIndex = labels.indexOf(selectedLabel);
	const selected = history[selectedIndex];
	if (!selected) return;
	await openPlanDashboard(ctx, selected, { historical: true });
}
