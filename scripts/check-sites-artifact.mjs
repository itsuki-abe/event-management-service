import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const hosting = JSON.parse(await readFile("dist/.openai/hosting.json", "utf8"));
assert.ok(hosting.project_id);
assert.equal(hosting.d1, "DB");
for (const name of [
	"dist/server/index.js",
	"dist/client/.assetsignore",
	"dist/.openai/drizzle/meta/_journal.json",
])
	await readFile(name);
async function inspect(directory) {
	for (const item of await readdir(directory, { withFileTypes: true })) {
		assert.ok(
			!/^(\.dev\.vars.*|\.env.*|\.wrangler|\.git)$/.test(item.name),
			`ローカル専用データが含まれています: ${item.name}`,
		);
		assert.ok(
			!/\.sqlite(?:-wal|-shm)?$/.test(item.name),
			"ローカルDBは公開物に含められません。",
		);
		if (item.isDirectory()) await inspect(path.join(directory, item.name));
	}
}
await inspect("dist");
console.info(
	"Sitesの公開物: Worker・静的ファイル・DB定義を確認。ローカル秘密値・DBの混入なし。",
);
