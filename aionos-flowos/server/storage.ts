// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.

import crypto from "node:crypto";
import { ENV } from "./_core/env";

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error("Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY");
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePresignPut(relKey: string) {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const response = await fetch(presignUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!response.ok) throw new Error(`Storage presign failed (${response.status})`);
  const body = (await response.json()) as { url?: string };
  if (!body.url) throw new Error("Forge returned empty presign URL");
  return { key, uploadUrl: body.url };
}

export async function storagePut(relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream"): Promise<{ key: string; url: string }> {
  const { uploadUrl, key } = await storagePresignPut(appendHashSuffix(relKey));
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data as any], { type: contentType });
  const uploadResp = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
  if (!uploadResp.ok) throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const resp = await fetch(getUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!resp.ok) throw new Error(`Storage signed URL failed (${resp.status})`);
  const { url } = (await resp.json()) as { url?: string };
  if (!url) throw new Error("Forge returned empty signed URL");
  return url;
}
