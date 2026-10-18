import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { expect as baseExpect, chromium } from "@playwright/test";
import { QRCodeSVG } from "qrcode.react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const expect = baseExpect.configure({ timeout: 15_000 });
const root = resolve(import.meta.dirname, "..");
let organizerKey = randomBytes(24).toString("hex");
try {
	const secrets = parseEnv(
		await readFile(join(root, "dist/server/.dev.vars"), "utf8"),
	);
	if (
		secrets.ORGANIZER_KEY &&
		secrets.ORGANIZER_KEY !== "replace-with-a-long-random-key"
	)
		organizerKey = secrets.ORGANIZER_KEY;
} catch (error) {
	if (error.code !== "ENOENT") throw error;
}
let browserExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
if (!browserExecutable && process.platform === "win32") {
	const edgePath =
		"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
	try {
		await access(edgePath);
		browserExecutable = edgePath;
	} catch {}
}
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
	await form.locator("select[name=speakerId]").selectOption({
		label: speaker,
	});
	await form.getByLabel("持ち時間", { exact: true }).fill(duration);
	await form.getByRole("button", { name: "追加", exact: true }).click();
	await expect(page.locator(".op-talk", { hasText: title })).toBeVisible();
}

const current = (page) =>
	page.getByRole("region", { name: "現在の発表", exact: true });
