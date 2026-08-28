package com.daedalus.studio.remote;

import android.content.res.AssetManager;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.Arrays;

final class DevUiAssets {
	static final String DIRECTORY_NAME = "dev-ui";
	static final String COMPLETE_MARKER = ".complete";
	static final String DEVICE_MANIFEST_NAME = "dev-ui.manifest.json";
	static final String PACKAGED_BASELINE_NAME = "dev-ui.packaged-manifest.json";
	static final String PACKAGED_MANIFEST_NAME = "daedalus-sync-manifest.json";

	private DevUiAssets() {}

	static File findActiveRoot(boolean debugBuild, File filesDirectory) {
		if (!debugBuild) return null;
		File root = new File(filesDirectory, DIRECTORY_NAME);
		if (!new File(root, COMPLETE_MARKER).isFile()) return null;
		return root;
	}

	static boolean seedPackagedManifest(
		boolean debugBuild,
		AssetManager assets,
		File filesDirectory
	) {
		if (!debugBuild) return false;
		File target = new File(filesDirectory, DEVICE_MANIFEST_NAME);
		File packagedBaseline = new File(filesDirectory, PACKAGED_BASELINE_NAME);
		try (InputStream input = assets.open(PACKAGED_MANIFEST_NAME)) {
			byte[] packagedManifest = readAllBytes(input);
			boolean packagedUiChanged = !packagedBaseline.isFile()
				|| !Arrays.equals(Files.readAllBytes(packagedBaseline.toPath()), packagedManifest);
			if (packagedUiChanged) {
				deleteRecursively(new File(filesDirectory, DIRECTORY_NAME));
				writeAtomically(target, packagedManifest);
				writeAtomically(packagedBaseline, packagedManifest);
			} else if (!target.isFile()) {
				writeAtomically(target, packagedManifest);
			}
			return true;
		} catch (IOException error) {
			return false;
		}
	}

	private static byte[] readAllBytes(InputStream input) throws IOException {
		ByteArrayOutputStream output = new ByteArrayOutputStream();
		byte[] buffer = new byte[8192];
		int count;
		while ((count = input.read(buffer)) != -1) {
			if (count > 0) output.write(buffer, 0, count);
		}
		return output.toByteArray();
	}

	private static void writeAtomically(File target, byte[] content) throws IOException {
		File temporary = new File(target.getParentFile(), target.getName() + ".next");
		try (FileOutputStream output = new FileOutputStream(temporary)) {
			output.write(content);
			output.getFD().sync();
		}
		if (target.exists() && !target.delete()) throw new IOException("dev_ui_manifest_replace_failed");
		if (!temporary.renameTo(target)) throw new IOException("dev_ui_manifest_rename_failed");
	}

	private static void deleteRecursively(File target) {
		File[] children = target.listFiles();
		if (children != null) {
			for (File child : children) deleteRecursively(child);
		}
		target.delete();
	}
}
