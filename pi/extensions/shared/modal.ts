import type {
	ExtensionContext,
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import type {
	Component,
	Focusable,
	OverlayHandle,
	OverlayOptions,
	TUI,
} from "@earendil-works/pi-tui";

export interface ModalContext<T> {
	readonly tui: TUI;
	readonly theme: Theme;
	readonly keybindings: KeybindingsManager;
	close(result?: T): void;
}

export type ModalFactory<T> = (
	context: ModalContext<T>,
) =>
	| (Component & { dispose?(): void })
	| Promise<Component & { dispose?(): void }>;

export interface ShowModalOptions {
	overlayOptions?: OverlayOptions;
	onHandle?: (handle: OverlayHandle) => void;
	unavailableMessage?: string;
}

const DEFAULT_OVERLAY_OPTIONS: OverlayOptions = {
	anchor: "center",
	maxHeight: "80%",
	margin: 1,
};

/**
 * Opens a focused overlay and resolves after the modal closes.
 * Domain-specific modals should depend on this function, not on each other.
 */
export async function showModal<T>(
	ctx: ExtensionContext,
	factory: ModalFactory<T>,
	options: ShowModalOptions = {},
): Promise<T | undefined> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify(
			options.unavailableMessage ??
				"This modal is only available in TUI mode",
			"warning",
		);
		return undefined;
	}

	return ctx.ui.custom<T | undefined>(
		(tui, theme, keybindings, done) =>
			factory({
				tui,
				theme,
				keybindings,
				close: (result) => done(result),
			}),
		{
			overlay: true,
			overlayOptions: {
				...DEFAULT_OVERLAY_OPTIONS,
				...options.overlayOptions,
			},
			...(options.onHandle && { onHandle: options.onHandle }),
		},
	);
}

/**
 * Optional base class for modal components.
 * It centralizes focus, closing, keybindings, and render invalidation without
 * imposing any domain-specific layout or interaction model.
 */
export abstract class BaseModal<T> implements Component, Focusable {
	protected readonly tui: TUI;
	protected readonly theme: Theme;
	protected readonly keybindings: KeybindingsManager;
	private readonly closeModal: (result?: T) => void;
	private _focused = false;

	constructor(context: ModalContext<T>) {
		this.tui = context.tui;
		this.theme = context.theme;
		this.keybindings = context.keybindings;
		this.closeModal = context.close;
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.onFocusChange(value);
	}

	protected onFocusChange(_focused: boolean): void {}

	protected close(result?: T): void {
		this.closeModal(result);
	}

	protected cancel(): void {
		this.closeModal(undefined);
	}

	protected isCancelInput(data: string): boolean {
		return this.keybindings.matches(data, "tui.select.cancel");
	}

	protected requestRender(): void {
		this.tui.requestRender();
	}

	invalidate(): void {}

	abstract handleInput(data: string): void;
	abstract render(width: number): string[];
}
