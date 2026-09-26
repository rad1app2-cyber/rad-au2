// Facebook / Messenger Graph API helpers (server only).

const GRAPH = "https://graph.facebook.com/v21.0";

export function facebookAppId() {
  return process.env["FACEBOOK_APP_ID"] ?? "";
}

function appSecret() {
  return process.env["FACEBOOK_APP_SECRET"] ?? "";
}

export function verifyToken() {
  return process.env["FACEBOOK_VERIFY_TOKEN"] ?? "";
}

async function graph(path: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, init);
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = body?.error?.message ?? `فشل الاتصال بفيسبوك (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body;
}

/** Swaps a short-lived user token for a long-lived one (60 days). */
export async function longLivedUserToken(userToken: string): Promise<string> {
  if (!facebookAppId() || !appSecret()) throw new Error("لم يتم ضبط إعدادات تطبيق فيسبوك");
  const body = await graph(
    `/oauth/access_token?grant_type=fb_exchange_token&client_id=${facebookAppId()}&client_secret=${encodeURIComponent(
      appSecret(),
    )}&fb_exchange_token=${encodeURIComponent(userToken)}`,
  );
  return (body?.access_token as string) ?? userToken;
}

export type FbPage = { id: string; name: string; access_token: string };

/** Lists the Facebook pages the signed-in user manages, with their page tokens. */
export async function listPages(userToken: string): Promise<FbPage[]> {
  const body = await graph(
    `/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`,
  );
  return (body?.data ?? []) as FbPage[];
}

/** Subscribes our app to the page so Messenger messages reach the webhook. */
export async function subscribePage(pageId: string, pageToken: string) {
  return graph(`/${pageId}/subscribed_apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscribed_fields: ["messages", "messaging_postbacks", "messaging_optins"],
      access_token: pageToken,
    }),
  });
}

export async function unsubscribePage(pageId: string, pageToken: string) {
  return graph(`/${pageId}/subscribed_apps?access_token=${encodeURIComponent(pageToken)}`, {
    method: "DELETE",
  });
}

/** Sends a Messenger text message to one user (split to respect the 2000 char limit). */
export async function sendMessengerText(pageId: string, pageToken: string, psid: string, text: string) {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 1900) {
    let cut = rest.lastIndexOf("\n", 1900);
    if (cut < 800) cut = 1900;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.trim()) chunks.push(rest);

  for (const chunk of chunks) {
    await graph(`/${pageId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: psid },
        messaging_type: "RESPONSE",
        message: { text: chunk },
        access_token: pageToken,
      }),
    });
  }
}

/** Verifies Facebook's X-Hub-Signature-256 header over the raw body. */
export async function verifySignature(raw: string, header: string | null): Promise<boolean> {
  const secret = appSecret();
  if (!secret) return false;
  if (!header?.startsWith("sha256=")) return false;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(raw));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Fetches an attachment (voice note, image) and returns it as base64 for the AI. */
export async function fetchAttachment(url: string): Promise<{ data: string; mimetype: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]!);
    return {
      data: btoa(binary),
      mimetype: res.headers.get("content-type") ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}
