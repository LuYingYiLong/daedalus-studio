package com.daedalus.studio.remote;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

public final class MainActivity extends Activity {
	private static final String PREFERENCES_NAME = "remote_connection";
	private static final String ENDPOINT_KEY = "endpoint";
	private static final int DEFAULT_HTTPS_PORT = 38190;
	private static final int REMOTE_START_MAX_POLLS = 32;
	private static final long REMOTE_START_POLL_DELAY_MS = 250L;

	private EditText endpointInput;
	private TextView errorText;
	private View appBar;
	private ScrollView connectPanel;
	private WebView webView;
	private ProgressBar progress;
	private Button reloadButton;
	private OnBackInvokedCallback backCallback;
	private final Handler mainHandler = new Handler(Looper.getMainLooper());
	private String allowedHost;
	private int allowedPort = -1;
	private int navigationGeneration = 0;
	private boolean startupRecoveryAttempted = false;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_main);
		bindViews();
		configureWebView();
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			backCallback = this::handleBack;
			getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
		}

		findViewById(R.id.connect_button).setOnClickListener(view -> connect(endpointInput.getText().toString()));
		reloadButton.setOnClickListener(view -> {
			if (webView.getVisibility() == View.VISIBLE) {
				startupRecoveryAttempted = false;
				webView.reload();
			}
		});
		findViewById(R.id.change_button).setOnClickListener(view -> showConnectionPanel(null));

		String sharedUrl = readSharedUrl(getIntent());
		if (sharedUrl != null) {
			endpointInput.setText(sharedUrl);
			connect(sharedUrl);
			return;
		}

		String savedEndpoint = preferences().getString(ENDPOINT_KEY, null);
		if (savedEndpoint != null) {
			endpointInput.setText(savedEndpoint);
			connect(savedEndpoint);
		}
	}

	@Override
	protected void onNewIntent(Intent intent) {
		super.onNewIntent(intent);
		setIntent(intent);
		String sharedUrl = readSharedUrl(intent);
		if (sharedUrl == null) return;
		endpointInput.setText(sharedUrl);
		connect(sharedUrl);
	}

	@Override
	@SuppressLint("GestureBackNavigation")
	public void onBackPressed() {
		handleBack();
	}

	private void handleBack() {
		if (webView.getVisibility() == View.VISIBLE && webView.canGoBack()) {
			webView.goBack();
			return;
		}
		finish();
	}

	@Override
	protected void onDestroy() {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && backCallback != null) {
			getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
		}
		mainHandler.removeCallbacksAndMessages(null);
		webView.stopLoading();
		webView.setWebChromeClient(null);
		webView.setWebViewClient(null);
		webView.destroy();
		super.onDestroy();
	}

	private void bindViews() {
		endpointInput = findViewById(R.id.endpoint_input);
		errorText = findViewById(R.id.error_text);
		appBar = findViewById(R.id.app_bar);
		connectPanel = findViewById(R.id.connect_panel);
		webView = findViewById(R.id.web_view);
		progress = findViewById(R.id.progress);
		reloadButton = findViewById(R.id.reload_button);
		reloadButton.setEnabled(false);
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
			public void onPageStarted(WebView view, String url, Bitmap favicon) {
				navigationGeneration += 1;
				progress.setVisibility(View.VISIBLE);
			}

			@Override
			public void onPageFinished(WebView view, String url) {
				if (!isAllowedNavigation(Uri.parse(url))) return;
				waitForRemotePage(view, url, navigationGeneration, 0);
			}

			@Override
			public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
				if (!request.isForMainFrame()) return false;
				Uri uri = request.getUrl();
				if ("daedalus-remote".equalsIgnoreCase(uri.getScheme()) && "connection".equalsIgnoreCase(uri.getHost())) {
					showConnectionPanel(null);
					return true;
				}
				if (isAllowedNavigation(uri)) return false;
				showError(R.string.blocked_navigation);
				return true;
			}

			@Override
			public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
				if (!request.isForMainFrame()) return;
				showConnectionPanel(getString(R.string.connection_failed));
			}

			@Override
			public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
				handler.cancel();
				showConnectionPanel(getString(R.string.certificate_failed));
			}
		});
	}

	private void connect(String rawUrl) {
		String endpoint = normalizeEndpoint(rawUrl);
		if (endpoint == null) {
			showError(R.string.invalid_endpoint);
			return;
		}

		URI uri;
		try {
			uri = new URI(endpoint);
		} catch (URISyntaxException error) {
			showError(R.string.invalid_endpoint);
			return;
		}

		allowedHost = uri.getHost().toLowerCase(Locale.ROOT);
		allowedPort = effectivePort(uri.getPort());
		startupRecoveryAttempted = false;
		errorText.setVisibility(View.GONE);
		progress.setVisibility(View.VISIBLE);
		appBar.setVisibility(View.VISIBLE);
		webView.setVisibility(View.INVISIBLE);
		connectPanel.setVisibility(View.VISIBLE);
		reloadButton.setEnabled(false);
		webView.loadUrl(endpoint);
	}

	private void waitForRemotePage(WebView view, String url, int generation, int poll) {
		if (generation != navigationGeneration || !isAllowedNavigation(Uri.parse(url))) return;
		view.evaluateJavascript(
			"Boolean(document.getElementById('root') && document.getElementById('root').childElementCount > 0)",
			result -> {
				if (generation != navigationGeneration) return;
				if ("true".equals(result)) {
					startupRecoveryAttempted = false;
					progress.setVisibility(View.GONE);
					preferences().edit().putString(ENDPOINT_KEY, endpointWithoutSecret()).apply();
					connectPanel.setVisibility(View.GONE);
					appBar.setVisibility(View.GONE);
					webView.setVisibility(View.VISIBLE);
					reloadButton.setEnabled(true);
					return;
				}
				if (poll < REMOTE_START_MAX_POLLS) {
					mainHandler.postDelayed(
						() -> waitForRemotePage(view, url, generation, poll + 1),
						REMOTE_START_POLL_DELAY_MS
					);
					return;
				}
				recoverRemotePage(view, generation);
			}
		);
	}

	private void recoverRemotePage(WebView view, int generation) {
		if (generation != navigationGeneration) return;
		if (startupRecoveryAttempted) {
			showConnectionPanel(getString(R.string.app_start_failed));
			return;
		}
		startupRecoveryAttempted = true;
		view.clearCache(true);
		view.evaluateJavascript(
			"(function(){if(!('serviceWorker' in navigator)){location.reload();return true;}navigator.serviceWorker.getRegistrations().then(function(items){return Promise.all(items.map(function(item){return item.unregister();}));}).finally(function(){location.reload();});return true;})()",
			null
		);
	}

	private void showConnectionPanel(String message) {
		webView.stopLoading();
		webView.setVisibility(View.GONE);
		appBar.setVisibility(View.VISIBLE);
		connectPanel.setVisibility(View.VISIBLE);
		progress.setVisibility(View.GONE);
		reloadButton.setEnabled(false);
		if (message == null) {
			errorText.setVisibility(View.GONE);
			return;
		}
		errorText.setText(message);
		errorText.setVisibility(View.VISIBLE);
	}

	private void showError(int messageId) {
		errorText.setText(messageId);
		errorText.setVisibility(View.VISIBLE);
	}

	private boolean isAllowedNavigation(Uri uri) {
		if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || allowedHost == null) return false;
		return allowedHost.equals(uri.getHost().toLowerCase(Locale.ROOT)) && allowedPort == effectivePort(uri.getPort());
	}

	private String endpointWithoutSecret() {
		return "https://" + allowedHost + ":" + allowedPort + "/remote.html";
	}

	private SharedPreferences preferences() {
		return getSharedPreferences(PREFERENCES_NAME, MODE_PRIVATE);
	}

	private static String readSharedUrl(Intent intent) {
		if (!Intent.ACTION_SEND.equals(intent.getAction()) || !"text/plain".equals(intent.getType())) return null;
		return intent.getStringExtra(Intent.EXTRA_TEXT);
	}

	private static String normalizeEndpoint(String rawUrl) {
		if (rawUrl == null) return null;
		String candidate = rawUrl.trim();
		if (candidate.isEmpty()) return null;
		if (!candidate.contains("://")) candidate = "https://" + candidate;

		try {
			URI input = new URI(candidate);
			String host = input.getHost();
			if (!"https".equalsIgnoreCase(input.getScheme()) || host == null || input.getUserInfo() != null || !isPrivateIpv4(host)) return null;
			String path = input.getPath();
			if (path == null || path.isEmpty() || "/".equals(path)) path = "/remote.html";
			if (!"/remote.html".equals(path)) return null;
			int port = effectivePort(input.getPort());
			return new URI("https", null, host, port, path, null, input.getRawFragment()).toASCIIString();
		} catch (URISyntaxException error) {
			return null;
		}
	}

	private static int effectivePort(int port) {
		return port < 0 ? DEFAULT_HTTPS_PORT : port;
	}

	private static boolean isPrivateIpv4(String host) {
		String[] octets = host.split("\\.", -1);
		if (octets.length != 4) return false;
		int[] values = new int[4];
		for (int index = 0; index < octets.length; index += 1) {
			try {
				values[index] = Integer.parseInt(octets[index]);
			} catch (NumberFormatException error) {
				return false;
			}
			if (values[index] < 0 || values[index] > 255) return false;
		}
		return values[0] == 10
			|| (values[0] == 172 && values[1] >= 16 && values[1] <= 31)
			|| (values[0] == 192 && values[1] == 168);
	}
}
