import { expect, test } from "@playwright/test";

test("registration → check-in → explicit minor review → team → LT → projection", async ({
	page,
	context,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await page.getByRole("button", { name: "参加者を追加" }).click();
	await page.getByLabel("架空のニックネーム").fill("デモのこはる");
	await page.getByLabel("希望する役割").selectOption("designer");
	await page.getByLabel("年齢区分の自己申告（デモ設定）").selectOption("minor");
	await page.getByRole("button", { name: "登録してパスを発行" }).click();
	await expect(page.locator(".event-pass")).toContainText("DEMO-013");
	await expect(
		page.getByRole("button", { name: "LTチケットを取る" }),
	).toBeDisabled();
	await page.getByRole("button", { name: "参加者・受付" }).click();
	await page.getByLabel("チェックイントークン").fill("demo-013");
	await page.getByRole("button", { name: "受付する", exact: true }).click();
	const row = page.locator(".attendee-row").filter({ hasText: "デモのこはる" });
	await expect(
		row.getByRole("button", { name: "承認", exact: true }),
	).toBeDisabled();
	await row.getByRole("checkbox").check();
	await row.getByRole("button", { name: "承認", exact: true }).click();
	await expect(row).toContainText("承認済み");
	await page.getByRole("button", { name: "チーム編成", exact: true }).click();
	await page.getByRole("button", { name: "チームを再編成" }).click();
	await expect(page.locator(".team-grid")).toContainText("デモのこはる");
	await page.getByRole("button", { name: "参加者ビュー", exact: true }).click();
	await page
		.getByLabel("話したいこと")
		.fill("ブラウザだけで作る小さなアイデア");
	await page.getByRole("button", { name: "LTチケットを取る" }).click();
	await expect(page.locator(".my-ticket")).toContainText("#005");
	await page.reload();
	await page
		.getByLabel("体験する参加者")
		.selectOption({ label: "デモのこはる" });
	await expect(page.locator(".my-ticket")).toContainText("#005");
	await page.getByRole("button", { name: "LT・ステージ", exact: true }).click();
	await page.getByRole("button", { name: "LTを終了する", exact: true }).click();
	for (let i = 0; i < 3; i++) {
		await page
			.getByRole("button", { name: "次の人を呼び出す", exact: true })
			.first()
			.click();
		await page.getByRole("button", { name: "登壇を開始", exact: true }).click();
		await page
			.getByRole("button", { name: "LTを終了する", exact: true })
			.click();
	}
	await page
		.getByRole("button", { name: "次の人を呼び出す", exact: true })
		.first()
		.click();
	await page.getByRole("button", { name: "登壇を開始", exact: true }).click();
	await page.getByLabel("投影テンプレート").selectOption("lt");
	const display = await context.newPage();
	await display.goto("/display");
	await expect(
		display.getByRole("heading", { name: "ブラウザだけで作る小さなアイデア" }),
	).toBeVisible();
	await page.getByRole("button", { name: "拍手を送る" }).click();
	await expect(display.locator(".display-reactions")).toContainText("👏 1");
	await page
		.getByLabel("スクリーンに表示するメッセージ")
		.fill("🍕 ピザが到着しました！");
	await page
		.getByRole("button", { name: "お知らせを反映", exact: true })
		.click();
	await expect(display.locator(".display-announcement")).toContainText(
		"ピザが到着しました",
	);
	await page.getByLabel("投影テンプレート").selectOption("teams");
	await expect(display.locator(".display-teams")).toContainText("デモのこはる");
	await display.close();
	await expect(errors).toEqual([]);
});

test("invalid check-in, empty search, dialog Escape, hash history and reset", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "参加者を追加" }).click();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await page.getByRole("button", { name: "参加者・受付" }).click();
	await page.getByLabel("チェックイントークン").fill("INVALID");
	await page.getByRole("button", { name: "受付する", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText("見つかりません");
	await page.getByLabel("参加者を検索").fill("存在しないデモ名");
	await expect(
		page.getByRole("heading", { name: "該当する参加者がいません" }),
	).toBeVisible();
	await page.getByRole("button", { name: "条件をクリア" }).click();
	await expect(page.locator(".person-cell")).toHaveCount(12);
	await page.getByRole("button", { name: "チーム編成", exact: true }).click();
	await page.goBack();
	await expect(
		page.getByRole("heading", { name: "ようこそ、今日の仲間たち。" }),
	).toBeVisible();
	await page.getByRole("button", { name: "デモをリセット" }).click();
	await page.getByRole("button", { name: "戻る", exact: true }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await page.getByRole("button", { name: "デモをリセット" }).click();
	await page.getByRole("button", { name: "リセットする", exact: true }).click();
	await expect(page.getByRole("status")).toContainText("リセットしました");
});

test("screen sharing cancellation is honest and retryable", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
			value: () =>
				Promise.reject(new DOMException("cancelled", "NotAllowedError")),
			configurable: true,
		});
	});
	await page.goto("/#stage");
	await page
		.getByRole("button", { name: "画面共有を試す", exact: true })
		.click();
	await expect(page.locator(".share-status")).toContainText("キャンセル");
	await expect(
		page.getByRole("button", { name: "画面共有を試す", exact: true }),
	).toBeEnabled();
	await expect(page.locator(".share-video")).toHaveCount(0);
});

