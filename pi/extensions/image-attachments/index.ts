import { readFileSync, unlinkSync } from "node:fs";
import { basename, extname } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
	resizeImage,
} from "@earendil-works/pi-coding-agent";
import {
	CURSOR_MARKER,
	type EditorTheme,
	matchesKey,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";

const WIDGET_ID = "image-attachments";
const IMAGE_ONLY_PROMPT_MARKER = "[pi:image-only]";
const CLIPBOARD_IMAGE_NAME = /^pi-clipboard-[0-9a-f-]+\.(png|jpe?g|gif|webp)$/i;

const MIME_TYPES: Readonly<Record<string, string>> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
};

interface PendingAttachment {
	bytes: Uint8Array;
	mimeType: string;
	size: number;
}

class AttachmentDraft {
	private attachments: PendingAttachment[] = [];
	private selectedIndex: number | null = null;

	get items(): readonly PendingAttachment[] {
		return this.attachments;
	}

	get count(): number {
		return this.attachments.length;
	}

	get selection(): number | null {
		return this.selectedIndex;
	}

	add(attachment: PendingAttachment): void {
		this.attachments.push(attachment);
		this.selectedIndex = null;
	}

	focusLast(): void {
		this.selectedIndex =
			this.attachments.length > 0 ? this.attachments.length - 1 : null;
	}

	blur(): void {
		this.selectedIndex = null;
	}

	moveSelection(delta: number): void {
		if (this.selectedIndex === null) return;
		this.selectedIndex = Math.max(
			0,
			Math.min(this.selectedIndex + delta, this.attachments.length - 1),
		);
	}

	removeSelected(): void {
		if (this.selectedIndex === null) return;

		this.attachments.splice(this.selectedIndex, 1);
		if (this.attachments.length === 0) {
			this.selectedIndex = null;
			return;
		}
		this.selectedIndex = Math.min(
			this.selectedIndex,
			this.attachments.length - 1,
		);
	}

	takeAll(): PendingAttachment[] {
		const attachments = this.attachments;
		this.attachments = [];
		this.selectedIndex = null;
		return attachments;
	}
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readClipboardAttachment(value: string): PendingAttachment | undefined {
	const filePath = value.trim();
	const fileName = basename(filePath);
	if (!CLIPBOARD_IMAGE_NAME.test(fileName)) return undefined;

	const mimeType = MIME_TYPES[extname(fileName).toLowerCase()];
	if (!mimeType) return undefined;

	let bytes: Buffer;
	try {
		bytes = readFileSync(filePath);
	} catch {
		return undefined;
	}

	try {
		unlinkSync(filePath);
	} catch {
		// The system temp directory remains responsible for failed cleanup.
	}

	return { bytes, mimeType, size: bytes.byteLength };
}

async function processAttachment(
	attachment: PendingAttachment,
): Promise<ImageContent | null> {
	try {
		const result = await resizeImage(attachment.bytes, attachment.mimeType);
		return result
			? { type: "image", data: result.data, mimeType: result.mimeType }
			: null;
	} catch {
		return null;
	}
}

function renderAttachmentRows(
	draft: AttachmentDraft,
	width: number,
	style: (text: string, selected: boolean) => string,
): string[] {
	const chips = draft.items.map((attachment, index) => {
		const text = ` ▣ ${index + 1} · ${formatSize(attachment.size)} `;
		return style(text, draft.selection === index);
	});

	const rows: string[] = [];
	let row = " ";
	for (const chip of chips) {
		const separator = visibleWidth(row) > 1 ? " " : "";
		if (
			visibleWidth(row) + visibleWidth(separator) + visibleWidth(chip) >
				width &&
			visibleWidth(row) > 1
		) {
			rows.push(truncateToWidth(row, width, ""));
			row = ` ${chip}`;
		} else {
			row += separator + chip;
		}
	}
	if (visibleWidth(row) > 1) rows.push(truncateToWidth(row, width, ""));
	return rows;
}

function updateAttachmentWidget(
	ctx: ExtensionContext,
	draft: AttachmentDraft,
): void {
	if (draft.count === 0) {
		ctx.ui.setWidget(WIDGET_ID, undefined);
		return;
	}

	ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => ({
		render(width: number): string[] {
			const rows = renderAttachmentRows(draft, width, (text, selected) =>
				selected
					? theme.bg("selectedBg", theme.fg("accent", theme.bold(text)))
					: theme.fg("muted", text),
			);
			const hint =
				draft.selection === null
					? "↑ focus attachments"
					: "←→ select  Backspace remove  ↓/Esc return";
			rows.push(truncateToWidth(` ${theme.fg("dim", hint)}`, width, ""));
			return rows;
		},
		invalidate(): void {},
	}));
}

