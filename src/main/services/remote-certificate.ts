import "reflect-metadata";
import {
	AuthorityKeyIdentifierExtension,
	BasicConstraintsExtension,
	ExtendedKeyUsage,
	ExtendedKeyUsageExtension,
	KeyUsageFlags,
	KeyUsagesExtension,
	PemConverter,
	SubjectAlternativeNameExtension,
	SubjectKeyIdentifierExtension,
	X509Certificate,
	X509CertificateGenerator,
	cryptoProvider,
} from "@peculiar/x509";
import { createHash, randomBytes, webcrypto } from "node:crypto";

const RSA_ALGORITHM: RsaHashedKeyGenParams = {
	name: "RSASSA-PKCS1-v1_5",
	hash: "SHA-256",
	modulusLength: 2048,
	publicExponent: new Uint8Array([1, 0, 1]),
};
const RSA_IMPORT_ALGORITHM: RsaHashedImportParams = {
	name: "RSASSA-PKCS1-v1_5",
	hash: "SHA-256",
};
const DAY_MS: number = 24 * 60 * 60 * 1000;
const SERVER_CERTIFICATE_LIFETIME_DAYS: number = 397;
const ROOT_CERTIFICATE_LIFETIME_DAYS: number = 3650;
const SERVER_RENEWAL_WINDOW_DAYS: number = 30;

cryptoProvider.set(webcrypto as unknown as Crypto);
const subtle: SubtleCrypto = webcrypto.subtle as unknown as SubtleCrypto;

export type RemoteCertificateAuthority = {
	certificatePem: string;
	privateKeyPem: string;
};

export type RemoteServerCertificate = {
	certificatePem: string;
	privateKeyPem: string;
	expiresAt: string;
};

export type RemoteCertificateBundle = {
	ca: RemoteCertificateAuthority;
	server: RemoteServerCertificate;
	fingerprint: string;
	addresses: string[];
};

function createSerialNumber(): string {
	const bytes: Buffer = randomBytes(16);
	bytes[0] = (bytes[0] ?? 0) & 0x7f;
	return bytes.toString("hex");
}

function exportPrivateKey(privateKey: CryptoKey): Promise<ArrayBuffer> {
	return subtle.exportKey("pkcs8", privateKey);
}

function toPrivateKeyPem(raw: ArrayBuffer): string {
	return PemConverter.encode(raw, PemConverter.PrivateKeyTag);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
	return await subtle.importKey(
		"pkcs8",
		PemConverter.decodeFirst(pem),
		RSA_IMPORT_ALGORITHM,
		true,
		["sign"],
	);
}

function createFingerprint(certificatePem: string): string {
	const digest: string = createHash("sha256")
		.update(Buffer.from(PemConverter.decodeFirst(certificatePem)))
		.digest("hex")
		.toUpperCase();
	return digest.match(/.{1,2}/gu)?.join(":") ?? digest;
}

export async function createRemoteCertificateAuthority(): Promise<RemoteCertificateAuthority> {
	const keys: CryptoKeyPair = await subtle.generateKey(
		RSA_ALGORITHM,
		true,
		["sign", "verify"],
	);
	const now: number = Date.now();
	const certificate: X509Certificate = await X509CertificateGenerator.createSelfSigned({
		serialNumber: createSerialNumber(),
		name: "CN=Daedalus Studio Remote CA,O=Daedalus Studio",
		notBefore: new Date(now - DAY_MS),
		notAfter: new Date(now + ROOT_CERTIFICATE_LIFETIME_DAYS * DAY_MS),
		signingAlgorithm: RSA_IMPORT_ALGORITHM,
		keys,
		extensions: [
			new BasicConstraintsExtension(true, 0, true),
			new KeyUsagesExtension(
				KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign,
				true,
			),
			await SubjectKeyIdentifierExtension.create(keys.publicKey),
		],
	}, webcrypto as unknown as Crypto);
	return {
		certificatePem: certificate.toString("pem"),
		privateKeyPem: toPrivateKeyPem(await exportPrivateKey(keys.privateKey)),
	};
}

export async function createRemoteServerCertificate(
	ca: RemoteCertificateAuthority,
	addresses: readonly string[],
): Promise<RemoteServerCertificate> {
	const caCertificate = new X509Certificate(ca.certificatePem);
	const caPrivateKey: CryptoKey = await importPrivateKey(ca.privateKeyPem);
	const keys: CryptoKeyPair = await subtle.generateKey(
		RSA_ALGORITHM,
		true,
		["sign", "verify"],
	);
	const now: number = Date.now();
	const expiresAt = new Date(now + SERVER_CERTIFICATE_LIFETIME_DAYS * DAY_MS);
	const certificate: X509Certificate = await X509CertificateGenerator.create({
		serialNumber: createSerialNumber(),
		subject: "CN=Daedalus Studio Remote,O=Daedalus Studio",
		issuer: caCertificate.subject,
		notBefore: new Date(now - DAY_MS),
		notAfter: expiresAt,
		signingAlgorithm: RSA_IMPORT_ALGORITHM,
		publicKey: keys.publicKey,
		signingKey: caPrivateKey,
		extensions: [
			new BasicConstraintsExtension(false, undefined, true),
			new KeyUsagesExtension(
				KeyUsageFlags.digitalSignature | KeyUsageFlags.keyEncipherment,
				true,
			),
			new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]),
			new SubjectAlternativeNameExtension(
				addresses.map((address: string) => ({ type: "ip" as const, value: address })),
			),
			await SubjectKeyIdentifierExtension.create(keys.publicKey),
			await AuthorityKeyIdentifierExtension.create(caCertificate.publicKey),
		],
	}, webcrypto as unknown as Crypto);
	return {
		certificatePem: certificate.toString("pem"),
		privateKeyPem: toPrivateKeyPem(await exportPrivateKey(keys.privateKey)),
		expiresAt: expiresAt.toISOString(),
	};
}

export async function createRemoteCertificateBundle(
	addresses: readonly string[],
	ca?: RemoteCertificateAuthority,
): Promise<RemoteCertificateBundle> {
	const sortedAddresses: string[] = [...new Set(addresses)].sort();
	const certificateAuthority: RemoteCertificateAuthority = ca
		?? await createRemoteCertificateAuthority();
	return {
		ca: certificateAuthority,
		server: await createRemoteServerCertificate(certificateAuthority, sortedAddresses),
		fingerprint: createFingerprint(certificateAuthority.certificatePem),
		addresses: sortedAddresses,
	};
}

export function shouldRenewRemoteServerCertificate(
	serverAddresses: readonly string[],
	certificateExpiresAt: string,
	currentAddresses: readonly string[],
	now: number = Date.now(),
): boolean {
	const previous: string[] = [...serverAddresses].sort();
	const current: string[] = [...new Set(currentAddresses)].sort();
	if (JSON.stringify(previous) !== JSON.stringify(current)) return true;
	const expiresAt: number = Date.parse(certificateExpiresAt);
	return !Number.isFinite(expiresAt)
		|| expiresAt - now <= SERVER_RENEWAL_WINDOW_DAYS * DAY_MS;
}
