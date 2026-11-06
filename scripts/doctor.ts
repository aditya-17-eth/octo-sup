import { integrationStatus } from "../src/lib/config";
const status = integrationStatus();
console.log(
  "REALITY.EXE integration preflight. This does not run inference, prove identity, or settle funds.",
);
for (const [name, config] of Object.entries(status))
  console.log(
    `${name}: ${config.ready ? "configuration present (not authenticated)" : "missing configuration"}`,
  );
console.log(
  `World environment: ${status.world.environment}; 0G trust requested: ${status.og.trustMode}`,
);
let failed = false;
try {
  const r = await fetch(`${status.hedera.facilitator}/supported`, {
    signal: AbortSignal.timeout(20000),
  });
  const supported = await r.json();
  const kind = supported.kinds?.find(
    (k: { x402Version: number; network: string; scheme: string }) =>
      k.x402Version === 2 &&
      k.network === "hedera:testnet" &&
      k.scheme === "exact",
  );
  if (!r.ok || !kind?.extra?.feePayer)
    throw new Error("No Hedera testnet exact capability with fee payer");
  console.log(
    `Facilitator discovery: live hedera:testnet, fee payer ${kind.extra.feePayer}`,
  );
} catch (e) {
  failed = true;
  console.error("Facilitator discovery failed:", (e as Error).message);
}
try {
  const r = await fetch(
    `${process.env.OG_BASE_URL || "https://router-api.0g.ai/v1"}/models`,
    { signal: AbortSignal.timeout(20000) },
  );
  const catalog = await r.json(),
    model = catalog.data?.find((m: { id: string }) => m.id === status.og.model);
  if (!r.ok || !model?.architecture?.input_modalities?.includes("image"))
    throw new Error("Selected model is absent or lacks image input");
  console.log(
    `0G catalog: ${model.id} accepts image input. Provider compatibility with requested trust mode still requires a real inference call.`,
  );
  const providersResponse = await fetch(
    `${process.env.OG_BASE_URL || "https://router-api.0g.ai/v1"}/providers?model=${encodeURIComponent(model.id)}`,
    { signal: AbortSignal.timeout(20000) },
  );
  const providers = await providersResponse.json();
  const eligible = providers.data?.filter(
    (p: {
      trust_mode: string;
      is_healthy: boolean;
      architecture?: { input_modalities?: string[] };
      supported_formats?: string[];
    }) =>
      (status.og.trustMode === "private"
        ? p.trust_mode === "private"
        : ["private", "verified"].includes(p.trust_mode)) &&
      p.is_healthy &&
      p.architecture?.input_modalities?.includes("image") &&
      p.supported_formats?.includes("openai"),
  );
  if (!providersResponse.ok || !eligible?.length)
    throw new Error(
      `No healthy ${status.og.trustMode} image-input provider is currently advertised for ${model.id}. Keep evidence locked; contact 0G or explicitly change the demo privacy policy.`,
    );
  console.log(
    `0G provider preflight: ${eligible.length} compatible provider(s) advertised. Authentication and actual inference are still untested.`,
  );
} catch (e) {
  failed = true;
  console.error("0G catalog check failed:", (e as Error).message);
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  console.log("Set SESSION_SECRET >=32 characters before production use.");
if (failed) process.exitCode = 1;
export {};