test("desktop and mobile screens render without horizontal document overflow", async ({
	page,
}) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "イベントのいまを、見渡そう。" }),
	).toBeVisible();
	await page.screenshot({
		path: "test-results/dashboard-desktop.png",
		fullPage: true,
	});
	await page.setViewportSize({ width: 390, height: 844 });
	for (const id of ["overview", "attendees", "teams", "stage", "participant"]) {
		await page.goto(`/#${id}`);
		await expect(page.locator(".nav-item.active")).toHaveCount(1);
		await expect
			.poll(() =>
				page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			)
			.toBe(true);
	}
	await page.goto("/");
	await page.screenshot({
		path: "test-results/dashboard-mobile.png",
		fullPage: true,
	});
	await page.goto("/display");
	await expect
		.poll(() =>
			page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		)
		.toBe(true);
});

test("malformed saved state resets safely instead of crashing", async ({
	page,
}) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			"event-management-prototype:v1",
			JSON.stringify({
				version: 1,
				state: {
					attendees: [null],
					tickets: [],
					teams: [],
					event: {},
					board: {},
				},
			}),
		);
	});
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/#participant");
	await expect(page.locator(".event-pass")).toBeVisible();
	await expect(page.getByLabel("体験する参加者").locator("option")).toHaveCount(
		12,
	);
	await expect(errors).toEqual([]);
});

test("screen-share tracks are stopped when a pending picker resolves after navigation", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const scope = window as typeof window & {
			resolveDemoCapture?: () => void;
			demoCapture?: MediaStream;
		};
		Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
			value: () =>
				new Promise<MediaStream>((resolve) => {
					const canvas = document.createElement("canvas");
					canvas.width = 16;
					canvas.height = 16;
					const stream = canvas.captureStream(1);
					scope.demoCapture = stream;
					scope.resolveDemoCapture = () => resolve(stream);
				}),
			configurable: true,
		});
	});
	await page.goto("/#stage");
	await page
		.getByRole("button", { name: "画面共有を試す", exact: true })
		.click();
	await page
		.getByRole("button", { name: "ダッシュボード", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "イベントのいまを、見渡そう。" }),
	).toBeVisible();
	await page.evaluate(() => {
		(
			window as typeof window & { resolveDemoCapture?: () => void }
		).resolveDemoCapture?.();
	});
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(
						window as typeof window & { demoCapture?: MediaStream }
					).demoCapture?.getVideoTracks()[0].readyState,
			),
		)
		.toBe("ended");
});
