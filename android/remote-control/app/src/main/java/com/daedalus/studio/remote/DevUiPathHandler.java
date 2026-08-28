package com.daedalus.studio.remote;

import android.content.Context;
import android.webkit.WebResourceResponse;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.IOException;

final class DevUiPathHandler implements WebViewAssetLoader.PathHandler {
	private final File root;
	private final String canonicalRootPrefix;
	private final WebViewAssetLoader.InternalStoragePathHandler synchronizedAssets;
	private final WebViewAssetLoader.AssetsPathHandler packagedAssets;

	DevUiPathHandler(Context context, File root) {
		this.root = root;
		try {
			canonicalRootPrefix = root.getCanonicalPath() + File.separator;
		} catch (IOException error) {
			throw new IllegalArgumentException("dev_ui_root_invalid", error);
		}
		synchronizedAssets = new WebViewAssetLoader.InternalStoragePathHandler(context, root);
		packagedAssets = new WebViewAssetLoader.AssetsPathHandler(context);
	}

	@Override
	public WebResourceResponse handle(String path) {
		try {
			File candidate = new File(root, path).getCanonicalFile();
			if (candidate.getPath().startsWith(canonicalRootPrefix) && candidate.isFile()) {
				return synchronizedAssets.handle(path);
			}
		} catch (IOException ignored) {
			// Packaged assets remain the safe fallback for malformed or absent overrides.
		}
		return packagedAssets.handle(path);
	}
}
