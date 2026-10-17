import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
	url: "http://localhost/",
});
Object.defineProperty(globalThis, "navigator", {
	value: dom.window.navigator,
	configurable: true,
});
Object.assign(globalThis, {
	window: dom.window,
	document: dom.window.document,
	localStorage: dom.window.localStorage,
	HTMLElement: dom.window.HTMLElement,
	HTMLDialogElement: dom.window.HTMLDialogElement,
	StorageEvent: dom.window.StorageEvent,
	Event: dom.window.Event,
	MouseEvent: dom.window.MouseEvent,
	IS_REACT_ACT_ENVIRONMENT: true,
});
// jsdom has no native dialog renderer; model only the open/close state for interaction tests.
dom.window.HTMLDialogElement.prototype.showModal = function () {
	this.setAttribute("open", "");
};
dom.window.HTMLDialogElement.prototype.close = function () {
	this.removeAttribute("open");
	this.dispatchEvent(new dom.window.Event("close"));
};
const { act, cleanup, render, screen, within } = await import(
	"@testing-library/react"
);
const { default: userEvent } = await import("@testing-library/user-event");
const { EventApp } = await import("../src/prototype/EventApp");
const { DisplayView } = await import("../src/prototype/DisplayView");
const KEY = "event-management-prototype:v1";

beforeEach(() => {
	localStorage.clear();
	window.history.replaceState(null, "", "/");
});
afterEach(cleanup);

test("DOM: registration, explicit review, assignment, ticket and stage lifecycle", async () => {
	const user = userEvent.setup();
	const app = render(<EventApp />);
	await user.click(screen.getByRole("button", { name: "参加者を追加" }));
	await user.type(screen.getByLabelText("架空のニックネーム"), "デモのこはる");
	await user.selectOptions(screen.getByLabelText("希望する役割"), "designer");
	await user.selectOptions(
		screen.getByLabelText("年齢区分の自己申告（デモ設定）"),
		"minor",
	);
	await user.click(screen.getByRole("button", { name: "登録してパスを発行" }));
	assert.match(
		app.container.querySelector(".event-pass")?.textContent ?? "",
		/DEMO-013/,
	);
	assert.equal(
		(
			screen.getByRole("button", {
				name: "LTチケットを取る",
			}) as HTMLButtonElement
		).disabled,
		true,
	);
	await user.click(screen.getByRole("button", { name: /参加者・受付/ }));
	await user.type(screen.getByLabelText("チェックイントークン"), "demo-013");
	await user.click(screen.getByRole("button", { name: "受付する" }));
	const row = [
		...app.container.querySelectorAll<HTMLElement>(".attendee-row"),
	].find((item) => item.textContent?.includes("デモのこはる"));
	assert.ok(row);
	const approve = within(row).getByRole("button", {
		name: "承認",
	}) as HTMLButtonElement;
	assert.equal(approve.disabled, true);
	await user.click(within(row).getByRole("checkbox"));
	assert.equal(approve.disabled, false);
	await user.click(approve);
	assert.match(row.textContent ?? "", /承認済み/);
	await user.click(screen.getByRole("button", { name: "チーム編成" }));
	await user.click(screen.getByRole("button", { name: "チームを再編成" }));
	assert.match(
		app.container.querySelector(".team-grid")?.textContent ?? "",
		/デモのこはる/,
	);
	await user.click(screen.getByRole("button", { name: "参加者ビュー" }));
	await user.type(screen.getByLabelText("話したいこと"), "小さなアイデアの話");
	await user.click(screen.getByRole("button", { name: "LTチケットを取る" }));
	assert.match(
		app.container.querySelector(".my-ticket")?.textContent ?? "",
		/#005/,
	);
	assert.equal(
		screen.queryByRole("button", { name: "LTチケットを取る" }),
		null,
	);
	await user.click(screen.getByRole("button", { name: "LT・ステージ" }));
	await user.click(screen.getByRole("button", { name: "LTを終了する" }));
	for (let index = 0; index < 3; index++) {
		await user.click(
			screen.getAllByRole("button", {
				name: "次の人を呼び出す",
			})[0],
		);
		await user.click(screen.getByRole("button", { name: "登壇を開始" }));
		await user.click(screen.getByRole("button", { name: "LTを終了する" }));
	}
	await user.click(
		screen.getAllByRole("button", { name: "次の人を呼び出す" })[0],
	);
	await user.click(screen.getByRole("button", { name: "登壇を開始" }));
	await user.selectOptions(screen.getByLabelText("投影テンプレート"), "lt");
	const board = render(<DisplayView />);
	assert.match(
		board.container.querySelector("h1")?.textContent ?? "",
		/小さなアイデアの話/,
	);
	await user.click(screen.getByRole("button", { name: "拍手を送る" }));
	await act(async () => {
		window.dispatchEvent(new dom.window.StorageEvent("storage", { key: KEY }));
	});
	assert.match(
		board.container.querySelector(".display-reactions")?.textContent ?? "",
		/👏 1/,
	);
	await user.clear(screen.getByLabelText("スクリーンに表示するメッセージ"));
	await user.type(
		screen.getByLabelText("スクリーンに表示するメッセージ"),
		"ピザが到着しました！",
	);
	await user.click(screen.getByRole("button", { name: "お知らせを反映" }));
	await act(async () => {
		window.dispatchEvent(new dom.window.StorageEvent("storage", { key: KEY }));
	});
	assert.match(
		board.container.querySelector(".display-announcement")?.textContent ?? "",
		/ピザが到着しました/,
	);
});

