import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const configured = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!configured) throw new Error("Credential encryption is not configured.");
  const value = Buffer.from(configured, "base64");
  if (value.length !== 32) throw new Error("Credential encryption key must contain 32 bytes.");
  return value;
}

/** Server-only vault utility. Never import this module into a client component. */
export function encryptCredential(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from("algofort-vault-v1"));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptCredential(encoded: string) {
  const [version, iv, tag, content, extra] = encoded.split(":");
  if (version !== "v1" || !iv || !tag || content === undefined || extra !== undefined) throw new Error("Invalid credential record.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from("algofort-vault-v1"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(content, "base64")), decipher.final()]).toString("utf8");
}
