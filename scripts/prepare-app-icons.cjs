const { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

const projectRoot = join(__dirname, "..");
const sourcePath = join(projectRoot, "src/renderer/src/assets/icons/icon-colorful.svg");
const buildRoot = join(projectRoot, "build");

function getIcoSizes(buffer) {
	if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return [];
	const count = buffer.readUInt16LE(4);
	if (count === 0 || buffer.length < 6 + count * 16) return [];
	const sizes = [];
	for (let index = 0; index < count; index += 1) {
		const entry = 6 + index * 16;
		const width = buffer[entry] || 256;
		const height = buffer[entry + 1] || 256;
		const length = buffer.readUInt32LE(entry + 8);
		const offset = buffer.readUInt32LE(entry + 12);
		if (width !== height || length === 0 || offset < 6 + count * 16 || offset + length > buffer.length) return [];
		sizes.push(width);
	}
	return sizes.sort((left, right) => left - right);
}

async function prepareAppIcons(force = false) {
	const source = await readFile(sourcePath);
	const targetSvg = join(buildRoot, "icon.svg");
	const targetIco = join(buildRoot, "icon.ico");
	if (!force) {
		try {
			const [previousSource, previousIco] = await Promise.all([readFile(targetSvg), readFile(targetIco)]);
			if (source.equals(previousSource) && [16, 32, 48, 256].every((size) => getIcoSizes(previousIco).includes(size))) {
				console.log("[prepare:icons] Desktop icons already match icon-colorful.svg.");
				return;
			}
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	await mkdir(buildRoot, { recursive: true });
	const temporaryRoot = await mkdtemp(join(buildRoot, ".app-icons-"));
	try {
		// 使用打包器自己的 SVG 转换器，保持渐变、透明度和安装包的渲染一致
		const { convertIcon } = require("app-builder-lib/out/util/iconConverter");
		const snapshotPath = join(temporaryRoot, "source.svg");
		await writeFile(snapshotPath, source);
		const result = await convertIcon({ sources: [snapshotPath], fallbackSources: [], roots: [projectRoot], format: "ico", outDir: temporaryRoot });
		const generatedPath = result.icons[0]?.file;
		if (result.isFallback || !generatedPath) throw new Error("The application SVG could not be converted to a Windows icon.");
		const sizes = getIcoSizes(await readFile(generatedPath));
		if (![16, 32, 48, 256].every((size) => sizes.includes(size))) throw new Error("The generated ICO is missing required Windows icon sizes.");
		await copyFile(generatedPath, targetIco);
		// 最后同步 SVG；中途失败时下次运行仍会重新生成，不把旧 ICO 误判为最新
		await copyFile(snapshotPath, targetSvg);
		console.log(`[prepare:icons] Updated build/icon.svg and build/icon.ico (${sizes.join(", ")} px).`);
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3 });
	}
}

module.exports = { getIcoSizes, prepareAppIcons };

if (require.main === module) {
	prepareAppIcons(process.argv.includes("--force")).catch((error) => {
		console.error("[prepare:icons]", error);
		process.exitCode = 1;
	});
}
