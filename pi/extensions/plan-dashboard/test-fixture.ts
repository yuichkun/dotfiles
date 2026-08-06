import type { Plan, PlanStep, StoredStepStatus } from "./plan.ts";

const UPDATED_AT = "2026-01-01T00:00:00.000Z";

function step(
	id: string,
	title: string,
	dependsOn: readonly string[],
	status: StoredStepStatus,
	phase: string,
): PlanStep {
	return {
		id,
		phase,
		title,
		shortTitle: title.slice(0, 8),
		goal: `${title}の目的を達成する。`,
		work: [`${title}に必要な作業を行う。`],
		acceptance: [`${title}が検証されている。`],
		dependsOn,
		relatedFiles: [`src/${id.toLowerCase()}.ts`],
		status,
		updatedAt: UPDATED_AT,
		updatedBy: "agent",
	};
}

export const TEST_PLAN: Plan = {
	schemaVersion: 1,
	id: "plan-test",
	requestId: "request-test",
	request: "Living Planを実装する",
	consultationId: "consultation-test",
	title: "Living Plan実装",
	objective: "依存関係付きの計画を継続的に更新する。",
	revision: 4,
	changeReason: "UI test fixture",
	createdAt: UPDATED_AT,
	updatedAt: UPDATED_AT,
	steps: [
		step("S01", "要求を整理する", [], "done", "調査"),
		step("S02", "Pi APIを調査する", [], "done", "調査"),
		step("S03", "Fableへ相談する", [], "done", "調査"),
		step("S04", "DAGダッシュボードを実装する", ["S01", "S02", "S03"], "in_progress", "UI"),
		step("S05", "評価基準を決める", ["S01", "S03"], "pending", "UI"),
		step("S06", "状態モデルを設計する", ["S01", "S02"], "pending", "基盤"),
		step("S07", "UIを評価する", ["S04", "S05", "S06"], "pending", "評価"),
		step("S08", "UIを調整する", ["S07"], "pending", "調整"),
		step("S09", "状態Toolを実装する", ["S07", "S10", "S11", "S12"], "pending", "実装"),
		step("S10", "Session復元を実装する", ["S06"], "pending", "実装"),
		step("S11", "Fable連携を実装する", ["S06"], "pending", "実装"),
		step("S12", "UIと状態を接続する", ["S04", "S06"], "pending", "統合"),
		step("S13", "継続更新を統合する", ["S08", "S09"], "pending", "統合"),
		step("S14", "全体を検証する", ["S13"], "pending", "検証"),
		step("S15", "利用方法を文書化する", ["S14"], "pending", "リリース"),
	],
};
