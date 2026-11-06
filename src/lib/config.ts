export function integrationStatus() {
  return {
    world: { ready: !!(process.env.WORLD_APP_ID && process.env.WORLD_RP_ID && process.env.WORLD_RP_SIGNING_KEY), environment: process.env.WORLD_ENVIRONMENT || "staging" },
    og: { ready: !!process.env.OG_API_KEY, model: process.env.OG_MODEL || "qwen2.5-vl-72b-instruct", trustMode: process.env.OG_TRUST_MODE || "private" },
    hedera: { ready: !!process.env.HEDERA_MERCHANT_ACCOUNT_ID, network: "hedera:testnet", facilitator: process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator" },
    agent: { ready: !!(process.env.HEDERA_BUYER_ACCOUNT_ID && process.env.HEDERA_BUYER_PRIVATE_KEY && process.env.AGENT_API_TOKEN) },
  };
}
