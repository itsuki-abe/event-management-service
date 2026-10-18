import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect as baseExpect, chromium } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 20_000 });
const root = resolve(import.meta.dirname, "..");
const persistence = await mkdtemp(join(tmpdir(), "participants-browser-"));
const screenshots = join(root, ".wrangler", "participants-qa");
let server;
let browser;
let logs = "";

function wrangler(args) {
	const result = spawnSync(
		process.execPath,
		["node_modules/wrangler/bin/wrangler.js", ...args],
		{ cwd: root, encoding: "utf8", env: { ...process.env, CI: "true" } },
	);
	assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function register(page, baseURL, nickname, xUrl = "") {
	await page.goto(`${baseURL}/events/1`);
	await page.getByRole("textbox", { name: /表示名/ }).fill(nickname);
	await page
		.getByRole("textbox", { name: /自己紹介/ })
		.fill("ものづくりとデザインについて話したいです。");
	await page.getByRole("textbox", { name: /Xのプロフィール/ }).fill(xUrl);
	await page.getByRole("button", { name: "この名前で参加する →" }).click();
	await expect(
		page.getByText("参加登録が完了しました。", { exact: true }),
	).toBeVisible();
}

try {
	wrangler([
		"d1",
		"migrations",
		"apply",
		"DB",
		"--local",
		"--persist-to",
		persistence,
	]);
	wrangler([
		"d1",
		"execute",
		"DB",
		"--local",
		"--persist-to",
		persistence,
		"--file",
		"scripts/seed-local.sql",
	]);
	const probe = createServer();
	probe.listen(0, "127.0.0.1");
	await once(probe, "listening");
	const port = probe.address().port;
	await new Promise((done, reject) =>
		probe.close((error) => (error ? reject(error) : done())),
	);
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
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
			env: { ...process.env, CI: "true" },
		},
	);
	for (const stream of [server.stdout, server.stderr])
		stream.on("data", (chunk) => {
			logs = (logs + chunk).slice(-12000);
		});
	await expect
		.poll(
			async () => {
				try {
					return (await fetch(`${baseURL}/api/health`)).status;
				} catch {
					return 0;
				}
			},
			{ timeout: 30_000 },
		)
		.toBe(200);
	browser = await chromium
		.launch({ headless: true })
		.catch(() => chromium.launch({ headless: true, channel: "chrome" }));
	const desktop = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
	});
	const page = await desktop.newPage();
	const pageErrors = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));
	await register(page, baseURL, "あおい", "@commons_aoi");
	await page
		.getByRole("link", { name: "参加者一覧で、今日の仲間を見つける →" })
		.click();
	await expect(
		page.getByRole("heading", { name: "今日、ここにいる仲間。" }),
	).toBeVisible();
	await expect(page.locator(".wc-person-card")).toHaveCount(1);
	const xLink = page.getByRole("link", {
		name: "あおいさんのXプロフィール（新しいタブで開く）",
	});
	await expect(xLink).toHaveAttribute("href", "https://x.com/commons_aoi");
	await expect(xLink).toHaveAttribute("target", "_blank");
	await expect(xLink).toHaveAttribute("rel", "noopener noreferrer");
	assert.equal(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
		true,
	);

	const mobile = await browser.newContext({
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
	});
	const mobilePage = await mobile.newPage();
	mobilePage.on("pageerror", (error) => pageErrors.push(error.message));
	await register(mobilePage, baseURL, "そら");
	await expect(page.locator(".wc-person-card")).toHaveCount(2);
	await mobilePage
		.locator(".wc-bottom-nav")
		.getByRole("link", { name: "参加者", exact: true })
		.click();
	await expect(mobilePage.locator(".wc-person-card")).toHaveCount(2);
	await expect(
		mobilePage.getByText("Xは未登録", { exact: true }),
	).toBeVisible();
	const search = mobilePage.getByRole("searchbox", {
		name: "参加者を名前・自己紹介・Xで検索",
	});
	await search.fill("COMMONS_AOI");
	await expect(mobilePage.locator(".wc-person-card")).toHaveCount(1);
	await search.fill("見つからない検索");
	await expect(
		mobilePage.getByRole("heading", { name: "一致する参加者が見つかりません" }),
	).toBeVisible();
	await mobilePage.getByRole("button", { name: "検索をクリア" }).click();
	await expect(mobilePage.locator(".wc-person-card")).toHaveCount(2);
	await mkdir(screenshots, { recursive: true });
	await page.screenshot({
		path: join(screenshots, "desktop.png"),
		fullPage: true,
	});
	await mobilePage.screenshot({
		path: join(screenshots, "mobile.png"),
		fullPage: true,
	});
	for (const width of [390, 320]) {
		await mobilePage.setViewportSize({ width, height: 844 });
		assert.equal(
			await mobilePage.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
			true,
			`Horizontal overflow at ${width}px`,
		);
	}

	await page.getByRole("link", { name: "自分のプロフィールを編集" }).click();
	await page.getByRole("button", { name: "編集", exact: true }).click();
	await page
		.getByRole("textbox", { name: /Xのプロフィール/ })
		.fill("javascript:alert(1)");
	await page
		.getByRole("button", { name: "プロフィールを保存", exact: true })
		.click();
	await expect(page.getByRole("alert")).toContainText("XのプロフィールURL");
	await page.getByRole("textbox", { name: /Xのプロフィール/ }).fill("");
	await page
		.getByRole("button", { name: "プロフィールを保存", exact: true })
		.click();
	await expect(
		page.getByText("プロフィールを保存しました。", { exact: true }),
	).toBeVisible();
	await mobilePage.getByRole("button", { name: "更新", exact: true }).click();
	await expect(mobilePage.getByText("Xは未登録", { exact: true })).toHaveCount(
		2,
	);

	const guest = await browser.newContext();
	const guestPage = await guest.newPage();
	await guestPage.goto(`${baseURL}/events/1/participants`);
	await expect(guestPage.getByRole("alert")).toContainText(
		"先にスマホで参加登録",
	);
	await expect(guestPage.locator(".wc-person-card")).toHaveCount(0);
	assert.deepEqual(pageErrors, []);
	console.log(
		"PASS: registration, X links, auto-refresh, search, editing/deletion, guest access, desktop and mobile layouts.",
	);
	console.log(`Screenshots: ${screenshots}`);
} catch (error) {
	console.error(logs);
	throw error;
} finally {
	await browser?.close();
	if (server && server.exitCode === null) {
		if (process.platform === "win32")
			spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
				windowsHide: true,
			});
		else server.kill("SIGTERM");
		await delay(500);
	}
	assert.ok(
		resolve(persistence).startsWith(`${resolve(tmpdir())}${sep}`) &&
			basename(persistence).startsWith("participants-browser-"),
	);
	await rm(persistence, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 250,
	});
}
