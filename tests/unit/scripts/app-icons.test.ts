import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { repoPath } from "../../helpers/repo-paths";

const require = createRequire(import.meta.url);
const { getIcoSizes } = require("../../../scripts/prepare-app-icons.cjs") as {
	getIcoSizes(buffer: Buffer): number[];
};

function makeIco(sizes: number[]): Buffer {
	const headerLength = 6 + sizes.length * 16;
	const buffer = Buffer.alloc(headerLength + sizes.length * 4);
	buffer.writeUInt16LE(1, 2);
	buffer.writeUInt16LE(sizes.length, 4);
	sizes.forEach((size, index) => {
		const entry = 6 + index * 16;
		buffer[entry] = size === 256 ? 0 : size;
		buffer[entry + 1] = buffer[entry];
		buffer.writeUInt32LE(4, entry + 8);
		buffer.writeUInt32LE(headerLength + index * 4, entry + 12);
	});
	return buffer;
}

describe("Studio application icons", () => {
	it("reads Windows multi-resolution icons including the 256px sentinel", () => {
		expect(getIcoSizes(makeIco([256, 48, 16, 32]))).toEqual([16, 32, 48, 256]);
	});

	it("rejects incomplete headers and invalid payload offsets", () => {
		expect(getIcoSizes(Buffer.from("svg"))).toEqual([]);
		expect(getIcoSizes(makeIco([32]).subarray(0, 10))).toEqual([]);
		const invalid = makeIco([32]);
		invalid.writeUInt32LE(0, 18);
		expect(getIcoSizes(invalid)).toEqual([]);
		invalid.writeUInt32LE(999, 18);
		expect(getIcoSizes(invalid)).toEqual([]);
	});

	it("rejects cursor files and non-square icon entries", () => {
		const cursor = makeIco([32]);
		cursor.writeUInt16LE(2, 2);
		expect(getIcoSizes(cursor)).toEqual([]);
		const rectangle = makeIco([32]);
		rectangle[7] = 16;
		expect(getIcoSizes(rectangle)).toEqual([]);
	});

	it("ships the current source SVG and required Windows icon resolutions", () => {
		const source = readFileSync(repoPath("src/renderer/src/assets/icons/icon-colorful.svg"));
		expect(readFileSync(repoPath("build/icon.svg")).equals(source), "Run npm run prepare:icons after editing the application SVG").toBe(true);
		const sizes = getIcoSizes(readFileSync(repoPath("build/icon.ico")));
		expect(sizes).toEqual(expect.arrayContaining([16, 32, 48, 256]));
	});
});
