import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { expect as baseExpect, chromium } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 15_000 });
const root = resolve(import.meta.dirname, "..");
const secrets = parseEnv(
	await readFile(join(root, "dist/server/.dev.vars"), "utf8"),
);
const organizerKey = secrets.ORGANIZER_KEY;
assert.ok(organizerKey, "The built local app must have an ORGANIZER_KEY.");
const persistence = await mkdtemp(join(tmpdir(), "lt-browser-"));
const errors = [];
let server;
let browser;
let logs = "";

async function freePort() {
	const probe = createServer();
	probe.listen(0, "127.0.0.1");
	await once(probe, "listening");
	const port = probe.address().port;
	await new Promise((resolveClose, reject) =>
		probe.close((error) => (error ? reject(error) : resolveClose())),
	);
	return port;
}

async function addTalk(page, title, speaker, duration) {
	const form = page.locator(".add");
	if (!(await form.evaluate((details) => details.open)))
		await form.locator("summary").click();
	await form.getByLabel("タイトル", { exact: true }).fill(title);
	await form.getByLabel("発表者", { exact: true }).selectOption({
		label: speaker,
	});
	await form.getByLabel("持ち時間", { exact: true }).fill(duration);
	await form.getByRole("button", { name: "追加", exact: true }).click();
	await expect(page.locator(".op-talk", { hasText: title })).toBeVisible();
}

const current = (page) =>
	page.getByRole("region", { name: "現在の発表", exact: true });
const time = (page) => current(page).getByText(/^[−]?\d{2,}:\d{2}$/);
const playing = (video) =>
	expect
		.poll(() => video.evaluate((element) => element.videoWidth), {
			timeout: 30_000,
		})
		.toBeGreaterThan(0);
const status = (page, text) =>
	expect(current(page).getByText(text, { exact: true }).first()).toBeVisible();