class AttachmentEditor extends CustomEditor {
	private cursorOnFirstVisualLine = true;
	private readonly appKeybindings: KeybindingsManager;

	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		private readonly draft: AttachmentDraft,
		private readonly onDraftChange: () => void,
	) {
		super(tui, theme, keybindings);
		this.appKeybindings = keybindings;
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		const cursorRenderLine = lines.findIndex((line) =>
			line.includes(CURSOR_MARKER),
		);
		const viewportStartsBelowFirstLine = lines[0]?.includes("↑") ?? false;
		this.cursorOnFirstVisualLine =
			cursorRenderLine === 1 && !viewportStartsBelowFirstLine;
		return lines;
	}

	override handleInput(data: string): void {
		if (this.draft.selection !== null) {
			if (matchesKey(data, "left")) {
				this.draft.moveSelection(-1);
				this.renderDraft();
				return;
			}
			if (matchesKey(data, "right")) {
				this.draft.moveSelection(1);
				this.renderDraft();
				return;
			}
			if (matchesKey(data, "backspace")) {
				this.draft.removeSelected();
				this.renderDraft();
				return;
			}
			if (matchesKey(data, "up")) return;
			if (matchesKey(data, "down") || matchesKey(data, "escape")) {
				this.draft.blur();
				this.renderDraft();
				return;
			}

			this.draft.blur();
			this.renderDraft();
		}

		if (
			this.draft.count > 0 &&
			this.cursorOnFirstVisualLine &&
			!this.isShowingAutocomplete() &&
			matchesKey(data, "up")
		) {
			this.draft.focusLast();
			this.renderDraft();
			return;
		}

		const editorIsEmpty = this.getText().length === 0;
		const isSubmit = this.appKeybindings.matches(data, "tui.input.submit");
		const isFollowUp = this.appKeybindings.matches(
			data,
			"app.message.followUp",
		);
		if (this.draft.count > 0 && editorIsEmpty && (isSubmit || isFollowUp)) {
			this.setText(IMAGE_ONLY_PROMPT_MARKER);
		}

		super.handleInput(data);
	}

	override insertTextAtCursor(value: string): void {
		const attachment = readClipboardAttachment(value);
		if (!attachment) {
			super.insertTextAtCursor(value);
			return;
		}

		this.draft.add(attachment);
		this.renderDraft();
	}

	private renderDraft(): void {
		this.onDraftChange();
		this.tui.requestRender();
	}
}

export default function imageAttachmentsExtension(pi: ExtensionAPI): void {
	let draft: AttachmentDraft | undefined;

	pi.on("session_start", (_event, ctx) => {
		const sessionDraft = new AttachmentDraft();
		draft = sessionDraft;
		updateAttachmentWidget(ctx, sessionDraft);
		ctx.ui.setEditorComponent(
			(tui, theme, keybindings) =>
				new AttachmentEditor(tui, theme, keybindings, sessionDraft, () =>
					updateAttachmentWidget(ctx, sessionDraft),
				),
		);
	});

	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive" || !draft || draft.count === 0) {
			return { action: "continue" };
		}

		const attachments = draft.takeAll();
		updateAttachmentWidget(ctx, draft);
		const resolvedImages = await Promise.all(
			attachments.map(processAttachment),
		);
		const failedCount = resolvedImages.filter((image) => image === null).length;
		if (failedCount > 0) {
			ctx.ui.notify(
				`${failedCount} image${failedCount === 1 ? "" : "s"} could not be processed and were omitted`,
				"warning",
			);
		}

		const images = [
			...(event.images ?? []),
			...resolvedImages.filter(
				(image): image is ImageContent => image !== null,
			),
		];
		const text = event.text === IMAGE_ONLY_PROMPT_MARKER ? "" : event.text;
		if (text.length === 0 && images.length === 0) return { action: "handled" };
		return { action: "transform", text, images };
	});
}
