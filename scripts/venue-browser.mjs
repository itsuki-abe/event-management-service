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
// Edge can leave unused unicode-range faces pending. Bound font waiting explicitly.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
const root = resolve(import.meta.dirname, "..");
const output = join(root, "output/venue-qa");
const persistence = await mkdtemp(join(tmpdir(), "venue-browser-"));
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
const wifi = {
	ssid: "  Venue & Guest 日本語  ",
	password: "  p@ss & <word>\\\"'  ",
	note: "受付周辺で接続できます。",
};
const longText = `入口を入って右の通路をご利用ください。\n${"長い案内でも読みやすく表示します。".repeat(80)}\nhttps://example.com/venue?from=guide&event=1`;
const fixture = [
	{
		category: "notice",
		title: "受付からのお知らせ",
		content: "入館証を首から下げてお過ごしください。",
		isVisible: true,
	},
	{
		category: "wifi",
		title: "会場のWi-Fi",
		content: JSON.stringify(wifi),
		isVisible: true,
	},
	{
		category: "hashtag",
		title: "今日のハッシュタグ",
		content: "#つくる集会2026",
		isVisible: true,
	},
	{
		category: "toilet",
		title: "お手洗いの場所",
		content: longText,
		isVisible: true,
	},
	{
		category: "access",
		title: "会場へのアクセス",
		content: "駅の北口から徒歩5分です。",
		isVisible: true,
	},
	{
		category: "other",
		title: "非公開の運営メモ",
		content: "参加者に見せない情報",
		isVisible: false,
	},
	{
		category: "rules",
		title: "会場でのお願い",
		content: "撮影前に周囲の方へお声がけください。",
		isVisible: true,
	},
	{ category: "contact", title: "空欄の連絡先", content: "", isVisible: true },
];
const errors = [];
const evidence = { fonts: {}, controls: [], reducedMotion: null };
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

async function noOverflow(page) {
	assert.ok(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
		`Horizontal overflow: ${new URL(page.url()).pathname}`,
	);
}

async function capture(page, name) {
	await noOverflow(page);
	evidence.fonts[name] = await page.evaluate(async () => {
		await Promise.race([
			document.fonts.ready,
			new Promise((resolveFont) => setTimeout(resolveFont, 2000)),
		]);
		return {
			status: document.fonts.status,
			family: getComputedStyle(document.body).fontFamily,
			loadedFaces: [...document.fonts].filter(
				(face) => face.status === "loaded",
			).length,
			pendingFaces: [...document.fonts]
				.filter((face) => face.status === "loading")
				.map((face) => ({
					family: face.family,
					weight: face.weight,
					unicodeRange: face.unicodeRange,
				})),
		};
	});
	await page.evaluate(async () => {
		if (document.activeElement instanceof HTMLElement)
			document.activeElement.blur();
		window.scrollTo({ top: 0, behavior: "instant" });
		await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
	});
	await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
	if (
		["participant-mobile", "organizer-mobile", "participant-desktop"].includes(
			name,
		)
	)
		await page.screenshot({ path: join(output, `${name}-viewport.png`) });
}

