import { analyzeTradeIntent } from "../server/opengradient.js";
import { parseExecuteIntent, parseExecuteRequest } from "../server/intent.js";
import { previewBridge } from "../server/bridge.js";
import { previewSwap } from "../server/swap.js";
import { previewTransfer } from "../server/transfer.js";
import { getConfig, getPublicClient, handleError, json, options, readJson } from "./_shared.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const config = getConfig();
    const publicClient = getPublicClient();
    const { prompt, routePreference } = parseExecuteRequest(await readJson<unknown>(request));
    const intent = parseExecuteIntent(prompt, Object.keys(config.tokens));
    const result =
      intent.action === "swap"
        ? await previewSwap(
            config,
            publicClient,
            intent,
            await analyzeTradeIntent(config, intent),
            routePreference,
          )
        : intent.action === "bridge"
          ? await previewBridge(config, intent)
          : await previewTransfer(config, publicClient, intent);

    return json({
      intent,
      ...result,
    });
  } catch (error) {
    return handleError(error);
  }
}

export const OPTIONS = options;
