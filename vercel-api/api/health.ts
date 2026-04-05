import { baseSepolia } from "viem/chains";

import { getConfig, json, options } from "./_shared.js";

export const runtime = "nodejs";

export async function GET() {
  const config = getConfig();

  return json({
    ok: true,
    chainId: baseSepolia.id,
    supportedTokens: Object.keys(config.tokens),
    supportedVenues: [
      "uniswap_v3",
      "uniswap_v2",
      ...(config.across.enabled ? ["across"] : []),
      ...(config.liFi.enabled ? ["lifi"] : []),
      ...(config.zeroEx.enabled ? ["zeroex"] : []),
    ],
  });
}

export const OPTIONS = options;
