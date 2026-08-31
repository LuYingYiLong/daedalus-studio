const fs = require("node:fs");
const path = require("node:path");
const { crc32 } = require("node:zlib");

// 仅打包构建目录中的常规资源。使用标准无压缩 ZIP，避免新增构建依赖。
module.exports = function zipExtension(directory, destination) {
	const files = [];
	function visit(relative) {
		for (const entry of fs.readdirSync(path.join(directory, relative), {
			withFileTypes: true,
		})) {
			const name = path.posix.join(relative, entry.name);
			if (entry.isDirectory()) visit(name);
			else if (entry.isFile()) files.push(name);
			else throw new Error("Extension package contains a non-regular file");
		}
	}
	visit("");
	const local = [],
		central = [];
	let offset = 0;
	for (const name of files.sort()) {
		const data = fs.readFileSync(path.join(directory, name)),
			filename = Buffer.from(name);
		const checksum = crc32(data),
			header = Buffer.alloc(30),
			index = Buffer.alloc(46);
		header.writeUInt32LE(0x04034b50);
		header.writeUInt16LE(20, 4);
		header.writeUInt16LE(0x800, 6);
		header.writeUInt16LE(33, 12);
		header.writeUInt32LE(checksum, 14);
		header.writeUInt32LE(data.length, 18);
		header.writeUInt32LE(data.length, 22);
		header.writeUInt16LE(filename.length, 26);
		index.writeUInt32LE(0x02014b50);
		index.writeUInt16LE(20, 4);
		index.writeUInt16LE(20, 6);
		index.writeUInt16LE(0x800, 8);
		index.writeUInt16LE(33, 14);
		index.writeUInt32LE(checksum, 16);
		index.writeUInt32LE(data.length, 20);
		index.writeUInt32LE(data.length, 24);
		index.writeUInt16LE(filename.length, 28);
		index.writeUInt32LE(offset, 42);
		local.push(header, filename, data);
		central.push(index, filename);
		offset += header.length + filename.length + data.length;
	}
	const directoryBytes = Buffer.concat(central),
		end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(directoryBytes.length, 12);
	end.writeUInt32LE(offset, 16);
	fs.writeFileSync(destination, Buffer.concat([...local, directoryBytes, end]));
};
