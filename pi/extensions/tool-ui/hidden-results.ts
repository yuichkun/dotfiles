import {
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type ExtensionAPI,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text, type Component } from "@earendil-works/pi-tui";

export function renderHiddenResult(
	lastComponent: Component | undefined,
): Text {
	const component =
		lastComponent instanceof Text
			? lastComponent
			: new Text("", 0, 0);
	component.setText("");
	return component;
}

/**
 * Keeps each built-in tool's execution and call renderer intact while replacing
 * only its result renderer with an empty component.
 */
export function registerHiddenResultTools(pi: ExtensionAPI): void {
	const cwd = process.cwd();
	const definitions: ToolDefinition<any, any, any>[] = [
		createReadToolDefinition(cwd),
		createWriteToolDefinition(cwd),
		createEditToolDefinition(cwd),
		createGrepToolDefinition(cwd),
		createFindToolDefinition(cwd),
		createLsToolDefinition(cwd),
	];

	for (const definition of definitions) {
		pi.registerTool({
			...definition,
			renderResult(_result, _options, _theme, context) {
				return renderHiddenResult(context.lastComponent);
			},
		});
	}
}