try {
	await mkdir(output, { recursive: true });
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
			windowsHide: true,
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
					"Isolated test server exited before readiness.",
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
		"QA must start with its own empty database.",
	);
	browser = await chromium.launch({
		headless: true,
		...(browserExecutable ? { executablePath: browserExecutable } : {}),
	});
	const adminContext = await browser.newContext({
		baseURL,
		viewport: { width: 1440, height: 900 },
	});
	const viewerContext = await browser.newContext({
		baseURL,
		viewport: { width: 1440, height: 900 },
	});
	await viewerContext.addInitScript(() => {
		window.__venueCopies = [];
		window.__venueCopyDenied = false;
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: async (text) => {
					if (window.__venueCopyDenied)
						throw new DOMException("Denied", "NotAllowedError");
					window.__venueCopies.push(text);
				},
			},
		});
	});
	const admin = await adminContext.newPage();
	const viewer = await viewerContext.newPage();
	for (const page of [admin, viewer])
		page.on("pageerror", (error) => errors.push(error.message));
	await admin.goto(`/api/login?key=${encodeURIComponent(organizerKey)}`);
	const created = await adminContext.request.post("/api/lt", {
		headers: { origin: baseURL },
		data: { action: "createEvent", name: "会場案内のブラウザーQA" },
	});
	assert.equal(created.status(), 200);
	const eventId = (await created.json()).event.id;
	const guideURL = `/events/${eventId}/guide`;
	const managerURL = `/api/events/${eventId}/guide/manage`;
	const saveFixture = async (guides) => {
		const result = await adminContext.request.post(managerURL, {
			headers: { origin: baseURL },
			data: { guides },
		});
		assert.equal(result.status(), 200, await result.text());
	};

	await saveFixture(
		fixture.filter((guide) => !guide.isVisible || !guide.content),
	);
	await viewer.goto(`/admin/guide?eventId=${eventId}`);
	await expect(
		viewer.getByRole("heading", {
			name: "運営用リンクから開いてください",
			exact: true,
		}),
	).toBeVisible();
	await capture(viewer, "permission-gate");
	let releaseInitial;
	const initialGate = new Promise((resolveGate) => {
		releaseInitial = resolveGate;
	});
	await viewer.route(`**/api/events/${eventId}/guide`, async (route) => {
		await initialGate;
		await route.continue();
	});
	await viewer.goto(guideURL);
	await expect(
		viewer.getByRole("status").filter({ hasText: "会場案内を確認しています…" }),
	).toBeVisible();
	await capture(viewer, "loading-desktop");
	releaseInitial();
	await viewer.unrouteAll({ behavior: "wait" });
	await expect(
		viewer.getByRole("heading", { name: "会場案内は準備中です" }),
	).toBeVisible();
	await expect(
		viewer.getByText("非公開の運営メモ", { exact: true }),
	).toHaveCount(0);
	await capture(viewer, "empty-desktop");
	await saveFixture(fixture);
	await viewer.reload();
	await expect(
		viewer.getByRole("heading", { name: "会場のWi-Fi", exact: true }),
	).toBeVisible();
	await expect(
		viewer.getByText("非公開の運営メモ", { exact: true }),
	).toHaveCount(0);
	await expect(viewer.getByText("空欄の連絡先", { exact: true })).toHaveCount(
		0,
	);
	for (const [label, value] of [
		["ネットワーク名（SSID）", wifi.ssid],
		["パスワード", wifi.password],
		["ハッシュタグ", "#つくる集会2026"],
	]) {
		const copy = viewer.getByRole("button", {
			name: `${label}をコピー`,
			exact: true,
		});
		await copy.focus();
		await expect(copy).toBeFocused();
		const control = await copy.evaluate((button) => {
			const style = getComputedStyle(button);
			const bounds = button.getBoundingClientRect();
			return {
				name: button.getAttribute("aria-label"),
				outlineStyle: style.outlineStyle,
				outlineWidth: Number.parseFloat(style.outlineWidth),
				width: bounds.width,
				height: bounds.height,
			};
		});
		assert.notEqual(control.outlineStyle, "none");
		assert.ok(
			control.outlineWidth >= 2,
			"Keyboard focus must have a visible outline.",
		);
		assert.ok(
			control.width >= 44 && control.height >= 44,
			"Copy targets must be at least 44 by 44 CSS pixels.",
		);
		evidence.controls.push(control);
		await viewer.keyboard.press("Enter");
		await expect(
			viewer
				.getByRole("status")
				.filter({ hasText: `${label}をコピーしました。` }),
		).toBeVisible();
		assert.equal(
			await viewer.evaluate(() => window.__venueCopies.at(-1)),
			value,
			"Clipboard must preserve the exact saved value.",
		);
	}
	await capture(viewer, "participant-desktop");
	await viewer.emulateMedia({ reducedMotion: "reduce" });
	evidence.reducedMotion = await viewer
		.getByRole("button", { name: "パスワードをコピー", exact: true })
		.evaluate((button) => {
			const style = getComputedStyle(button);
			return {
				matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
				animationDuration: style.animationDuration,
				transitionDuration: style.transitionDuration,
			};
		});
	assert.equal(evidence.reducedMotion.matches, true);
	for (const duration of [
		evidence.reducedMotion.animationDuration,
		evidence.reducedMotion.transitionDuration,
	])
		assert.ok(
			duration.split(",").every((part) => Number.parseFloat(part) <= 0.01),
			"Reduced motion should suppress animations and transitions.",
		);
	await viewer.emulateMedia({ reducedMotion: "no-preference" });
	for (const title of ["会場でのお願い", "会場へのアクセス"]) {
		await viewer
			.getByRole("navigation", { name: "会場案内の項目", exact: true })
			.getByRole("button", { name: new RegExp(title) })
			.click();
		await expect(viewer.locator("#venue-detail-title")).toHaveText(title);
	}
	await saveFixture(
		fixture.map((guide) =>
			guide.category === "access"
				? { ...guide, content: "駅の北口から徒歩5分です。更新済み。" }
				: guide,
		),
	);
	await viewer.evaluate(() => window.dispatchEvent(new Event("focus")));
	await expect(viewer.locator("#venue-detail")).toContainText("更新済み。");
	await expect(viewer.locator("#venue-detail-title")).toHaveText(
		"会場へのアクセス",
	);
	await capture(viewer, "participant-access");
	await viewer.evaluate(() => {
		window.__venueCopyDenied = true;
	});
	await viewer
		.getByRole("button", { name: "パスワードをコピー", exact: true })
		.click();
	const manual = viewer.getByRole("textbox", {
		name: "パスワード（手動コピー用）",
		exact: true,
	});
	await expect(manual).toBeFocused();
	await expect(manual).toHaveValue(wifi.password);
	assert.deepEqual(
		await manual.evaluate((input) => [
			input.selectionStart,
			input.selectionEnd,
		]),
		[0, wifi.password.length],
	);
	await expect(
		viewer.getByRole("status").filter({ hasText: "コピーできませんでした。" }),
	).toBeVisible();
	await capture(viewer, "clipboard-fallback");
	await viewer.reload();
	await expect(
		viewer.getByRole("heading", { name: "会場のWi-Fi", exact: true }),
	).toBeVisible();

	await viewer.setViewportSize({ width: 390, height: 844 });
	const accordion = viewer
		.locator(".venue-accordion")
		.filter({ hasText: "お手洗いの場所" });
	const summary = accordion.locator("summary");
	await summary.focus();
	await viewer.keyboard.press("Enter");
	await expect(accordion).toHaveAttribute("open", "");
	await expect(
		accordion.getByRole("link", {
			name: "https://example.com/venue?from=guide&event=1",
		}),
	).toHaveAttribute("href", "https://example.com/venue?from=guide&event=1");
	await capture(viewer, "participant-mobile-expanded");
	await accordion.getByRole("button", { name: "閉じる", exact: true }).click();
	await expect(summary).toBeFocused();
	await expect(accordion).not.toHaveAttribute("open", "");
	await capture(viewer, "participant-mobile");

	let failGuide = true;
	await viewer.route(`**/api/events/${eventId}/guide`, async (route) => {
		if (failGuide)
			await route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({ error: "QA接続エラー" }),
			});
		else await route.continue();
	});
	await viewer.evaluate(() => window.dispatchEvent(new Event("focus")));
	await expect(viewer.getByRole("alert")).toContainText(
		"最新情報を確認できませんでした",
	);
	await expect(
		viewer.getByRole("heading", { name: "会場のWi-Fi", exact: true }),
	).toBeVisible();
	await capture(viewer, "stale-data-mobile");
	await viewer.reload();
	await expect(viewer.getByRole("alert")).toContainText(
		"会場案内を読み込めませんでした",
	);
	await capture(viewer, "retry-mobile");
	failGuide = false;
	await viewer.getByRole("button", { name: "再読み込み", exact: true }).click();
	await expect(
		viewer.getByRole("heading", { name: "会場のWi-Fi", exact: true }),
	).toBeVisible();
	await expect(viewer.getByRole("alert")).toHaveCount(0);
	await viewer.unroute(`**/api/events/${eventId}/guide`);

	await admin.goto(`/admin/guide?eventId=${eventId}`);
	await expect(
		admin.getByRole("heading", { name: "会場案内の設定", exact: true }),
	).toBeVisible();
	const management = admin.getByRole("navigation", {
		name: "運営メニュー",
		exact: true,
	});
	await expect(
		management.getByRole("link", { name: "会場案内の設定", exact: true }),
	).toHaveAttribute("aria-current", "page");
	await expect(
		management.getByRole("link", { name: "LT進行", exact: true }),
	).not.toHaveAttribute("aria-current", "page");
	await expect(
		management.getByRole("link", { name: "コメント管理", exact: true }),
	).toHaveAttribute("href", `/admin/comments?eventId=${eventId}`);
	await admin.getByRole("button", { name: /^Wi-Fi/ }).click();
	await expect(
		admin.getByLabel("ネットワーク名（SSID）", { exact: true }),
	).toHaveValue(wifi.ssid);
	await expect(admin.getByLabel("パスワード", { exact: true })).toHaveValue(
		wifi.password,
	);
	await admin
		.getByLabel("接続時の補足", { exact: true })
		.fill("運営で更新した接続案内です。");
	let failSave = true;
	await admin.route(`**/api/events/${eventId}/guide/manage`, async (route) => {
		if (route.request().method() === "POST" && failSave)
			await route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({ error: "QA保存エラー。再度お試しください。" }),
			});
		else await route.continue();
	});
	await admin.getByRole("button", { name: "変更を保存", exact: true }).click();
	await expect(admin.getByRole("alert")).toContainText("QA保存エラー");
	await expect(admin.getByLabel("接続時の補足", { exact: true })).toHaveValue(
		"運営で更新した接続案内です。",
	);
	failSave = false;
	await admin.getByRole("button", { name: "変更を保存", exact: true }).click();
	await expect(admin.locator("output")).toContainText(
		"会場案内を保存しました。",
	);
	await capture(admin, "organizer-desktop");
	const previewWait = admin.waitForEvent("popup");
	await admin
		.getByRole("link", { name: "参加者画面を開く", exact: true })
		.click();
	const preview = await previewWait;
	preview.on("pageerror", (error) => errors.push(error.message));
	await expect(
		preview.getByText("運営で更新した接続案内です。", { exact: true }),
	).toBeVisible();
	await admin.reload();
	await admin.getByRole("button", { name: /^Wi-Fi/ }).click();
	await expect(admin.getByLabel("パスワード", { exact: true })).toHaveValue(
		wifi.password,
	);
	for (const width of [360, 390]) {
		await admin.setViewportSize({ width, height: 844 });
		await noOverflow(admin);
		for (const name of ["LT進行", "コメント管理", "会場案内の設定"]) {
			const link = management.getByRole("link", { name, exact: true });
			await expect(link).toBeVisible();
			const bounds = await link.boundingBox();
			assert.ok(
				bounds && bounds.x >= 0 && bounds.x + bounds.width <= width,
				`Management tab ${name} must fit at ${width}px.`,
			);
		}
	}
	await capture(admin, "organizer-mobile");
	await writeFile(
		join(output, "evidence.json"),
		JSON.stringify(evidence, null, 2),
	);
	assert.deepEqual(errors, [], "No unhandled browser errors are allowed.");
	console.info(
		"Venue browser QA passed: isolated D1, hidden/empty states, exact clipboard, denial fallback/focus, responsive layouts, keyboard accordion, retry, organizer save failure/recovery and preview.",
	);
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
	assert.ok(basename(persistence).startsWith("venue-browser-"));
	await rm(persistence, {
		recursive: true,
		force: true,
		maxRetries: 10,
		retryDelay: 300,
	});
}
