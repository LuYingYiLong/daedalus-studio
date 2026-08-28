package com.daedalus.studio.remote;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public final class ProfileStore {
	private static final String PREFERENCES_NAME = "remote_connections_v2";
	private static final String PROFILES_KEY = "profiles";
	private static final String LAST_PROFILE_KEY = "last_profile_id";
	private static final String LEGACY_PREFERENCES_NAME = "remote_connection";
	private static final String LEGACY_ENDPOINT_KEY = "endpoint";
	private static final int MAX_PROFILES = 10;

	private final Context context;
	private final SharedPreferences preferences;

	public ProfileStore(Context context) {
		this.context = context.getApplicationContext();
		this.preferences = this.context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
		migrateLegacyEndpoint();
	}

	public List<ConnectionProfile> list() {
		List<ConnectionProfile> result = new ArrayList<>();
		String raw = preferences.getString(PROFILES_KEY, "[]");
		try {
			JSONArray items = new JSONArray(raw);
			for (int index = 0; index < items.length(); index += 1) {
				JSONObject value = items.optJSONObject(index);
				if (value == null) continue;
				ConnectionProfile profile = ConnectionProfile.fromJson(value);
				if (!profile.id.isEmpty() && !profile.origin.isEmpty()) result.add(profile);
			}
		} catch (JSONException ignored) {
			preferences.edit().remove(PROFILES_KEY).apply();
		}
		return result;
	}

	public String lastProfileId() {
		return preferences.getString(LAST_PROFILE_KEY, "");
	}

	public ConnectionProfile find(String profileId) {
		for (ConnectionProfile profile : list()) {
			if (profile.id.equals(profileId)) return profile;
		}
		return null;
	}

	public ConnectionProfile upsert(PairingLink link, String name, String fingerprint, boolean paired) {
		List<ConnectionProfile> profiles = list();
		String effectiveFingerprint = fingerprint.isEmpty() ? link.fingerprint : fingerprint;
		int matchIndex = -1;
		for (int index = 0; index < profiles.size(); index += 1) {
			ConnectionProfile profile = profiles.get(index);
			if (!profile.origin.equals(link.origin)) continue;
			if (!profile.fingerprint.isEmpty()
				&& !effectiveFingerprint.isEmpty()
				&& !profile.fingerprint.equals(effectiveFingerprint)) {
				throw new IllegalStateException("profile_fingerprint_conflict");
			}
			if (profile.fingerprint.equals(effectiveFingerprint)
				|| profile.fingerprint.isEmpty()
				|| effectiveFingerprint.isEmpty()) {
				matchIndex = index;
				break;
			}
		}
		ConnectionProfile existing = matchIndex < 0 ? null : profiles.get(matchIndex);
		ConnectionProfile next = new ConnectionProfile(
			existing == null ? UUID.randomUUID().toString() : existing.id,
			name.isEmpty() ? (existing == null ? "Daedalus Studio" : existing.name) : name,
			link.origin,
			effectiveFingerprint,
			link.installUrl.isEmpty() && existing != null ? existing.installUrl : link.installUrl,
			Instant.now().toString(),
			paired ? "paired" : "pairing_required"
		);
		if (matchIndex < 0) {
			if (profiles.size() >= MAX_PROFILES) profiles.remove(profiles.size() - 1);
			profiles.add(0, next);
		} else {
			profiles.set(matchIndex, next);
		}
		save(profiles, next.id);
		return next;
	}

	public void rename(String profileId, String name) {
		String trimmed = name == null ? "" : name.trim();
		if (trimmed.isEmpty() || trimmed.length() > 80) throw new IllegalArgumentException("profile_name_invalid");
		List<ConnectionProfile> profiles = list();
		for (int index = 0; index < profiles.size(); index += 1) {
			ConnectionProfile profile = profiles.get(index);
			if (!profile.id.equals(profileId)) continue;
			profiles.set(index, new ConnectionProfile(
				profile.id,
				trimmed,
				profile.origin,
				profile.fingerprint,
				profile.installUrl,
				profile.lastConnectedAt,
				profile.authState
			));
			save(profiles, lastProfileId());
			return;
		}
		throw new IllegalArgumentException("profile_not_found");
	}

	public ConnectionProfile remove(String profileId) {
		List<ConnectionProfile> profiles = list();
		ConnectionProfile removed = null;
		for (ConnectionProfile profile : profiles) {
			if (profile.id.equals(profileId)) {
				removed = profile;
				break;
			}
		}
		if (removed == null) throw new IllegalArgumentException("profile_not_found");
		profiles.remove(removed);
		String last = lastProfileId().equals(profileId) ? "" : lastProfileId();
		save(profiles, last);
		return removed;
	}

	private void save(List<ConnectionProfile> profiles, String lastProfileId) {
		JSONArray items = new JSONArray();
		for (ConnectionProfile profile : profiles) items.put(profile.toJson());
		preferences.edit()
			.putString(PROFILES_KEY, items.toString())
			.putString(LAST_PROFILE_KEY, lastProfileId)
			.apply();
	}

	private void migrateLegacyEndpoint() {
		if (preferences.contains(PROFILES_KEY)) return;
		SharedPreferences legacy = context.getSharedPreferences(LEGACY_PREFERENCES_NAME, Context.MODE_PRIVATE);
		String endpoint = legacy.getString(LEGACY_ENDPOINT_KEY, "");
		if (endpoint.isEmpty()) return;
		try {
			PairingLink link = PairingLink.parse(endpoint);
			upsert(link, "Daedalus Studio", link.fingerprint, false);
			legacy.edit().remove(LEGACY_ENDPOINT_KEY).apply();
		} catch (IllegalArgumentException ignored) {
			legacy.edit().remove(LEGACY_ENDPOINT_KEY).apply();
		}
	}
}
