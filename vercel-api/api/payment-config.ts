import { baseSepolia } from "viem/chains";

import { getConfig, json, options } from "./_shared.js";

export const runtime = "nodejs";

export async function GET() {
  const config = getConfig();

  return json({
    chainId: baseSepolia.id,
    asset: "ETH",
    treasuryAddress: config.treasuryAddress,
    executionFeeWei: config.executionFeeWei.toString(),
  });
}

export const OPTIONS = options;
