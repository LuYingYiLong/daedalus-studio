package com.daedalus.studio.remote;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public final class CredentialVault {
	private static final String KEY_ALIAS = "daedalus_remote_cookie_key_v1";
	private static final String PREFERENCES_NAME = "remote_credentials";
	private static final String CIPHER_TRANSFORMATION = "AES/GCM/NoPadding";
	private static final int GCM_TAG_BITS = 128;

	private final SharedPreferences preferences;

	public CredentialVault(Context context) {
		preferences = context.getApplicationContext().getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
	}

	public void save(String profileId, String credential) throws GeneralSecurityException {
		Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
		cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
		byte[] encrypted = cipher.doFinal(credential.getBytes(StandardCharsets.UTF_8));
		String payload = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
			+ "."
			+ Base64.encodeToString(encrypted, Base64.NO_WRAP);
		preferences.edit().putString(profileId, payload).apply();
	}

	public String read(String profileId) throws GeneralSecurityException {
		String payload = preferences.getString(profileId, "");
		if (payload.isEmpty()) return "";
		int separator = payload.indexOf('.');
		if (separator <= 0) throw new GeneralSecurityException("credential_payload_invalid");
		try {
			byte[] iv = Base64.decode(payload.substring(0, separator), Base64.NO_WRAP);
			byte[] encrypted = Base64.decode(payload.substring(separator + 1), Base64.NO_WRAP);
			Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
			cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
			return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
		} catch (GeneralSecurityException | IllegalArgumentException error) {
			preferences.edit().remove(profileId).apply();
			throw new GeneralSecurityException("credential_unavailable", error);
		}
	}

	public void remove(String profileId) {
		preferences.edit().remove(profileId).apply();
	}

	private static SecretKey getOrCreateKey() throws GeneralSecurityException {
		KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
		try {
			keyStore.load(null);
		} catch (IOException error) {
			throw new GeneralSecurityException("keystore_unavailable", error);
		}
		if (keyStore.containsAlias(KEY_ALIAS)) {
			return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
		}
		KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
		generator.init(new KeyGenParameterSpec.Builder(
			KEY_ALIAS,
			KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
		)
			.setKeySize(256)
			.setBlockModes(KeyProperties.BLOCK_MODE_GCM)
			.setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
			.build());
		return generator.generateKey();
	}
}
