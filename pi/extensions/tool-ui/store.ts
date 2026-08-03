import type {
	RuntimeToolState,
	ToolSemanticSummary,
} from "./types.ts";

const RENDER_INTERVAL_MS = 120;

export class ToolSummaryStore {
	private readonly states = new Map<string, RuntimeToolState>();

	ensure(
		toolCallId: string,
		toolName: string,
		args: Record<string, unknown>,
	): RuntimeToolState {
		let state = this.states.get(toolCallId);
		if (!state) {
			state = {
				toolName,
				args,
				status: "pending",
			};
			this.states.set(toolCallId, state);
		} else {
			state.toolName = toolName;
			state.args = args;
		}
		return state;
	}

	get(toolCallId: string): RuntimeToolState | undefined {
		return this.states.get(toolCallId);
	}

	bindInvalidator(toolCallId: string, invalidate: () => void): void {
		const state = this.states.get(toolCallId);
		if (state) state.invalidate = invalidate;
	}

	setSemantic(toolCallId: string, semantic: ToolSemanticSummary): void {
		const state = this.states.get(toolCallId);
		if (!state) return;
		state.semantic = semantic;
		state.invalidate?.();
	}

	start(
		toolCallId: string,
		toolName: string,
		args: Record<string, unknown>,
	): void {
		const state = this.ensure(toolCallId, toolName, args);
		state.status = "running";
		state.startedAt ??= Date.now();
		if (!state.timer) {
			state.timer = setInterval(() => state.invalidate?.(), RENDER_INTERVAL_MS);
			state.timer.unref?.();
		}
		state.invalidate?.();
	}

	finish(toolCallId: string, isError: boolean): void {
		const state = this.states.get(toolCallId);
		if (!state) return;
		state.status = isError ? "error" : "success";
		state.endedAt = Date.now();
		if (state.timer) {
			clearInterval(state.timer);
			state.timer = undefined;
		}
		state.invalidate?.();
	}

	release(toolCallId: string): void {
		const state = this.states.get(toolCallId);
		if (state?.timer) clearInterval(state.timer);
		this.states.delete(toolCallId);
	}

	getDurationMs(toolCallId: string, now = Date.now()): number | undefined {
		const state = this.states.get(toolCallId);
		if (!state?.startedAt) return undefined;
		return Math.max(0, (state.endedAt ?? now) - state.startedAt);
	}

	clear(): void {
		for (const state of this.states.values()) {
			if (state.timer) clearInterval(state.timer);
		}
		this.states.clear();
	}
}
