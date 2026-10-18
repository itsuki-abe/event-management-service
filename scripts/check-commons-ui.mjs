import fs from "node:fs/promises";

const pages = await fetch("http://127.0.0.1:9228/json/list").then((r) =>
	r.json(),
);
const page =
	pages.find((p) => p.url === "about:blank") ||
	pages.find((p) => p.type === "page" && !p.url.startsWith("edge:"));
const socket = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];
socket.addEventListener("message", (ev) => {
	const m = JSON.parse(ev.data);
	if (m.id) {
		const p = pending.get(m.id);
		if (p) {
			pending.delete(m.id);
			m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
		}
	}
	if (m.method === "Runtime.exceptionThrown")
		errors.push(
			m.params.exceptionDetails.exception?.description ||
				m.params.exceptionDetails.text,
		);
});
await new Promise((resolve, reject) => {
	socket.addEventListener("open", resolve, { once: true });
	socket.addEventListener("error", reject, { once: true });
});
const send = (method, params = {}) =>
	new Promise((resolve, reject) => {
		const key = ++id;
		pending.set(key, { resolve, reject });
		socket.send(JSON.stringify({ id: key, method, params }));
	});
const evaluate = async (expression) => {
	const r = await send("Runtime.evaluate", {
		expression,
		returnByValue: true,
		awaitPromise: true,
	});
	if (r.exceptionDetails)
		throw Error(
			r.exceptionDetails.exception?.description || r.exceptionDetails.text,
		);
	return r.result.value;
};
const wait = async (expression) => {
	for (let i = 0; i < 80; i++) {
		try {
			if (await evaluate(expression)) return;
		} catch {}
		await new Promise((r) => setTimeout(r, 120));
	}
	throw Error(`Timed out: ${expression}`);
};
const checks = [];
await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
	width: 1360,
	height: 900,
	deviceScaleFactor: 1,
	mobile: false,
});
for (const [route, text] of [
	["/", "LTを楽しもう"],
	["/venue", "会場案内"],
	["/live", "拍手"],
	["/team", "チーム"],
	["/admin", "LT進行"],
	["/presenter", "発表者の手元"],
	["/screen", "LIGHTNING TALK"],
]) {
	await send("Page.navigate", { url: `http://127.0.0.1:3000${route}` });
	await wait(
		`document.querySelector(".commons-root")?.innerText.includes(${JSON.stringify(text)})`,
	);
	checks.push({ route, status: "rendered" });
}
await send("Emulation.setDeviceMetricsOverride", {
	width: 390,
	height: 844,
	deviceScaleFactor: 1,
	mobile: true,
});
await send("Page.navigate", { url: "http://127.0.0.1:3000/live" });
await wait('!!document.querySelector("[data-action=reaction]")');
await evaluate("document.fonts.ready.then(()=>true)");
checks.push({
	mobile: await evaluate(
		"({width:innerWidth,contentWidth:document.documentElement.scrollWidth})",
	),
});
const before = await evaluate(
	'Number(document.querySelector("[data-count=\\"0\\"]").textContent)',
);
await evaluate('document.querySelector("[data-action=reaction]").click()');
const after = await evaluate(
	'Number(document.querySelector("[data-count=\\"0\\"]").textContent)',
);
if (after !== before + 1) throw Error("Reaction did not update");
checks.push({ reaction: "passed" });
await evaluate(
	'document.querySelector("#comment-body").value="テストのコメントです";document.querySelector("#comment-body").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("[data-action=send-comment]").click()',
);
await wait('!!document.querySelector("#display-name")');
await evaluate(
	'document.querySelector("#display-name").value="テスト参加者";document.querySelector("[data-action=save-name]").click()',
);
await wait(
	'document.querySelector(".conversation")?.innerText.includes("テストのコメントです")',
);
checks.push({ comment: "passed" });
await fs.writeFile(
	"output/commons-mobile-verified.png",
	Buffer.from(
		(
			await send("Page.captureScreenshot", {
				format: "png",
				captureBeyondViewport: false,
			})
		).data,
		"base64",
	),
);
await evaluate(
	'document.querySelector(".bottom-nav [data-view=guide]").click()',
);
await wait(
	'location.pathname==="/venue"&&!!document.querySelector(".accordion")',
);
checks.push({ navigation: "passed" });
await send("Emulation.setDeviceMetricsOverride", {
	width: 1360,
	height: 900,
	deviceScaleFactor: 1,
	mobile: false,
});
await send("Page.navigate", { url: "http://127.0.0.1:3000/" });
await wait(
	'!!document.querySelector(".hero-image")&&document.querySelector(".hero-image").complete',
);
await evaluate("document.fonts.ready.then(()=>true)");
await fs.writeFile(
	"output/commons-desktop-verified.png",
	Buffer.from(
		(
			await send("Page.captureScreenshot", {
				format: "png",
				captureBeyondViewport: false,
			})
		).data,
		"base64",
	),
);
await fs.writeFile(
	"output/commons-browser-check.json",
	JSON.stringify({ checks, errors }, null, 2),
);
console.log(JSON.stringify({ checks, errors }));
socket.close();
if (errors.length) process.exitCode = 1;
