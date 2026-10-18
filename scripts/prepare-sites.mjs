import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const destination = path.join(root, ".sites", "commons-review");
const hosting = JSON.parse(
	await readFile(path.join(root, ".openai/hosting.json"), "utf8"),
);
if (!hosting.project_id || hosting.d1 !== "DB" || hosting.static)
	throw new Error(
		"SitesのプロジェクトIDとDBバインディングを設定してください。",
	);
await mkdir(destination, { recursive: true });
// The source helper manages the Site's own Git repository. Keep the GitHub
// repository, local credentials, and local database outside this checkout.
for (const name of await readdir(destination)) {
	if (![".git", "node_modules", ".sites-runtime"].includes(name))
		await rm(path.join(destination, name), { recursive: true, force: true });
}
for (const name of [
	".gitignore",
	".dev.vars.example",
	".openai",
	"src",
	"build",
	"scripts",
	"package.json",
	"bun.lock",
	"README.md",
	"tsconfig.json",
	"tsr.config.json",
	"biome.json",
	"vite.config.ts",
	"wrangler.jsonc",
	"drizzle.config.ts",
	"worker-configuration.d.ts",
]) {
	await cp(path.join(root, name), path.join(destination, name), {
		recursive: true,
	});
}
// A separate, schema-only migration history belongs to this fresh Sites DB.
await cp(path.join(root, "sites/drizzle"), path.join(destination, "drizzle"), {
	recursive: true,
});
await writeFile(
	path.join(destination, ".gitignore"),
	(await readFile(path.join(destination, ".gitignore"), "utf8")) +
		"\n.sites-checkout/\n",
);
const sitePackage = JSON.parse(
	await readFile(path.join(destination, "package.json"), "utf8"),
);
delete sitePackage.scripts["sites:prepare"];
delete sitePackage.scripts["db:generate:sites"];
await writeFile(
	path.join(destination, "package.json"),
	`${JSON.stringify(sitePackage, null, "\t")}\n`,
);
console.info(`Sites用ソースを準備しました: ${destination}`);
