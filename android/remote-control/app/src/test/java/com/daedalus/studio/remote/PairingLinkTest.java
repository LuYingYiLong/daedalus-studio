package com.daedalus.studio.remote;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public final class PairingLinkTest {
	@Test
	public void parsesCurrentPairingUrl() {
		String fingerprint = "ab".repeat(32);
		PairingLink link = PairingLink.parse(
			"https://192.168.10.22:38190/remote.html"
				+ "#pair=abcdefghijklmnopqrstuvwxyz0123456789_-"
				+ "&install=http%3A%2F%2F192.168.10.22%3A38191%2Finstall"
				+ "&fingerprint=" + fingerprint
				+ "&protocol=3&ui=1"
		);

		assertEquals("https://192.168.10.22:38190", link.origin);
		assertEquals("http://192.168.10.22:38191/install", link.installUrl);
		assertEquals(fingerprint, link.fingerprint);
		assertTrue(link.isCompatible());
		assertTrue(link.remoteAssetUrl().startsWith(
			"https://192.168.10.22:38190/__app__/remote.html#pair="
		));
	}

	@Test
	public void acceptsLegacyEndpointWithoutFragment() {
		PairingLink link = PairingLink.parse("192.168.1.7");
		assertEquals("https://192.168.1.7:38190", link.origin);
		assertEquals("", link.pairingCode);
		assertEquals("", link.fingerprint);
		assertTrue(link.isCompatible());
	}

	@Test
	public void rejectsPublicAddressesAndUnsafeInstallOrigins() {
		assertThrows(IllegalArgumentException.class, () -> PairingLink.parse(
			"https://8.8.8.8:38190/remote.html"
		));
		assertThrows(IllegalArgumentException.class, () -> PairingLink.parse(
			"https://192.168.1.7:38190/remote.html"
				+ "#pair=abcdefghijklmnopqrstuvwxyz0123456789"
				+ "&install=http%3A%2F%2F192.168.1.8%3A38191%2Finstall"
		));
	}

	@Test
	public void reportsUiCompatibilityMismatch() {
		PairingLink link = PairingLink.parse(
			"https://10.0.0.2:38190/remote.html"
				+ "#pair=abcdefghijklmnopqrstuvwxyz0123456789&protocol=3&ui=2"
		);
		assertFalse(link.isCompatible());
	}
}
