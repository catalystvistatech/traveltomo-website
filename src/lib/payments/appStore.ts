// Verifies StoreKit 2 signed transactions (JWS) on the server.
//
// The iOS app sends `VerificationResult.jwsRepresentation` for its current
// Unlimited Pass entitlement. We only grant `profiles.is_unlimited` when
// that JWS is genuinely signed by Apple:
//   1. header.x5c is a chain leaf -> intermediate -> root,
//   2. the root is Apple Root CA - G3 (pinned by SHA-256 fingerprint),
//   3. each certificate is issued and signed by the next, all valid at the
//      transaction's signedDate, with Apple's marker OIDs on leaf and
//      intermediate (same checks as Apple's app-store-server-library),
//   4. the ES256 signature over header.payload verifies with the leaf key.
// No network calls and no extra dependency: Node's crypto does the work.

import { X509Certificate, verify as verifySignature } from "node:crypto";

/** SHA-256 of https://www.apple.com/certificateauthority/AppleRootCA-G3.cer */
export const APPLE_ROOT_CA_G3_FINGERPRINT =
  "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79";

// DER encodings of Apple's marker extension OIDs.
// 1.2.840.113635.100.6.11.1 — App Store receipt signing (leaf)
const LEAF_OID = Buffer.from([0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01]);
// 1.2.840.113635.100.6.2.1 — Apple WWDR intermediate
const INTERMEDIATE_OID = Buffer.from([0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x02, 0x01]);

export type AppStoreTransaction = {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  type?: string;
  environment?: string;
  /** ms since epoch */
  purchaseDate?: number;
  expiresDate?: number;
  signedDate?: number;
  revocationDate?: number;
  appAccountToken?: string;
};

export type VerifyResult =
  | { ok: true; transaction: AppStoreTransaction }
  | { ok: false; reason: string };

function b64urlDecode(part: string): Buffer {
  return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function validAt(cert: X509Certificate, at: Date) {
  return new Date(cert.validFrom) <= at && at <= new Date(cert.validTo);
}

/**
 * Verifies an App Store signed transaction. `trustedRootFingerprints` is
 * only overridden by tests.
 */
export function verifyAppStoreTransaction(
  jws: string,
  trustedRootFingerprints: string[] = [APPLE_ROOT_CA_G3_FINGERPRINT]
): VerifyResult {
  const parts = jws.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed_jws" };
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; x5c?: string[] };
  let payload: AppStoreTransaction;
  try {
    header = JSON.parse(b64urlDecode(headerB64).toString("utf8"));
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed_jws" };
  }
  if (header.alg !== "ES256") return { ok: false, reason: "unexpected_alg" };
  if (!Array.isArray(header.x5c) || header.x5c.length < 3) {
    return { ok: false, reason: "missing_chain" };
  }

  let leaf: X509Certificate, intermediate: X509Certificate, root: X509Certificate;
  try {
    [leaf, intermediate, root] = header.x5c
      .slice(0, 3)
      .map((der) => new X509Certificate(Buffer.from(der, "base64")));
  } catch {
    return { ok: false, reason: "bad_certificate" };
  }

  if (!trustedRootFingerprints.includes(root.fingerprint256)) {
    return { ok: false, reason: "untrusted_root" };
  }
  if (
    !leaf.checkIssued(intermediate) ||
    !intermediate.checkIssued(root) ||
    !leaf.verify(intermediate.publicKey) ||
    !intermediate.verify(root.publicKey) ||
    !root.verify(root.publicKey)
  ) {
    return { ok: false, reason: "bad_chain" };
  }
  if (!leaf.raw.includes(LEAF_OID) || !intermediate.raw.includes(INTERMEDIATE_OID)) {
    return { ok: false, reason: "not_app_store_certificate" };
  }

  // Apple signs with the certificates valid at signing time.
  const signedAt = typeof payload.signedDate === "number" ? new Date(payload.signedDate) : new Date();
  if (![leaf, intermediate, root].every((c) => validAt(c, signedAt))) {
    return { ok: false, reason: "certificate_expired" };
  }

  const signatureOk = verifySignature(
    "sha256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    { key: leaf.publicKey, dsaEncoding: "ieee-p1363" },
    b64urlDecode(signatureB64)
  );
  if (!signatureOk) return { ok: false, reason: "bad_signature" };

  if (!payload.transactionId || !payload.originalTransactionId || !payload.bundleId || !payload.productId) {
    return { ok: false, reason: "incomplete_transaction" };
  }
  return { ok: true, transaction: payload };
}