try {
	const migration = spawnSync(
		process.execPath,
		[
			"node_modules/wrangler/bin/wrangler.js",
			"d1",
			"migrations",
			"apply",
			"DB",
			"--local",
			"--persist-to",
			persistence,
		],
		{
			cwd: root,
			encoding: "utf8",
			env: { ...process.env, CI: "true" },
		},
	);
	assert.equal(migration.status, 0, migration.stderr || migration.stdout);
	const port = await freePort();
	const baseURL = `http://127.0.0.1:${port}`;
	server = spawn(
		process.execPath,
		[
			"node_modules/wrangler/bin/wrangler.js",
			"dev",
			"--config",
			"dist/server/wrangler.json",
			"--ip",
			"127.0.0.1",
			"--port",
			String(port),
			"--persist-to",
			persistence,
		],
		{
			cwd: root,
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, CI: "true" },
		},
	);
	for (const stream of [server.stdout, server.stderr])
		stream.on("data", (chunk) => {
			logs = (logs + chunk).slice(-16_000);
		});
	await expect
		.poll(
			async () => {
				assert.equal(
					server.exitCode,
					null,
					"Local test server exited before readiness.",
				);
				try {
					return (
						await fetch(`${baseURL}/api/lt`, {
							signal: AbortSignal.timeout(1500),
						})
					).status;
				} catch {
					return 0;
				}
			},
			{ timeout: 60_000, intervals: [200, 500] },
		)
		.toBe(200);
	assert.equal(
		(await (await fetch(`${baseURL}/api/lt`)).json()).event,
		null,
		"Browser QA requires an isolated empty database.",
	);
	browser = await chromium.launch({
		headless: true,
		...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
			? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
			: {}),
	});
	const adminContext = await browser.newContext({ baseURL });
	const viewerContext = await browser.newContext({ baseURL });
	const admin = await adminContext.newPage();
	const viewers = await Promise.all(
		["/live", "/screen", "/speaker"].map(async (path) => {
			const page = await viewerContext.newPage();
			page.on("pageerror", (error) => errors.push(error.message));
			// Stands in for the browser's screen picker.
			await page.addInitScript(() => {
				navigator.mediaDevices.getDisplayMedia = async () => {
					const canvas = Object.assign(document.createElement("canvas"), {
						width: 640,
						height: 360,
					});
					const context = canvas.getContext("2d");
					setInterval(() => {
						context.fillStyle = `hsl(${Date.now() % 360} 70% 50%)`;
						context.fillRect(0, 0, 640, 360);
					}, 100);
					return canvas.captureStream(10);
				};
			});
			await page.goto(path);
			await expect(page.locator(".connection")).toHaveCount(0);
			return page;
		}),
	);
	admin.on("pageerror", (error) => errors.push(error.message));
	admin.on("dialog", (dialog) => dialog.accept());
	const gate = admin.getByRole("heading", {
		name: "運営用リンクから開いてください",
	});
	await admin.goto("/live");
	const menu = admin.getByRole("navigation", {
		name: "メインメニュー",
		exact: true,
	});
	await expect(
		menu.getByRole("link", { name: "LTライブ", exact: true }),
	).toBeVisible();
	await menu.getByRole("link", { name: "コメント管理", exact: true }).click();
	await expect(gate).toBeVisible();
	assert.equal(
		(
			await viewerContext.request.get("/api/engagement?eventId=1&admin=1")
		).status(),
		403,
	);
	await admin.goto("/admin");
	await expect(gate).toBeVisible();
	await admin.goto("/api/login?key=incorrect-organizer-key");
	await expect(gate).toBeVisible();
	await expect(admin.getByLabel("イベント名", { exact: true })).toHaveCount(0);
	await admin.goto(`/api/login?key=${encodeURIComponent(organizerKey)}`);
	await admin
		.getByLabel("イベント名", { exact: true })
		.fill("ブラウザーQAイベント");
	await admin.getByRole("button", { name: "作成", exact: true }).click();
	await expect(admin.getByLabel("イベント名", { exact: true })).toHaveCount(0);
	const otherContext = await browser.newContext({ baseURL });
	for (const [context, nickname] of [
		[viewerContext, "発表者A"],
		[otherContext, "発表者B"],
	]) {
		const response = await context.request.post("/api/events/1/register", {
			data: { nickname },
			headers: { Origin: baseURL },
		});
		assert.equal(response.status(), 201, await response.text());
	}
	await viewers[2].reload();
	await expect(
		viewers[2].getByRole("heading", { name: "あなたの発表はまだありません" }),
	).toBeVisible();
	await addTalk(admin, "自動化の第一歩", "発表者A", "5");
	await addTalk(admin, "1秒の発表", "発表者A", "0:01");
	await admin
		.getByRole("navigation", { name: "運営メニュー" })
		.getByRole("link", { name: "コメント管理" })
		.click();
	await expect(
		admin.getByRole("heading", { name: "運営管理", exact: true }),
	).toBeVisible();
	const acceptance = admin.getByRole("switch", {
		name: "コメント受付",
	});
	await expect(acceptance).toBeVisible();
	await acceptance.click();
	await expect(acceptance).not.toBeChecked();
	await admin.reload();
	await expect(acceptance).not.toBeChecked();
	await acceptance.click();
	await expect(acceptance).toBeChecked();
	for (const width of [390, 900, 1440]) {
		await admin.setViewportSize({ width, height: 900 });
		await expect(
			menu.getByRole("link", { name: "LTライブ", exact: true }),
		).toBeVisible();
		await expect(
			menu.getByRole("link", { name: "コメント管理", exact: true }),
		).toBeVisible();
		const managementTab = await menu
			.getByRole("link", { name: "コメント管理", exact: true })
			.boundingBox();
		assert.ok(
			managementTab &&
				managementTab.x >= 0 &&
				managementTab.x + managementTab.width <= width,
			"The comment management tab must be visible without scrolling.",
		);
		assert.ok(
			await admin.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
			`Comments overflow at ${width}px`,
		);
		await mkdir(join(root, "output/playwright"), { recursive: true });
		await admin.screenshot({
			path: join(root, `output/playwright/comments-${width}.png`),
			fullPage: true,
		});
	}
	await admin.setViewportSize({ width: 1280, height: 900 });
	await admin
		.getByRole("navigation", { name: "運営メニュー" })
		.getByRole("link", { name: "LT進行" })
		.click();
	await expect(admin.getByLabel("イベント名", { exact: true })).toHaveCount(0);
	await addTalk(admin, "削除する発表", "発表者B", "3:30");
	await admin
		.getByRole("button", { name: "「削除する発表」を削除", exact: true })
		.click();
	await expect(admin.getByRole("button", { name: /削除する発表/ })).toHaveCount(
		0,
	);
	for (const page of [admin, ...viewers]) {
		await expect(
			current(page).getByRole("heading", {
				name: "自動化の第一歩",
				exact: true,
			}),
		).toBeVisible();
		await expect(time(page)).toHaveText("05:00");
	}
	await admin
		.getByRole("button", { name: "タイマー開始", exact: true })
		.click();
	for (const page of viewers) await status(page, "発表中");
	await expect(time(admin)).not.toHaveText("05:00");
	await admin.getByRole("button", { name: "一時停止", exact: true }).click();
	for (const page of [admin, ...viewers]) await status(page, "一時停止中");
	const pausedTime = await time(admin).textContent();
	await admin.reload();
	await status(admin, "一時停止中");
	await delay(1700);
	for (const page of [admin, ...viewers])
		await expect(time(page)).toHaveText(pausedTime);
	await admin.getByRole("button", { name: "再開", exact: true }).click();
	await expect(time(admin)).not.toHaveText(pausedTime);
	await admin.getByRole("button", { name: "発表を終了", exact: true }).click();
	for (const page of [admin, ...viewers]) await status(page, "終了");
	await admin.getByRole("button", { name: "次の発表へ", exact: true }).click();
	for (const page of [admin, ...viewers]) {
		await expect(
			current(page).getByRole("heading", { name: "1秒の発表", exact: true }),
		).toBeVisible();
		await status(page, "開始待ち");
		await expect(time(page)).toHaveText("00:01");
	}
	await viewers[0].reload();
	await expect(time(viewers[0])).toHaveText("00:01");
	await admin
		.getByRole("button", { name: "タイマー開始", exact: true })
		.click();
	for (const page of [admin, ...viewers]) await status(page, "時間超過");
	await admin.getByRole("button", { name: "発表を終了", exact: true }).click();

	const [, screen, speaker] = viewers;
	const source = admin.getByRole("complementary", { name: "発表者の共有" });
	const sharePanel = speaker.getByRole("region", { name: "画面共有" });
	await expect(source).toContainText("次の発表はありません。");
	await addTalk(admin, "画面共有の発表", "発表者A", "5");
	await expect(source).toContainText("発表者の共有を待っています");
	await sharePanel
		.getByRole("button", { name: "画面共有を準備する", exact: true })
		.click();
	await expect(
		sharePanel.getByText("共有準備完了", { exact: true }),
	).toBeVisible();
	await expect(
		speaker.getByRole("heading", { name: "画面共有の発表", exact: true }),
	).toBeVisible();
	await expect(source).toContainText("次の発表者の準備");
	await expect(source.getByText("共有準備完了", { exact: true })).toBeVisible();
	await playing(source.locator("video"));
	await source
		.getByRole("button", { name: "この共有を投影する", exact: true })
		.click();
	await expect(
		source.getByRole("button", { name: "投影先を確認済み", exact: true }),
	).toBeDisabled();
	await expect(sharePanel.getByText("投影中", { exact: true })).toBeVisible();
	await playing(screen.locator(".projection-slide video"));
	await admin.getByRole("button", { name: "次の発表へ", exact: true }).click();
	await expect(source).toContainText("選択中の共有");
	await expect(source.getByText("投影中", { exact: true })).toBeVisible();
	await admin
		.getByRole("button", { name: "タイマー開始", exact: true })
		.click();
	await status(screen, "発表中");
	await sharePanel
		.getByRole("button", { name: "共有を停止する", exact: true })
		.click();
	await expect(sharePanel.getByText("共有が切断されました")).toBeVisible();
	await expect(
		screen.getByRole("heading", { name: "画面共有が切断されました" }),
	).toBeVisible();
	await status(admin, "発表中");
	await sharePanel
		.getByRole("button", { name: "画面共有を準備する", exact: true })
		.click();
	await playing(screen.locator(".projection-slide video"));
	await expect(sharePanel.getByText("投影中", { exact: true })).toBeVisible();
	await speaker.reload();
	await expect(
		screen.getByRole("heading", { name: "画面共有が切断されました" }),
	).toBeVisible();
	await expect(
		speaker
			.getByRole("region", { name: "画面共有" })
			.getByText("共有が切断されました"),
	).toBeVisible();
	await admin.getByRole("button", { name: "発表を終了", exact: true }).click();
	await expect(
		screen.getByRole("heading", { name: "画面共有が切断されました" }),
	).toHaveCount(0);

	await viewerContext.setOffline(true);
	await expect(
		viewers[0].getByText("再接続中… 最後に取得した情報を表示しています", {
			exact: true,
		}),
	).toBeVisible();
	await viewerContext.setOffline(false);
	for (const page of viewers)
		await expect(page.locator(".connection")).toHaveCount(0);
	for (const page of [viewers[0], screen]) {
		await expect(page.getByRole("button")).toHaveCount(0);
	}
	for (const page of [admin, ...viewers]) {
		await page.setViewportSize({ width: 390, height: 844 });
		assert.ok(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
			`Horizontal overflow on ${new URL(page.url()).pathname}.`,
		);
	}
	assert.deepEqual(errors, [], "No unhandled browser errors are allowed.");
	console.info(
		"Browser QA passed: organizer link, first-run event and talks, delete, four-screen timer sync, pause/resume/reload, next/overtime, screen share preview/projection/disconnect, reconnect, and mobile layout.",
	);
} catch (error) {
	if (browser) {
		const page = browser
			.contexts()
			.flatMap((context) => context.pages())
			.find((page) => page.url().endsWith("/admin"));
		await page
			?.screenshot({
				path: join(root, "lt-browser-failure.local.png"),
				fullPage: true,
			})
			.catch(() => {});
	}
	if (logs) console.error(logs.replaceAll(organizerKey, "[redacted]"));
	throw error;
} finally {
	await browser?.close();
	if (server && server.exitCode === null) {
		const exited = once(server, "exit");
		try {
			process.kill(-server.pid, "SIGTERM");
		} catch {}
		await Promise.race([exited, delay(3000)]);
		if (server.exitCode === null) {
			try {
				process.kill(-server.pid, "SIGKILL");
			} catch {}
		}
	}
	await rm(persistence, { recursive: true, force: true });
}
