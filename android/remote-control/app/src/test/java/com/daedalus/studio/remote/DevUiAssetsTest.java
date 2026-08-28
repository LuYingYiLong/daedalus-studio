package com.daedalus.studio.remote;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.IOException;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public final class DevUiAssetsTest {
	@Rule
	public final TemporaryFolder temporaryFolder = new TemporaryFolder();

	@Test
	public void ignoresSyncedAssetsInReleaseBuilds() throws IOException {
		File filesDirectory = createCompleteDevUi();
		assertNull(DevUiAssets.findActiveRoot(false, filesDirectory));
	}

	@Test
	public void requiresCompletionMarker() throws IOException {
		File filesDirectory = temporaryFolder.newFolder("files");
		File root = new File(filesDirectory, DevUiAssets.DIRECTORY_NAME);
		if (!root.mkdirs()) throw new IOException("dev_ui_directory_unavailable");

		assertNull(DevUiAssets.findActiveRoot(true, filesDirectory));
		new File(root, DevUiAssets.COMPLETE_MARKER).createNewFile();
		assertEquals(root, DevUiAssets.findActiveRoot(true, filesDirectory));
	}

	private File createCompleteDevUi() throws IOException {
		File filesDirectory = temporaryFolder.newFolder("files");
		File root = new File(filesDirectory, DevUiAssets.DIRECTORY_NAME);
		if (!root.mkdirs()) throw new IOException("dev_ui_directory_unavailable");
		new File(root, DevUiAssets.COMPLETE_MARKER).createNewFile();
		return filesDirectory;
	}
}
