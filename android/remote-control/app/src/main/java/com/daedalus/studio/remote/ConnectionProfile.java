package com.daedalus.studio.remote;

import org.json.JSONException;
import org.json.JSONObject;

public final class ConnectionProfile {
	public final String id;
	public final String name;
	public final String origin;
	public final String fingerprint;
	public final String installUrl;
	public final String lastConnectedAt;
	public final String authState;

	public ConnectionProfile(
		String id,
		String name,
		String origin,
		String fingerprint,
		String installUrl,
		String lastConnectedAt,
		String authState
	) {
		this.id = id;
		this.name = name;
		this.origin = origin;
		this.fingerprint = fingerprint;
		this.installUrl = installUrl;
		this.lastConnectedAt = lastConnectedAt;
		this.authState = authState;
	}

	public JSONObject toJson() {
		try {
			return new JSONObject()
				.put("id", id)
				.put("name", name)
				.put("origin", origin)
				.put("certificateFingerprint", fingerprint)
				.put("installUrl", installUrl)
				.put("lastConnectedAt", lastConnectedAt)
				.put("authState", authState);
		} catch (JSONException error) {
			throw new IllegalStateException(error);
		}
	}

	public static ConnectionProfile fromJson(JSONObject value) {
		return new ConnectionProfile(
			value.optString("id"),
			value.optString("name", "Daedalus Studio"),
			value.optString("origin"),
			value.optString("certificateFingerprint"),
			value.optString("installUrl"),
			value.optString("lastConnectedAt"),
			value.optString("authState", "unknown")
		);
	}
}
