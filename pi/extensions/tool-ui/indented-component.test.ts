import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth, type Component } from "@earendil-works/pi-tui";
import {
	CachedCompositeComponent,
	IndentedComponent,
	assertComponentWidth,
} from "./indented-component.ts";

class LinesComponent implements Component {
	private readonly values: string[];

	constructor(values: string[]) {
		this.values = values;
	}

	render(width: number): string[] {
		return this.values.map((value) => value.slice(0, width));
	}
	invalidate(): void {}
}

class CountingComponent implements Component {
	renderCount = 0;
	invalidateCount = 0;

	render(): string[] {
		this.renderCount++;
		return ["cached child"];
	}

	invalidate(): void {
		this.invalidateCount++;
	}
}

test("caches a composed expanded row without rerendering its children", () => {
	const firstChild = new CountingComponent();
	const secondChild = new CountingComponent();
	const component = new CachedCompositeComponent([firstChild, secondChild]);
	const first = component.render(80);
	assert.strictEqual(component.render(80), first);
	assert.equal(firstChild.renderCount, 1);
	assert.equal(secondChild.renderCount, 1);

	component.invalidate();
	component.render(80);
	assert.equal(firstChild.renderCount, 2);
	assert.equal(secondChild.renderCount, 2);
});

test("caches settled output at the same width and clears on invalidation", () => {
	const child = new CountingComponent();
	const component = new IndentedComponent(child);
	const first = component.render(80);
	assert.strictEqual(component.render(80), first);
	assert.equal(child.renderCount, 1);

	component.render(100);
	assert.equal(child.renderCount, 2);

	component.invalidate();
	assert.equal(child.invalidateCount, 1);
	component.render(100);
	assert.equal(child.renderCount, 3);
});

test("renders child content four columns deeper", () => {
	const component = new IndentedComponent(new LinesComponent(["first", "second"]));
	assert.deepEqual(component.render(40), ["    first", "    second"]);
	assertComponentWidth(component, 40);
});

test("limits preview lines and renders an indented overflow hint", () => {
	const component = new IndentedComponent(
		new LinesComponent(["one", "two", "three", "four"]),
		{
			maxLines: 2,
			overflowText: (remaining) => `… ${remaining} more lines`,
		},
	);
	assert.deepEqual(component.render(40), [
		"    one",
		"    two",
		"    … 2 more lines",
	]);
});

test("shrinks indentation for narrow widths", () => {
	const component = new IndentedComponent(new LinesComponent(["abcdefghijk"]));
	assert.equal(component.render(8)[0], "  abcdef");
	for (const width of [4, 8, 40, 120]) {
		for (const line of component.render(width)) {
			assert.ok(visibleWidth(line) <= width);
		}
	}
});
