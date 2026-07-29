import {
	createBashToolDefinition,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { renderHiddenResult } from "./hidden-results.ts";
import { formatShellCommand } from "./shell-command.ts";

export function registerBashTool(pi: ExtensionAPI) {
	const bash = createBashToolDefinition(process.cwd());

	pi.registerTool({
		...bash,

		renderCall(args, theme, context) {
			const component =
				context.lastComponent instanceof Text
					? context.lastComponent
					: new Text("", 0, 0);

			const command =
				typeof args?.command === "string" ? args.command : "";
			const timeoutSuffix =
				typeof args?.timeout === "number"
					? theme.fg("muted", ` (timeout ${args.timeout}s)`)
					: "";

			component.setText(
				formatShellCommand(command, theme) + timeoutSuffix,
			);
			return component;
		},

		renderResult(_result, _options, _theme, context) {
			return renderHiddenResult(context.lastComponent);
		},
	});
}
