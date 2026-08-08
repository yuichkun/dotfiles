import {
	truncateToWidth,
	visibleWidth,
	type Component,
} from "@earendil-works/pi-tui";

export interface IndentedComponentOptions {
	indent?: number;
	maxLines?: number;
	overflowText?: (remainingLines: number) => string;
}

export class CachedCompositeComponent implements Component {
	private readonly children: Component[];
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(children: Component[]) {
		this.children = children;
	}

	render(width: number): string[] {
		if (width <= 0) return [];
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;
		const lines: string[] = [];
		for (const child of this.children) lines.push(...child.render(width));
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
		for (const child of this.children) child.invalidate();
	}
}

function resolveIndent(width: number, preferred: number): number {
	if (width >= preferred + 8) return preferred;
	if (width >= 6) return Math.min(2, preferred);
	return 0;
}

export class IndentedComponent implements Component {
	private child: Component;
	private options: IndentedComponentOptions;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(child: Component, options: IndentedComponentOptions = {}) {
		this.child = child;
		this.options = options;
	}

	setChild(child: Component): void {
		if (this.child === child) return;
		this.child = child;
		this.clearCache();
	}

	setOptions(options: IndentedComponentOptions): void {
		this.options = options;
		this.clearCache();
	}

	render(width: number): string[] {
		if (width <= 0) return [];
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;
		const indent = resolveIndent(width, Math.max(0, this.options.indent ?? 4));
		const prefix = " ".repeat(indent);
		const childWidth = Math.max(1, width - indent);
		const rendered = this.child.render(childWidth);
		const maxLines = this.options.maxLines;
		const visible = maxLines === undefined ? rendered : rendered.slice(0, maxLines);
		const lines = visible.map((line) => truncateToWidth(prefix + line, width, ""));
		const remaining = rendered.length - visible.length;
		if (remaining > 0 && this.options.overflowText) {
			lines.push(
				truncateToWidth(prefix + this.options.overflowText(remaining), width, ""),
			);
		}
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.clearCache();
		this.child.invalidate();
	}

	private clearCache(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

export function assertComponentWidth(component: Component, width: number): void {
	for (const line of component.render(width)) {
		if (visibleWidth(line) > width) {
			throw new Error(`Component line width ${visibleWidth(line)} exceeds ${width}`);
		}
	}
}
