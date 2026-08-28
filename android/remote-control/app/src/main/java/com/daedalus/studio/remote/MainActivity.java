package com.daedalus.studio.remote;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public final class MainActivity extends Activity {
	private static final String BRIDGE_NAME = "DaedalusNative";
	private static final String LOCAL_AUTHORITY = "appassets.androidplatform.net";
	private static final String LOCAL_ORIGIN = "https://" + LOCAL_AUTHORITY;
	private static final String LOCAL_CONNECT_URL = LOCAL_ORIGIN + "/__app__/connect.html";
	private static final String REMOTE_COOKIE_NAME = "__Host-daedalus_remote";
	private static final int MAX_BRIDGE_MESSAGE_BYTES = 16 * 1024;
	private static final int SCAN_REQUEST = 312;

	private WebView webView;
	private ProgressBar progress;
	private WebViewAssetLoader assetLoader;
	private ProfileStore profileStore;
	private CredentialVault credentialVault;
	private PairingLink currentLink;
	private ConnectionProfile currentProfile;
	private String currentBridgeOrigin = LOCAL_ORIGIN;
	private String startupError = "";
	private String pendingInstallUrl = "";
	private PendingReply pendingScanReply;
	private boolean bridgeRegistered;
	private boolean autoConnectAllowed = true;
	private OnBackInvokedCallback backCallback;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_main);
		webView = findViewById(R.id.web_view);
		progress = findViewById(R.id.progress);
		profileStore = new ProfileStore(this);
		credentialVault = new CredentialVault(this);
		configureWebView();

		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			backCallback = this::handleBack;
			getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
				OnBackInvokedDispatcher.PRIORITY_DEFAULT,
				backCallback
			);
		}

		showConnections(true);
		String sharedUrl = readSharedUrl(getIntent());
		if (sharedUrl != null) connectUrl(sharedUrl);
	}

	@Override
	protected void onNewIntent(Intent intent) {
		super.onNewIntent(intent);
		setIntent(intent);
		String sharedUrl = readSharedUrl(intent);
		if (sharedUrl != null) connectUrl(sharedUrl);
	}

	@Override
	@SuppressLint("GestureBackNavigation")
	public void onBackPressed() {
		handleBack();
	}

	@Override
	protected void onActivityResult(int requestCode, int resultCode, Intent data) {
		super.onActivityResult(requestCode, resultCode, data);
		if (requestCode != SCAN_REQUEST || pendingScanReply == null) return;
		PendingReply reply = pendingScanReply;
		pendingScanReply = null;
		if (resultCode == RESULT_OK && data != null) {
			String value = data.getStringExtra(ScannerActivity.RESULT_URL);
			if (value != null) {
				reply.success(jsonValue("url", value));
				return;
			}
		}
		reply.success(jsonValue("cancelled", true));
	}

	@Override
	protected void onDestroy() {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && backCallback != null) {
			getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
		}
		if (bridgeRegistered && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
			WebViewCompat.removeWebMessageListener(webView, BRIDGE_NAME);
		}
		webView.stopLoading();
		webView.setWebChromeClient(null);
		webView.setWebViewClient(null);
		webView.destroy();
		super.onDestroy();
	}

	@SuppressLint("SetJavaScriptEnabled")
	private void configureWebView() {
		WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
		WebSettings settings = webView.getSettings();
		settings.setJavaScriptEnabled(true);
		settings.setDomStorageEnabled(true);
		settings.setAllowFileAccess(false);
		settings.setAllowContentAccess(false);
		settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
		settings.setSafeBrowsingEnabled(true);
		settings.setMediaPlaybackRequiresUserGesture(true);
		settings.setUserAgentString(settings.getUserAgentString() + " DaedalusRemote/" + BuildConfig.VERSION_NAME);

		CookieManager cookieManager = CookieManager.getInstance();
		cookieManager.setAcceptCookie(true);
		cookieManager.setAcceptThirdPartyCookies(webView, false);

		webView.setWebChromeClient(new WebChromeClient());
		webView.setWebViewClient(new WebViewClient() {
			@Override
			public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
				return assetLoader == null ? null : assetLoader.shouldInterceptRequest(request.getUrl());
			}

			@Override
			public void onPageStarted(WebView view, String url, Bitmap favicon) {
				progress.setVisibility(View.VISIBLE);
			}

			@Override
			public void onPageFinished(WebView view, String url) {
				progress.setVisibility(View.GONE);
			}

			@Override
			public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
				if (!request.isForMainFrame()) return false;
				Uri uri = request.getUrl();
				if ("daedalus-remote".equalsIgnoreCase(uri.getScheme())
					&& "connection".equalsIgnoreCase(uri.getHost())) {
					showConnections(false);
					return true;
				}
				if (isAllowedNavigation(uri)) return false;
				startupError = "blocked_navigation";
				showConnections(false);
				return true;
			}

			@Override
			public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
				if (!request.isForMainFrame()) return;
				startupError = "gateway_unavailable";
				showConnections(false);
			}

			@Override
			public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
				handler.cancel();
				startupError = "certificate_not_trusted";
				showConnections(false);
			}
		});
	}

	private void showConnections(boolean allowAutoConnect) {
		currentLink = null;
		currentProfile = null;
		autoConnectAllowed = allowAutoConnect;
		configureAssetLoader(LOCAL_AUTHORITY);
		configureBridge(LOCAL_ORIGIN);
		webView.loadUrl(LOCAL_CONNECT_URL);
	}

	private PreparedConnection prepareProfileConnection(String profileId) {
		ConnectionProfile profile = profileStore.find(profileId);
		if (profile == null) throw new IllegalArgumentException("profile_not_found");
		PairingLink link = PairingLink.parse(profile.origin + "/remote.html");
		try {
			String credential = credentialVault.read(profile.id);
			if (!credential.isEmpty()) restoreCookie(profile.origin, credential);
		} catch (GeneralSecurityException error) {
			credentialVault.remove(profile.id);
			throw new IllegalStateException("profile_requires_pairing", error);
		}
		return new PreparedConnection(link, profile);
	}

	private PreparedConnection prepareUrlConnection(String url) {
		PairingLink link = PairingLink.parse(url);
		if (!link.isCompatible()) throw new IllegalArgumentException("remote_ui_incompatible");
		return new PreparedConnection(link, null);
	}

	private void connectUrl(String url) {
		PreparedConnection prepared = prepareUrlConnection(url);
		connect(prepared.link, prepared.profile);
	}

	private void acknowledgeAndConnect(
		String id,
		JavaScriptReplyProxy replyProxy,
		PreparedConnection prepared
	) {
		replySuccess(replyProxy, id, jsonValue("accepted", true));
		// Let the bridge response reach the current page before its document is
		// replaced by the remote workbench.
		webView.post(() -> connect(prepared.link, prepared.profile));
	}

	private void connect(PairingLink link, ConnectionProfile profile) {
		currentLink = link;
		currentProfile = profile;
		startupError = "";
		pendingInstallUrl = link.installUrl.isEmpty() && profile != null
			? profile.installUrl
			: link.installUrl;
		String authority = link.host + ":" + link.port;
		configureAssetLoader(authority);
		configureBridge(link.origin);
		webView.loadUrl(link.remoteAssetUrl());
	}

	private void configureAssetLoader(String authority) {
		assetLoader = new WebViewAssetLoader.Builder()
			.setDomain(authority)
			.setHttpAllowed(false)
			.addPathHandler("/__app__/", new WebViewAssetLoader.AssetsPathHandler(this))
			.build();
	}

	private void configureBridge(String origin) {
		if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
			throw new IllegalStateException("system_webview_too_old");
		}
		if (bridgeRegistered) WebViewCompat.removeWebMessageListener(webView, BRIDGE_NAME);
		currentBridgeOrigin = origin;
		WebViewCompat.addWebMessageListener(
			webView,
			BRIDGE_NAME,
			Set.of(origin),
			this::onBridgeMessage
		);
		bridgeRegistered = true;
	}

	private void onBridgeMessage(
		WebView view,
		WebMessageCompat message,
		Uri sourceOrigin,
		boolean isMainFrame,
		JavaScriptReplyProxy replyProxy
	) {
		String source = originOf(sourceOrigin);
		String raw = message.getData();
		if (!isMainFrame || !currentBridgeOrigin.equals(source) || raw == null) return;
		if (raw.getBytes(StandardCharsets.UTF_8).length > MAX_BRIDGE_MESSAGE_BYTES) {
			replyError(replyProxy, "", "bridge_message_too_large", "Native bridge message exceeds 16 KiB");
			return;
		}
		String id = "";
		try {
			JSONObject request = new JSONObject(raw);
			id = requireString(request, "id", 128);
			String method = requireString(request, "method", 64);
			JSONObject params = request.optJSONObject("params");
			if (params == null) params = new JSONObject();
			dispatchBridge(id, method, params, replyProxy);
		} catch (Exception error) {
			replyError(replyProxy, id, "bridge_request_invalid", error.getMessage());
		}
	}

	private void dispatchBridge(
		String id,
		String method,
		JSONObject params,
		JavaScriptReplyProxy replyProxy
	) throws Exception {
		switch (method) {
			case "app.info":
				requireOnly(params);
				replySuccess(replyProxy, id, new JSONObject()
					.put("version", BuildConfig.VERSION_NAME)
					.put("platform", "android")
					.put("startupError", startupError)
					.put("certificateInstallUrl", pendingInstallUrl)
					.put("autoConnectAllowed", autoConnectAllowed));
				return;
			case "profiles.list":
				requireOnly(params);
				replySuccess(replyProxy, id, profilesJson());
				return;
			case "profiles.connect":
				requireOnly(params, "profileId", "url");
				String profileId = params.optString("profileId");
				String url = params.optString("url");
				if ((profileId.isEmpty() && url.isEmpty()) || (!profileId.isEmpty() && !url.isEmpty())) {
					throw new IllegalArgumentException("profile_connection_invalid");
				}
				PreparedConnection profileConnection = !profileId.isEmpty()
					? prepareProfileConnection(profileId)
					: prepareUrlConnection(url);
				acknowledgeAndConnect(id, replyProxy, profileConnection);
				return;
			case "profiles.rename":
				requireOnly(params, "profileId", "name");
				profileStore.rename(requireString(params, "profileId", 128), requireString(params, "name", 80));
				replySuccess(replyProxy, id, profilesJson());
				return;
			case "profiles.remove":
				requireOnly(params, "profileId");
				ConnectionProfile removed = profileStore.remove(requireString(params, "profileId", 128));
				credentialVault.remove(removed.id);
				clearCookie(removed.origin);
				replySuccess(replyProxy, id, profilesJson());
				return;
			case "pairing.scan":
				requireOnly(params);
				if (pendingScanReply != null) throw new IllegalStateException("scanner_busy");
				pendingScanReply = new PendingReply(id, replyProxy);
				startActivityForResult(new Intent(this, ScannerActivity.class), SCAN_REQUEST);
				return;
			case "pairing.connect":
				requireOnly(params, "url");
				PreparedConnection pairingConnection = prepareUrlConnection(
					requireString(params, "url", 4096)
				);
				acknowledgeAndConnect(id, replyProxy, pairingConnection);
				return;
			case "certificate.openInstall":
				requireOnly(params, "installUrl", "profileId");
				openCertificateInstall(params);
				replySuccess(replyProxy, id, new JSONObject().put("opened", true));
				return;
			case "shell.showConnections":
				requireOnly(params);
				replySuccess(replyProxy, id, new JSONObject().put("shown", true));
				showConnections(false);
				return;
			case "remote.ready":
				requireOnly(params, "name", "certificateFingerprint", "studioVersion", "protocolVersion", "remoteUiCompatibilityVersion");
				handleRemoteReady(params);
				replySuccess(replyProxy, id, new JSONObject().put("saved", true));
				return;
			case "remote.connectionState":
				requireOnly(params, "state");
				replySuccess(replyProxy, id, new JSONObject().put("received", true));
				return;
			default:
				throw new IllegalArgumentException("bridge_method_not_allowed");
		}
	}

	private void handleRemoteReady(JSONObject params) throws Exception {
		if (currentLink == null) throw new IllegalStateException("remote_profile_missing");
		int protocol = params.optInt("protocolVersion", -1);
		int ui = params.optInt("remoteUiCompatibilityVersion", -1);
		if (protocol != PairingLink.EXPECTED_PROTOCOL || ui != PairingLink.EXPECTED_UI_COMPATIBILITY) {
			throw new IllegalStateException("remote_ui_incompatible");
		}
		String fingerprint = requireString(params, "certificateFingerprint", 128)
			.replace(":", "")
			.toLowerCase(Locale.ROOT);
		String expectedFingerprint = !currentLink.fingerprint.isEmpty()
			? currentLink.fingerprint
			: currentProfile == null ? "" : currentProfile.fingerprint;
		if (!expectedFingerprint.isEmpty() && !expectedFingerprint.equals(fingerprint)) {
			throw new GeneralSecurityException("certificate_fingerprint_mismatch");
		}
		String credential = readCookieCredential(currentLink.origin);
		if (credential.isEmpty()) throw new GeneralSecurityException("remote_cookie_missing");
		ConnectionProfile profile = profileStore.upsert(
			currentLink,
			params.optString("name", "Daedalus Studio"),
			fingerprint,
			true
		);
		credentialVault.save(profile.id, credential);
		currentProfile = profile;
		startupError = "";
	}

	private JSONObject profilesJson() throws JSONException {
		JSONArray values = new JSONArray();
		for (ConnectionProfile profile : profileStore.list()) values.put(profile.toJson());
		JSONObject result = new JSONObject().put("profiles", values);
		String lastProfileId = profileStore.lastProfileId();
		if (!lastProfileId.isEmpty()) result.put("lastProfileId", lastProfileId);
		return result;
	}

	private void openCertificateInstall(JSONObject params) {
		String url = params.optString("installUrl");
		if (url.isEmpty()) {
			String profileId = params.optString("profileId");
			ConnectionProfile profile = profileStore.find(profileId);
			if (profile != null) url = profile.installUrl;
		}
		if (url.isEmpty()) throw new IllegalArgumentException("certificate_install_url_missing");
		PairingLink link = PairingLink.parse(url.replace("http://", "https://").replace("/install", "/remote.html"));
		if (currentLink != null && !currentLink.host.equals(link.host)) {
			throw new IllegalArgumentException("certificate_install_origin_invalid");
		}
		startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
	}

	private boolean isAllowedNavigation(Uri uri) {
		if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) return false;
		String origin = uri.getScheme() + "://" + uri.getAuthority();
		return currentBridgeOrigin.equals(origin)
			&& (uri.getPath() == null || uri.getPath().startsWith("/__app__/"));
	}

	private void handleBack() {
		if (!LOCAL_ORIGIN.equals(currentBridgeOrigin)) {
			showConnections(false);
			return;
		}
		if (webView.canGoBack()) webView.goBack();
		else finish();
	}

	private static String originOf(Uri uri) {
		if (uri.getScheme() == null || uri.getAuthority() == null) return "";
		return uri.getScheme() + "://" + uri.getAuthority();
	}

	private static String requireString(JSONObject value, String key, int maxLength) {
		Object raw = value.opt(key);
		if (!(raw instanceof String)) throw new IllegalArgumentException(key + "_invalid");
		String result = ((String) raw).trim();
		if (result.isEmpty() || result.length() > maxLength) throw new IllegalArgumentException(key + "_invalid");
		return result;
	}

	private static void requireOnly(JSONObject params, String... allowedKeys) {
		Set<String> allowed = new HashSet<>(List.of(allowedKeys));
		Iterator<String> keys = params.keys();
		while (keys.hasNext()) {
			String key = keys.next();
			if (!allowed.contains(key)) throw new IllegalArgumentException("bridge_params_invalid");
		}
	}

	private static void replySuccess(JavaScriptReplyProxy proxy, String id, Object result) {
		try {
			proxy.postMessage(new JSONObject().put("id", id).put("result", result).toString());
		} catch (JSONException error) {
			replyError(proxy, id, "bridge_response_invalid", error.getMessage());
		}
	}

	private static JSONObject jsonValue(String key, Object value) {
		try {
			return new JSONObject().put(key, value);
		} catch (JSONException error) {
			throw new IllegalStateException(error);
		}
	}

	private static void replyError(JavaScriptReplyProxy proxy, String id, String code, String message) {
		try {
			proxy.postMessage(new JSONObject()
				.put("id", id)
				.put("error", new JSONObject()
					.put("code", code)
					.put("message", message == null ? code : message))
				.toString());
		} catch (JSONException ignored) {
			proxy.postMessage("{\"id\":\"\",\"error\":{\"code\":\"bridge_error\",\"message\":\"bridge_error\"}}");
		}
	}

	private static String readCookieCredential(String origin) {
		String cookies = CookieManager.getInstance().getCookie(origin);
		if (cookies == null) return "";
		for (String item : cookies.split(";")) {
			String candidate = item.trim();
			if (candidate.startsWith(REMOTE_COOKIE_NAME + "=")) {
				return candidate.substring(REMOTE_COOKIE_NAME.length() + 1);
			}
		}
		return "";
	}

	private static void restoreCookie(String origin, String credential) {
		CookieManager.getInstance().setCookie(
			origin,
			REMOTE_COOKIE_NAME + "=" + credential + "; Path=/; Secure; HttpOnly; SameSite=Strict"
		);
		CookieManager.getInstance().flush();
	}

	private static void clearCookie(String origin) {
		CookieManager.getInstance().setCookie(
			origin,
			REMOTE_COOKIE_NAME + "=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict"
		);
		CookieManager.getInstance().flush();
	}

	private static String readSharedUrl(Intent intent) {
		if (!Intent.ACTION_SEND.equals(intent.getAction()) || !"text/plain".equals(intent.getType())) return null;
		return intent.getStringExtra(Intent.EXTRA_TEXT);
	}

	private static final class PendingReply {
		private final String id;
		private final JavaScriptReplyProxy proxy;

		private PendingReply(String id, JavaScriptReplyProxy proxy) {
			this.id = id;
			this.proxy = proxy;
		}

		private void success(Object result) {
			replySuccess(proxy, id, result);
		}
	}

	private static final class PreparedConnection {
		private final PairingLink link;
		private final ConnectionProfile profile;

		private PreparedConnection(PairingLink link, ConnectionProfile profile) {
			this.link = link;
			this.profile = profile;
		}
	}
}
