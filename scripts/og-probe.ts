// A real authenticated private-route diagnostic with a synthetic color swatch.
// This is not human evidence and never creates a mission/report/settlement event.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
if (!process.env.OG_API_KEY) throw new Error("OG_API_KEY is missing");
const image = await sharp({
  create: { width: 32, height: 32, channels: 3, background: "#d5ff4f" },
})
  .png()
  .toBuffer();
const model = process.env.OG_MODEL || "0gm-1.0-35b-a3b";
const response = await fetch(
  `${process.env.OG_BASE_URL || "https://router-api.0g.ai/v1"}/chat/completions`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OG_API_KEY}`,
      "Content-Type": "application/json",
      "X-0G-Provider-Trust-Mode": "private",
    },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model,
      max_tokens: 128,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        {
          role: "system",
          content:
            "This is a technical availability diagnostic, not real mission evidence. Respond with JSON containing the color name only.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "What color is this synthetic swatch?" },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${image.toString("base64")}`,
              },
            },
          ],
        },
      ],
    }),
  },
);
const body = await response.text();
await mkdir("data/diagnostics", { recursive: true });
await writeFile(`data/diagnostics/og-probe-${Date.now()}.json`, body, {
  mode: 0o600,
});
let parsed: Record<string, any> = {};
try {
  parsed = JSON.parse(body);
} catch {
  /* non-JSON upstream failure */
}
let message = String(
  parsed.error?.message || parsed.message || "No structured error message",
);
for (const key of [
  "OG_API_KEY",
  "WORLD_RP_SIGNING_KEY",
  "HEDERA_BUYER_PRIVATE_KEY",
])
  if (process.env[key])
    message = message.replaceAll(process.env[key]!, "[redacted]");
console.log(
  JSON.stringify(
    {
      httpStatus: response.status,
      model,
      requestedTrustMode: "private",
      requestId: parsed.x_0g_trace?.request_id || null,
      responseModel: parsed.model || null,
      ...(response.ok
        ? {
            diagnosticAnswer: parsed.choices?.[0]?.message?.content,
            note: "Actual 0G diagnostic only; no human evidence was verified.",
          }
        : {
            errorCode: parsed.error?.code || null,
            message: message.slice(0, 700),
          }),
    },
    null,
    2,
  ),
);
if (!response.ok) process.exitCode = 1;
