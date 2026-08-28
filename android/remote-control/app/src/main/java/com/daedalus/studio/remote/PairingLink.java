package com.daedalus.studio.remote;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public final class PairingLink {
	public static final int DEFAULT_HTTPS_PORT = 38190;
	public static final int EXPECTED_PROTOCOL = 3;
	public static final int EXPECTED_UI_COMPATIBILITY = 1;
	private static final int MAX_URL_LENGTH = 4096;
	private static final int MAX_FIELD_LENGTH = 1024;

	public final String origin;
	public final String host;
	public final int port;
	public final String pairingCode;
	public final String fingerprint;
	public final String installUrl;
	public final int protocol;
	public final int uiCompatibility;

	private PairingLink(
		String origin,
		String host,
		int port,
		String pairingCode,
		String fingerprint,
		String installUrl,
		int protocol,
		int uiCompatibility
	) {
		this.origin = origin;
		this.host = host;
		this.port = port;
		this.pairingCode = pairingCode;
		this.fingerprint = fingerprint;
		this.installUrl = installUrl;
		this.protocol = protocol;
		this.uiCompatibility = uiCompatibility;
	}

	public static PairingLink parse(String rawUrl) throws IllegalArgumentException {
		if (rawUrl == null) throw new IllegalArgumentException("pairing_url_missing");
		String candidate = rawUrl.trim();
		if (candidate.isEmpty() || candidate.length() > MAX_URL_LENGTH) {
			throw new IllegalArgumentException("pairing_url_invalid");
		}
		if (!candidate.contains("://")) candidate = "https://" + candidate;

		try {
			URI uri = new URI(candidate);
			String host = uri.getHost();
			if (!"https".equalsIgnoreCase(uri.getScheme())
				|| host == null
				|| uri.getUserInfo() != null
				|| uri.getQuery() != null
				|| !isPrivateIpv4(host)) {
				throw new IllegalArgumentException("pairing_url_invalid");
			}
			String path = uri.getPath();
			if (path == null || path.isEmpty() || "/".equals(path)) path = "/remote.html";
			if (!"/remote.html".equals(path)) throw new IllegalArgumentException("pairing_path_invalid");
			int port = uri.getPort() < 0 ? DEFAULT_HTTPS_PORT : uri.getPort();
			if (port < 1 || port > 65535) throw new IllegalArgumentException("pairing_port_invalid");

			Map<String, String> fields = parseFragment(uri.getRawFragment());
			String pairingCode = fields.getOrDefault("pair", "");
			if (!pairingCode.isEmpty() && !pairingCode.matches("[A-Za-z0-9_-]{20,512}")) {
				throw new IllegalArgumentException("pairing_code_invalid");
			}
			String fingerprint = normalizeFingerprint(fields.getOrDefault("fingerprint", ""));
			int protocol = parseVersion(fields.get("protocol"), EXPECTED_PROTOCOL);
			int ui = parseVersion(fields.get("ui"), EXPECTED_UI_COMPATIBILITY);
			String install = validateInstallUrl(fields.get("install"), host);
			String origin = new URI("https", null, host, port, null, null, null).toASCIIString();
			return new PairingLink(origin, host.toLowerCase(Locale.ROOT), port, pairingCode, fingerprint, install, protocol, ui);
		} catch (URISyntaxException error) {
			throw new IllegalArgumentException("pairing_url_invalid", error);
		}
	}

	public String remoteAssetUrl() {
		StringBuilder result = new StringBuilder(origin).append("/__app__/remote.html");
		if (!pairingCode.isEmpty()) result.append("#pair=").append(encodeComponent(pairingCode));
		return result.toString();
	}

	public boolean isCompatible() {
		return protocol == EXPECTED_PROTOCOL && uiCompatibility == EXPECTED_UI_COMPATIBILITY;
	}

	public static boolean isPrivateIpv4(String host) {
		String[] octets = host.split("\\.", -1);
		if (octets.length != 4) return false;
		int[] values = new int[4];
		for (int index = 0; index < octets.length; index += 1) {
			if (octets[index].isEmpty() || (octets[index].length() > 1 && octets[index].startsWith("0"))) return false;
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

	private static Map<String, String> parseFragment(String fragment) {
		Map<String, String> result = new HashMap<>();
		if (fragment == null || fragment.isEmpty()) return result;
		for (String item : fragment.split("&")) {
			int separator = item.indexOf('=');
			if (separator <= 0) throw new IllegalArgumentException("pairing_fragment_invalid");
			String key = decodeComponent(item.substring(0, separator));
			String value = decodeComponent(item.substring(separator + 1));
			if (key.length() > 64 || value.length() > MAX_FIELD_LENGTH || result.put(key, value) != null) {
				throw new IllegalArgumentException("pairing_fragment_invalid");
			}
		}
		return result;
	}

	private static String encodeComponent(String value) {
		try {
			return URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20");
		} catch (UnsupportedEncodingException error) {
			throw new IllegalStateException("utf8_unavailable", error);
		}
	}

	private static String decodeComponent(String value) {
		try {
			return URLDecoder.decode(value, StandardCharsets.UTF_8.name());
		} catch (UnsupportedEncodingException error) {
			throw new IllegalStateException("utf8_unavailable", error);
		}
	}

	private static int parseVersion(String value, int fallback) {
		if (value == null || value.isEmpty()) return fallback;
		try {
			return Integer.parseInt(value);
		} catch (NumberFormatException error) {
			throw new IllegalArgumentException("pairing_version_invalid", error);
		}
	}

	private static String normalizeFingerprint(String value) {
		if (value.isEmpty()) return "";
		String normalized = value.replace(":", "").toLowerCase(Locale.ROOT);
		if (!normalized.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("pairing_fingerprint_invalid");
		return normalized;
	}

	private static String validateInstallUrl(String value, String expectedHost) {
		if (value == null || value.isEmpty()) return "";
		try {
			URI install = new URI(value);
			if (!"http".equalsIgnoreCase(install.getScheme())
				|| install.getHost() == null
				|| !install.getHost().equalsIgnoreCase(expectedHost)
				|| install.getUserInfo() != null
				|| !"/install".equals(install.getPath())
				|| install.getFragment() != null
				|| install.getQuery() != null) {
				throw new IllegalArgumentException("pairing_install_url_invalid");
			}
			return install.toASCIIString();
		} catch (URISyntaxException error) {
			throw new IllegalArgumentException("pairing_install_url_invalid", error);
		}
	}
}
