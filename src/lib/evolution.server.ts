const base = () => (process.env["EVOLUTION_API_URL"] ?? "").trim().replace(/\/+$/, "");

class EvolutionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call(path: string, init?: RequestInit) {
  const keys = [...new Set([process.env["AUTHENTICATION_API_KEY"], process.env["EVOLUTION_API_KEY"]].map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
  if (!base() || !keys.length) throw new Error("لم يتم ضبط إعدادات خادم واتساب");
  let res: Response | undefined;
  for (const key of keys) {
    try {
      res = await fetch(`${base()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(12000),
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(init?.headers ?? {}),
    },
  });
    } catch {
      throw new Error("تعذّر الوصول إلى خادم واتساب. تأكد من تشغيله وصحة عنوانه.");
    }
    if (res.status !== 401 && res.status !== 403) break;
  }
  if (!res) throw new Error("تعذّر الاتصال بخادم واتساب");
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    if (res.status === 404 && /application not found/i.test(text)) {
      throw new EvolutionError("عنوان خادم واتساب الحالي لا يشير إلى تطبيق يعمل. حدّث EVOLUTION_API_URL بعنوان خادم Evolution المشغّل ثم حاول مجددًا.", res.status);
    }
    if (res.status === 401 || res.status === 403) {
      throw new EvolutionError("خادم واتساب رفض مفتاح الاتصال. حدّث مفتاح Evolution ثم حاول مجددًا.", res.status);
    }
    const msg =
      (body as { message?: string; error?: string } | null)?.message ??
      (body as { error?: string } | null)?.error ??
      `فشل الاتصال بخادم واتساب (${res.status})`;
    throw new EvolutionError(typeof msg === "string" ? msg : JSON.stringify(msg), res.status);
  }
  return body as Record<string, unknown>;
}

export async function createInstance(instanceName: string, number: string, webhookUrl: string) {
  return call("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      number: number.replace(/\D/g, ""),
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });
}

export async function connectInstance(instanceName: string, number?: string) {
  const q = number ? `?number=${encodeURIComponent(number.replace(/\D/g, ""))}` : "";
  return call(`/instance/connect/${encodeURIComponent(instanceName)}${q}`, { method: "GET" });
}

/** Reuse existing sessions; only tolerate the API's explicit duplicate-instance response. */
export async function prepareInstance(instanceName: string, number: string, webhookUrl: string) {
  try {
    return await createInstance(instanceName, number, webhookUrl);
  } catch (error) {
    if (!(error instanceof EvolutionError) || ![403, 409].includes(error.status) || !/already|exist|use|موجود/i.test(error.message)) throw error;
    await setWebhook(instanceName, webhookUrl);
    return null;
  }
}

function pairingValue(payload: unknown, field: "pairingCode" | "base64"): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const value = row[field];
  if (typeof value === "string" && value.trim()) return value.trim();
  for (const key of ["qrcode", "data", "response"]) {
    const nested = pairingValue(row[key], field);
    if (nested) return nested;
  }
  return null;
}

export async function generatePairing(instanceName: string, number: string, webhookUrl: string, pairing = true) {
  if (!/^[1-9]\d{7,14}$/.test(number.replace(/\D/g, ""))) throw new Error("أدخل رقم واتساب كاملًا مع رمز الدولة");
  const created = await prepareInstance(instanceName, number, webhookUrl);
  const state = await instanceState(instanceName);
  const instance = state["instance"] as { state?: string } | undefined;
  if ((instance?.state ?? state["state"]) === "open") return { pairingCode: null, qr: null, connected: true };
  let payload = created;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    if (attempt === 0 || !pairingValue(payload, pairing ? "pairingCode" : "base64")) {
      payload = await connectInstance(instanceName, pairing ? number : undefined);
    }
    const code = pairingValue(payload, "pairingCode");
    const qr = pairingValue(payload, "base64");
    if (pairing ? code : qr) return { pairingCode: code, qr, connected: false };
  }
  throw new Error("خادم واتساب لم يُرجع كودًا بعد الانتظار. تأكد من تشغيل جلسة واتساب ثم أعد المحاولة.");
}

export async function instanceState(instanceName: string) {
  return call(`/instance/connectionState/${encodeURIComponent(instanceName)}`, { method: "GET" });
}

export async function logoutInstance(instanceName: string) {
  return call(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function deleteInstance(instanceName: string) {
  try {
    await logoutInstance(instanceName);
  } catch {
    /* ignore */
  }
  try {
    await call(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
}

export async function setWebhook(instanceName: string, webhookUrl: string) {
  return call(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });
}

/** Downloads a media message (audio/image/video/document) as base64. */
export async function getMediaBase64(instanceName: string, messageKeyId: string) {
  const res = (await call(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ message: { key: { id: messageKeyId } }, convertToMp4: false }),
  })) as { base64?: string; mimetype?: string; mediaType?: string };
  return { base64: res?.base64 ?? "", mimetype: res?.mimetype ?? "" };
}

export async function sendText(instanceName: string, number: string, text: string) {
  return call(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number: number.replace(/\D/g, ""), text }),
  });
}

export async function sendImage(instanceName: string, number: string, url: string, caption = "") {
  return call(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number: number.replace(/\D/g, ""), mediatype: "image", media: url, caption }),
  });
}

export async function sendVideo(instanceName: string, number: string, url: string, caption = "") {
  return call(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number: number.replace(/\D/g, ""), mediatype: "video", media: url, caption }),
  });
}
