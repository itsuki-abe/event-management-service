import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { expect as baseExpect, chromium } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 15_000 });
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
const root = resolve(import.meta.dirname, "..");
const output = join(root, "output/usage-guide-qa");
const persistence = await mkdtemp(join(tmpdir(), "usage-guide-browser-"));
let organizerKey = randomBytes(24).toString("hex");
let browserExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
if (!browserExecutable && process.platform === "win32") {
	const edgePath =
		"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
	try {
		await access(edgePath);
		browserExecutable = edgePath;
	} catch {}
}
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
let server;
let browser;
let logs = "";
const errors = [];
const evidence = { viewports: [], keyboard: [], scenarios: [] };

async function freePort() {
	const probe = createServer();
	probe.listen(0, "127.0.0.1");
	await once(probe, "listening");
	const port = probe.address().port;
	await new Promise((done, reject) =>
		probe.close((error) => (error ? reject(error) : done())),
	);
	return port;
}

async function capture(page, name) {
	assert.ok(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
		`Horizontal overflow: ${name}`,
	);
	await page.evaluate(async () => {
		await Promise.race([
			document.fonts.ready,
			new Promise((done) => setTimeout(done, 2000)),
		]);
		if (document.activeElement instanceof HTMLElement)
			document.activeElement.blur();
		window.scrollTo({ top: 0, behavior: "instant" });
		await new Promise(requestAnimationFrame);
	});
	await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
	evidence.viewports.push({ name, ...page.viewportSize() });
}

async function guide(page, role) {
	await expect(
		page.getByRole("heading", { name: "使い方ガイド", level: 1, exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: `${role}の使い方`, exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: `${role}の使い方`, exact: true }),
	).toHaveAttribute("aria-pressed", "true");
}

async function screenSharingGuide(page, organizer) {
	const section = page.locator("#screen-sharing");
	await expect(
		section.getByRole("heading", {
			name: "画面共有のやり方",
			level: 2,
			exact: true,
		}),
	).toBeVisible();
	await expect(
		page
			.getByRole("navigation", { name: "使い方の目次", exact: true })
			.getByRole("link", { name: "画面共有のやり方", exact: true }),
	).toHaveAttribute("href", "#screen-sharing");
	for (const title of [
		"自分のPCで、見せる画面を準備する",
		"会場に映してから、タイマーを開始する",
		"見せる画面を変える・共有を終える",
	])
		await expect(
			section.getByRole("heading", { name: title, exact: true }),
		).toBeVisible();
	await expect(
		section
			.getByRole("list", { name: "画面共有の3段階", exact: true })
			.getByRole("listitem"),
	).toHaveCount(3);
	await expect(section.locator('a[href="/speaker"]')).toHaveAttribute(
		"target",
		"_blank",
	);
	await expect(section.locator('a[href="/speaker"]')).toHaveAttribute(
		"rel",
		"noopener noreferrer",
	);
	for (const href of ["/screen", "/admin"]) {
		const link = section.locator(`a[href="${href}"]`);
		if (organizer) await expect(link).toBeVisible();
		else await expect(link).toHaveCount(0);
	}
	await expect(section).toContainText(
		"共有を停止しても、タイマーは自動では止まりません。",
	);
	const troubles = section.getByRole("region", {
		name: "画面共有で困ったとき",
		exact: true,
	});
	await expect(troubles.locator("details")).toHaveCount(3);
	const disconnected = troubles
		.locator("details")
		.filter({ hasText: "「切断」と表示された・ページを再読み込みした" });
	const summary = disconnected.locator("summary");
	await summary.focus();
	await page.keyboard.press("Enter");
	await expect(disconnected).toHaveAttribute("open", "");
	await expect(disconnected.locator("p")).toContainText(
		"再読み込み前の共有は、自動では再開しません。",
	);
	await page.keyboard.press("Space");
	await expect(disconnected).not.toHaveAttribute("open", "");
	await expect(summary).toBeFocused();
	evidence.keyboard.push(
		`${organizer ? "Organizer" : "Participant"} screen sharing recovery FAQ supports Enter, Space and focus retention`,
	);
}

