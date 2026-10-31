export const CONSENT_VERSION = "kaguvigo-launch-2026-11-01-v1";

export function validateSignup(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Please complete the contact form." };
  const data = value as Record<string, unknown>;
  if (typeof data.website === "string" && data.website.trim()) return { spam: true as const };
  if (typeof data.name !== "string" || typeof data.phone !== "string" || typeof data.email !== "string") return { error: "Please enter your name, phone number and email address." };
  const name = data.name.trim().replace(/\s+/g, " ");
  const email = data.email.trim().toLowerCase();
  const phone = data.phone.trim().replace(/[\s().-]/g, "");
  if (name.length < 2 || name.length > 100 || /[<>\u0000-\u001f]/.test(name) || !/\p{L}/u.test(name)) return { error: "Please enter your name (2–100 characters)." };
  if (data.phone.length > 30 || !/^\+?[0-9]{7,15}$/.test(phone)) return { error: "Please enter a valid phone number, including your country code if possible." };
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return { error: "Please enter a valid email address." };
  if (data.consent !== true) return { error: "Please tick the box to receive KaguviGo launch updates." };
  return { data: { name, email, phone } };
}

export async function readSmallJson(request: Request) {
  const max = 8192;
  // Bound the actual stream rather than trusting Content-Length or leaving a rejected body unread.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_json");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) { await reader.cancel(); throw new Error("too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("invalid_json"); }
}

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