const time = (page) => current(page).getByText(/^[−]?\d{2,}:\d{2}$/);
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
			"--var",
			`ORGANIZER_KEY:${organizerKey}`,
		],
		{
			cwd: root,
			detached: process.platform !== "win32",
			windowsHide: true,
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
		...(browserExecutable ? { executablePath: browserExecutable } : {}),
	});
	const adminContext = await browser.newContext({ baseURL });
	const viewerContext = await browser.newContext({ baseURL });
	adminContext.setDefaultTimeout(15_000);
	viewerContext.setDefaultTimeout(15_000);
	const admin = await adminContext.newPage();
	const viewers = await Promise.all(
		["/live", "/screen", "/speaker"].map(async (path) => {
			const page = await viewerContext.newPage();
			page.on("pageerror", (error) => errors.push(error.message));
			await page.goto(path);
			await expect(page.locator(".lt-app .connection")).toHaveCount(0);
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
	await expect(menu).toBeVisible();
	await admin.goto("/screen");
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
	// Follow the LT tab into the shared screen, then react and comment without leaving.
	await viewers[0]
		.getByRole("navigation", { name: "LTライブの表示" })
		.getByRole("link", { name: "画面共有・リアクション", exact: true })
		.click();
	await expect(viewers[0]).toHaveURL(`${baseURL}/screen`);
	await viewers[0].goto("/live");
	const screen = viewers[1];
	const speaker = viewers[2];
	await speaker.addInitScript(() => {
		navigator.mediaDevices.getDisplayMedia = async () => {
			const canvas = document.createElement("canvas");
			canvas.width = 1280;
			canvas.height = 720;
			const context = canvas.getContext("2d");
			const paint = () => {
				context.fillStyle = "#204a88";
				context.fillRect(0, 0, 1280, 720);
				context.fillStyle = "white";
				context.font = "64px sans-serif";
				context.fillText("Screen sharing QA", 100, 360);
			};
			paint();
			setInterval(paint, 100);
			return canvas.captureStream(10);
		};
	});
	await speaker.reload();
	await speaker.getByRole("button", { name: "画面共有を準備する" }).click();
	const video = screen.getByLabel("発表者の画面", { exact: true });
	await expect(video).toBeVisible({ timeout: 30_000 });
	await expect
		.poll(() => video.evaluate((element) => element.videoWidth))
		.toBe(1280);
	await screen
		.getByRole("button", { name: "拍手を送る 0件", exact: true })
		.click();
	await expect(
		screen.getByRole("button", { name: "拍手を送る 1件", exact: true }),
	).toBeVisible();
	await screen
		.getByPlaceholder("感想や質問を書いてみよう")
		.fill("画面を見ながら質問します");
	await screen.getByRole("button", { name: "送信する", exact: true }).click();
	await screen.getByLabel("表示名", { exact: true }).fill("視聴者");
	await screen
		.getByRole("button", { name: "この名前で送信", exact: true })
		.click();
	await expect(
		screen.locator(".comment-text").getByText("画面を見ながら質問します"),
	).toBeVisible();
	for (const width of [1440, 390]) {
		await screen.setViewportSize({ width, height: 900 });
		await screen
			.getByPlaceholder("感想や質問を書いてみよう")
			.scrollIntoViewIfNeeded();
		await screen.getByPlaceholder("感想や質問を書いてみよう").focus();
		await expect(video).toBeInViewport({ ratio: 1 });
		assert.ok(
			await screen.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		);
		await screen.screenshot({
			path: join(root, `output/playwright/screen-${width}.png`),
			fullPage: false,
		});
	}
	await screen.setViewportSize({ width: 1280, height: 900 });
	await speaker
		.getByRole("button", { name: "共有を停止する", exact: true })
		.click();
	await expect(
		screen.getByText("画面共有が切断されました", { exact: true }),
	).toBeVisible();

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
	for (const page of [admin, ...viewers.slice(0, 2)])
		await status(page, "終了");
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

	await viewerContext.setOffline(true);
	await expect(
		viewers[0].getByText("再接続中… 最後に取得した情報を表示しています", {
			exact: true,
		}),
	).toBeVisible();
	await viewerContext.setOffline(false);
	for (const page of viewers)
		await expect(page.locator(".lt-app .connection")).toHaveCount(0);
	for (const page of viewers.slice(0, 1)) {
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
	const participantContext = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 844 },
	});
	const participant = await participantContext.newPage();
	participant.on("pageerror", (error) => errors.push(error.message));
	await participant.goto("/");
	await expect(
		participant.getByRole("heading", {
			name: "まずは、スマホで参加登録",
			exact: true,
		}),
	).toBeVisible();
	await expect(
		participant.getByRole("navigation", {
			name: "メインメニュー",
			exact: true,
		}),
	).toHaveCount(0);
	await expect(
		participant.getByRole("navigation", {
			name: "参加者メニュー",
			exact: true,
		}),
	).toHaveCount(0);
	await expect(
		participant.getByRole("img", {
			name: "スマホで参加登録ページを開くQRコード",
			exact: true,
		}),
	).toBeVisible();
	const enrollment = participant.getByRole("link", {
		name: "参加登録へ進む",
		exact: true,
	});
	const eventPath = await enrollment.getAttribute("href");
	assert.match(eventPath, /^\/events\/\d+$/);
	await participant.screenshot({
		path: join(root, "output/playwright/registration-home-mobile.png"),
		fullPage: true,
	});
	await enrollment.click();
	await participant.getByLabel(/^表示名/).fill("統合確認の参加者");
	await participant.getByLabel(/^Xのプロフィール/).fill("@merge_qa");
	await participant
		.getByRole("button", { name: "この名前で参加する →", exact: true })
		.click();
	const profileLink = participant.getByRole("link", {
		name: "統合確認の参加者さんのXプロフィール（新しいタブで開く）",
		exact: true,
	});
	await expect(profileLink).toHaveAttribute("href", "https://x.com/merge_qa");
	await participant.reload();
	await expect(profileLink).toBeVisible();
	await participant.goto("/");
	await expect(
		participant.getByRole("heading", { name: "LTを楽しもう", exact: true }),
	).toBeVisible();
	await expect(
		participant.getByRole("navigation", {
			name: "参加者メニュー",
			exact: true,
		}),
	).toBeVisible();
	await participant.screenshot({
		path: join(root, "output/playwright/registered-home-mobile.png"),
		fullPage: true,
	});
	await participant.goto(`${eventPath}/qr`);
	const qr = participant.locator(".venue-qr svg");
	await expect(qr.locator("title")).toHaveText("イベント参加用QRコード");
	await expect(
		participant.getByRole("link", { name: "参加ページを開く", exact: true }),
	).toHaveAttribute("href", `${baseURL}${eventPath}`);
	const expectedQr = renderToStaticMarkup(
		createElement(QRCodeSVG, {
			value: `${baseURL}${eventPath}`,
			size: 280,
			marginSize: 2,
			level: "M",
			title: "イベント参加用QRコード",
		}),
	);
	const expectedPaths = [...expectedQr.matchAll(/\sd="([^"]+)"/g)].map(
		(match) => match[1],
	);
	assert.equal(
		await qr.locator("path").last().getAttribute("d"),
		expectedPaths.at(-1),
		"The rendered QR must encode this event's enrollment URL.",
	);
	await participant.screenshot({
		path: join(root, "output/playwright/venue-qr-mobile.png"),
		fullPage: true,
	});
	assert.ok(
		await participant.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
		"Registration QR must fit the mobile viewport.",
	);
	assert.deepEqual(errors, [], "No unhandled browser errors are allowed.");
	console.info(
		"Browser QA passed: organizer access, comment management, first-run event and talks, shared-screen reactions/comments and mobile visibility, four-screen timer sync, reconnect, mobile layouts, registration/X profile, registered home and event enrollment QR.",
	);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
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
		if (process.platform === "win32")
			spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
				windowsHide: true,
				stdio: "ignore",
			});
		else {
			try {
				process.kill(-server.pid, "SIGTERM");
			} catch {}
		}
		await Promise.race([exited, delay(3000)]);
		if (server.exitCode === null && process.platform !== "win32") {
			try {
				process.kill(-server.pid, "SIGKILL");
			} catch {}
		}
	}
	assert.equal(dirname(resolve(persistence)), resolve(tmpdir()));
	assert.ok(basename(persistence).startsWith("lt-browser-"));
	await rm(persistence, {
		recursive: true,
		force: true,
		maxRetries: 10,
		retryDelay: 300,
	});
}