async function register(page, eventId, nickname, pairingCode) {
	await page.goto(
		`/events/${eventId}${pairingCode ? `#pair=${pairingCode}` : ""}`,
	);
	await page.getByRole("textbox", { name: /表示名/ }).fill(nickname);
	await page
		.getByRole("textbox", { name: /自己紹介/ })
		.fill("使い方ガイドのブラウザー検証です。");
	await page
		.getByRole("button", { name: "この名前で参加する →", exact: true })
		.click();
}

try {
	await mkdir(output, { recursive: true });
	const migrated = spawnSync(
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
			windowsHide: true,
			env: { ...process.env, CI: "true" },
		},
	);
	assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);
	const baseURL = `http://127.0.0.1:${await freePort()}`;
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
			new URL(baseURL).port,
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
					"Isolated QA server exited before readiness.",
				);
				try {
					return (
						await fetch(`${baseURL}/api/events`, {
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
	assert.deepEqual(
		await (await fetch(`${baseURL}/api/events`)).json(),
		[],
		"QA must use an isolated empty database.",
	);
	browser = await chromium.launch({
		headless: true,
		...(browserExecutable ? { executablePath: browserExecutable } : {}),
	});
	const adminContext = await browser.newContext({
		baseURL,
		viewport: { width: 1440, height: 1000 },
	});
	const viewerContext = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 844 },
	});
	const admin = await adminContext.newPage();
	const viewer = await viewerContext.newPage();
	for (const page of [admin, viewer])
		page.on("pageerror", (error) => errors.push(error.message));

	await viewer.goto("/help?role=organizer");
	await expect(
		viewer.getByRole("heading", { name: "使い方ガイド", exact: true }),
	).toBeVisible();
	await expect(
		viewer.getByRole("heading", {
			name: "運営用リンクから開いてください",
			exact: true,
		}),
	).toBeVisible();
	await expect(
		viewer.getByRole("heading", { name: "イベントを作成する", exact: true }),
	).toHaveCount(0);
	await capture(viewer, "permission-gate-mobile");
	evidence.scenarios.push(
		"Unauthenticated organizer guide cannot display organizer instructions",
	);

	const login = await adminContext.request.get(
		`/api/login?key=${encodeURIComponent(organizerKey)}`,
		{ maxRedirects: 0 },
	);
	assert.equal(login.status(), 303);
	assert.equal(login.headers().location, "/help?role=organizer");
	await admin.goto(login.headers().location);
	await guide(admin, "運営");
	await expect(
		admin
			.locator("article")
			.filter({
				has: admin.getByRole("heading", {
					name: "イベントを作成する",
					exact: true,
				}),
			})
			.getByRole("link", { name: "LT進行を開く", exact: true }),
	).toHaveAttribute("href", "/admin");
	await expect(
		admin.getByRole("heading", { name: "イベントを作成する", exact: true }),
	).toBeVisible();
	await capture(admin, "organizer-no-event-desktop");
	evidence.scenarios.push(
		"Organizer login redirects to help and empty database explains event creation",
	);

	async function createEvent(name) {
		const response = await adminContext.request.post("/api/lt", {
			headers: { origin: baseURL },
			data: { action: "createEvent", name },
		});
		assert.equal(response.status(), 200, await response.text());
		return (await response.json()).event.id;
	}
	const eventId = await createEvent(
		"使い方ガイド QA <img src=x onerror=alert(1)>",
	);
	assert.equal(eventId, 1);
	// The product creates a single initial event; add the second fixture directly
	// to this script's isolated database to verify event-scoped help links.
	const anotherId = 2;
	const additionalEvent = spawnSync(
		process.execPath,
		[
			"node_modules/wrangler/bin/wrangler.js",
			"d1",
			"execute",
			"DB",
			"--local",
			"--persist-to",
			persistence,
			"--command",
			"INSERT INTO events (id, name) VALUES (2, '別イベントの使い方ガイド'); INSERT INTO event_live_state (event_id) VALUES (2);",
		],
		{
			cwd: root,
			encoding: "utf8",
			windowsHide: true,
			env: { ...process.env, CI: "true" },
		},
	);
	assert.equal(
		additionalEvent.status,
		0,
		additionalEvent.stderr || additionalEvent.stdout,
	);
	await admin.goto(`/help?eventId=${eventId}&role=organizer`);
	await guide(admin, "運営");
	for (const [label, href] of [
		["会場案内を設定する", `/admin/guide?eventId=${eventId}`],
		["コメント管理を開く", `/admin/comments?eventId=${eventId}`],
		[/^参加用QRを開く\s*（新しいタブで開く）$/, `/events/${eventId}/qr`],
	])
		await expect(
			admin.getByRole("link", { name: label, exact: true }),
		).toHaveAttribute("href", href);
	await expect(admin.locator("img[src=x]")).toHaveCount(0);
	await admin
		.getByRole("button", { name: "参加者の使い方", exact: true })
		.click();
	await expect(
		admin.getByRole("heading", {
			name: "まずは参加登録をしましょう",
			exact: true,
		}),
	).toBeVisible();
	await expect(
		admin.getByRole("heading", { name: "参加者の使い方", exact: true }),
	).toHaveCount(0);
	await admin
		.getByRole("button", { name: "運営の使い方", exact: true })
		.click();
	await guide(admin, "運営");
	await screenSharingGuide(admin, true);
	await capture(admin, "organizer-desktop");
	for (const width of [390, 320]) {
		await admin.setViewportSize({ width, height: 844 });
		await capture(admin, `organizer-${width}`);
	}
	evidence.scenarios.push(
		"Authenticated role switching, organizer actions and mobile layout",
	);

	await register(viewer, eventId, "ガイド参加者");
	await expect(viewer).toHaveURL(
		new RegExp(`/help\\?eventId=${eventId}&role=participant&welcome=1$`),
	);
	await guide(viewer, "参加者");
	await screenSharingGuide(viewer, false);
	for (const [label, href] of [
		["プロフィールを開く", `/events/${eventId}`],
		["会場案内を開く", `/events/${eventId}/guide`],
		["参加者一覧を開く", `/events/${eventId}/participants`],
		["LTライブを開く", `/engagement?eventId=${eventId}`],
	])
		await expect(
			viewer.getByRole("link", { name: label, exact: true }),
		).toHaveAttribute("href", href);
	await expect(
		viewer
			.locator("header")
			.getByRole("link", { name: "使い方ガイド", exact: true }),
	).toHaveAttribute("href", new RegExp(`eventId=${eventId}`));
	await expect(
		viewer.locator("footer").getByRole("link", { name: /使い方/ }),
	).toHaveAttribute("href", new RegExp(`eventId=${eventId}`));

	const faq = viewer.locator("details").first();
	await expect(faq).toBeVisible();
	const summary = faq.locator("summary");
	await summary.focus();
	await viewer.keyboard.press("Enter");
	await expect(faq).toHaveAttribute("open", "");
	await viewer.keyboard.press("Enter");
	await expect(faq).not.toHaveAttribute("open", "");
	await expect(summary).toBeFocused();
	evidence.keyboard.push(
		"FAQ opens and closes with Enter while summary retains focus",
	);
	for (const width of [390, 320, 1440]) {
		await viewer.setViewportSize({
			width,
			height: width === 1440 ? 1000 : 844,
		});
		await capture(viewer, `participant-${width}`);
	}
	await viewer.reload();
	await guide(viewer, "参加者");
	await viewer
		.getByRole("link", { name: "プロフィールを開く", exact: true })
		.click();
	await expect(
		viewer.getByRole("heading", { name: "あなたのプロフィール", exact: true }),
	).toBeVisible();
	await viewer.reload();
	await expect(
		viewer.getByRole("heading", { name: "あなたのプロフィール", exact: true }),
	).toBeVisible();
	await expect(viewer).toHaveURL(`${baseURL}/events/${eventId}`);
	await viewer.getByRole("button", { name: "編集", exact: true }).click();
	await viewer.getByRole("textbox", { name: /表示名/ }).fill("変更後の参加者");
	await viewer
		.getByRole("button", { name: "プロフィールを保存", exact: true })
		.click();
	await expect(
		viewer.getByText("プロフィールを保存しました。", { exact: true }),
	).toBeVisible();
	await expect(viewer).toHaveURL(`${baseURL}/events/${eventId}`);
	evidence.scenarios.push(
		"New registration welcomes participant; reload and profile edit preserve current page",
	);

	await viewer.goto(`/help?eventId=${eventId}&role=organizer`);
	await expect(
		viewer.getByRole("heading", {
			name: "運営用リンクから開いてください",
			exact: true,
		}),
	).toBeVisible();
	await expect(
		viewer.getByRole("heading", {
			name: "会場案内を入力して公開する",
			exact: true,
		}),
	).toHaveCount(0);
	await viewer.goto(`/help?eventId=${anotherId}&role=participant`);
	await expect(
		viewer.getByRole("heading", {
			name: "まずは参加登録をしましょう",
			exact: true,
		}),
	).toBeVisible();
	await expect(
		viewer.getByRole("link", { name: "参加登録へ進む", exact: true }),
	).toHaveAttribute("href", `/events/${anotherId}`);
	await register(viewer, anotherId, "別イベントの参加者");
	await guide(viewer, "参加者");
	await expect(
		viewer.getByRole("link", { name: "プロフィールを開く", exact: true }),
	).toHaveAttribute("href", `/events/${anotherId}`);
	evidence.scenarios.push(
		"Participant cannot unlock organizer steps via URL; explicit event selection is preserved",
	);

	let failHelp = true;
	await viewer.route("**/api/help?**", async (route) => {
		if (failHelp)
			await route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({ error: "QA 接続エラー" }),
			});
		else await route.continue();
	});
	await viewer.goto(`/help?eventId=${eventId}&role=participant`);
	await expect(viewer.getByRole("alert")).toBeVisible();
	await capture(viewer, "load-error-retry");
	failHelp = false;
	await viewer
		.getByRole("button", { name: "もう一度確認する", exact: true })
		.click();
	await guide(viewer, "参加者");
	await expect(viewer.getByRole("alert")).toHaveCount(0);
	await viewer.unroute("**/api/help?**");
	evidence.scenarios.push(
		"Help API failure displays accessible alert and retry recovers",
	);

	const computerContext = await browser.newContext({ baseURL });
	const pairedContext = await browser.newContext({ baseURL });
	const pairing = await computerContext.request.post(
		`/api/events/${eventId}/pairing`,
		{ headers: { origin: baseURL }, data: {} },
	);
	assert.equal(pairing.status(), 201, await pairing.text());
	const pairedPage = await pairedContext.newPage();
	pairedPage.on("pageerror", (error) => errors.push(error.message));
	await register(
		pairedPage,
		eventId,
		"接続中の参加者",
		(await pairing.json()).code,
	);
	await expect(
		pairedPage.getByRole("heading", {
			name: "この端末を接続しますか？",
			exact: true,
		}),
	).toBeVisible();
	await expect(pairedPage).toHaveURL(`${baseURL}/events/${eventId}`);
	await pairedPage
		.getByRole("button", { name: "この端末を接続する", exact: true })
		.click();
	await expect(
		pairedPage.getByText(
			"端末を接続しました。PC／Macの画面も確認してください。",
			{ exact: true },
		),
	).toBeVisible();
	const computerSession = await computerContext.request.get(
		`/api/events/${eventId}/session`,
	);
	assert.equal(
		(await computerSession.json()).participant.nickname,
		"接続中の参加者",
	);
	evidence.scenarios.push(
		"Registration with pending QR pairing keeps connection confirmation and completes pairing",
	);
	assert.deepEqual(errors, [], "No unhandled browser errors are allowed.");
	await writeFile(
		join(output, "evidence.json"),
		JSON.stringify(evidence, null, 2),
	);
	console.info(
		"Usage guide browser QA passed: isolated D1, login/welcome routing, role permission, contextual actions, keyboard FAQ, responsive layouts, retry, profile edits and QR pairing.",
	);
	console.info(`Screenshots: ${output}`);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	if (browser)
		for (const [index, page] of browser
			.contexts()
			.flatMap((context) => context.pages())
			.entries())
			await page
				.screenshot({
					path: join(output, `failure-${index}.png`),
					fullPage: true,
				})
				.catch(() => {});
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
	assert.ok(basename(persistence).startsWith("usage-guide-browser-"));
	await rm(persistence, {
		recursive: true,
		force: true,
		maxRetries: 10,
		retryDelay: 300,
	});
}