test("DOM: bad token, empty search, registration cancel and demo reset", async () => {
	const user = userEvent.setup();
	const app = render(<EventApp />);
	await user.click(screen.getByRole("button", { name: "参加者を追加" }));
	await user.click(screen.getByRole("button", { name: "キャンセル" }));
	assert.equal(screen.queryByRole("dialog"), null);
	await user.click(screen.getByRole("button", { name: /参加者・受付/ }));
	await user.type(screen.getByLabelText("チェックイントークン"), "invalid");
	await user.click(screen.getByRole("button", { name: "受付する" }));
	assert.match(screen.getByRole("alert").textContent ?? "", /見つかりません/);
	await user.type(screen.getByLabelText("参加者を検索"), "存在しないデモ名");
	assert.ok(screen.getByRole("heading", { name: "該当する参加者がいません" }));
	await user.click(screen.getByRole("button", { name: "条件をクリア" }));
	assert.equal(app.container.querySelectorAll(".person-cell").length, 12);
	await user.click(screen.getByRole("button", { name: "デモをリセット" }));
	await user.click(screen.getByRole("button", { name: "戻る" }));
	assert.equal(screen.queryByRole("dialog"), null);
	await user.click(screen.getByRole("button", { name: "デモをリセット" }));
	await user.click(screen.getByRole("button", { name: "リセットする" }));
	assert.match(
		screen.getByRole("status").textContent ?? "",
		/リセットしました/,
	);
});

test("DOM: corrupted persistence is discarded and storage failure retains local edits", async () => {
	localStorage.setItem(
		KEY,
		JSON.stringify({
			version: 1,
			state: {
				attendees: [null],
				teams: [],
				tickets: [],
				event: {},
				board: {},
			},
		}),
	);
	window.history.replaceState(null, "", "/#stage");
	const user = userEvent.setup();
	render(<EventApp />);
	const applause = () => screen.getByRole("button", { name: "拍手を送る" });
	const initial = Number(applause().querySelector("strong")?.textContent);
	await user.click(applause());
	const original = dom.window.Storage.prototype.setItem;
	dom.window.Storage.prototype.setItem = () => {
		throw new Error("quota");
	};
	try {
		await user.click(applause());
		await user.click(applause());
		assert.equal(
			Number(applause().querySelector("strong")?.textContent),
			initial + 3,
		);
		assert.match(screen.getByRole("alert").textContent ?? "", /保存できません/);
	} finally {
		dom.window.Storage.prototype.setItem = original;
	}
	await user.click(applause());
	assert.equal(
		JSON.parse(localStorage.getItem(KEY) ?? "{}").state.tickets.find(
			(ticket: { status: string }) => ticket.status === "live",
		).reactions.clap,
		initial + 4,
	);
});

test("DOM: screen-share cancellation is reported without a connected state", async () => {
	Object.defineProperty(dom.window.navigator, "mediaDevices", {
		configurable: true,
		value: {
			getDisplayMedia: () =>
				Promise.reject(new DOMException("cancelled", "NotAllowedError")),
		},
	});
	window.history.replaceState(null, "", "/#stage");
	const user = userEvent.setup();
	const app = render(<EventApp />);
	await user.click(screen.getByRole("button", { name: "画面共有を試す" }));
	assert.match(
		app.container.querySelector(".share-status")?.textContent ?? "",
		/キャンセル/,
	);
	assert.equal(app.container.querySelector(".share-video"), null);
	assert.equal(
		(
			screen.getByRole("button", {
				name: "画面共有を試す",
			}) as HTMLButtonElement
		).disabled,
		false,
	);
});

test("DOM: pending screen capture is stopped if the user leaves before resolution", async () => {
	let resolveCapture: ((value: MediaStream) => void) | undefined;
	let stopped = 0;
	const fakeStream = {
		getTracks: () => [
			{
				stop: () => {
					stopped += 1;
				},
			},
		],
	} as unknown as MediaStream;
	Object.defineProperty(dom.window.navigator, "mediaDevices", {
		configurable: true,
		value: {
			getDisplayMedia: () =>
				new Promise<MediaStream>((resolve) => {
					resolveCapture = resolve;
				}),
		},
	});
	window.history.replaceState(null, "", "/#stage");
	const user = userEvent.setup();
	render(<EventApp />);
	await user.click(screen.getByRole("button", { name: "画面共有を試す" }));
	await user.click(screen.getByRole("button", { name: "ダッシュボード" }));
	await act(async () => {
		resolveCapture?.(fakeStream);
	});
	assert.equal(stopped, 1);
	assert.ok(
		screen.getByRole("heading", { name: "イベントのいまを、見渡そう。" }),
	);
});
