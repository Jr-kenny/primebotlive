import { describe, expect, it } from "vitest";

import { parseExecuteIntent, parseExecuteRequest } from "../../server/intent";
import { validateTradeAnalysis } from "../../server/opengradient";

describe("PrimeBot deterministic parsing", () => {
  it("accepts an execute request with a treasury payment tx hash", () => {
    const request = parseExecuteRequest({
      prompt: "swap 0.1 ETH to USDC",
      walletAddress: "0x1111111111111111111111111111111111111111",
      paymentTxHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    });

    expect(request.paymentTxHash).toBe("0x1111111111111111111111111111111111111111111111111111111111111111");
  });

  it("parses a valid swap prompt", () => {
    const intent = parseExecuteIntent("swap 0.1 ETH to USDC", ["ETH", "USDC", "WETH"]);

    expect(intent).toEqual({
      action: "swap",
      amount: "0.1",
      tokenIn: "ETH",
      tokenOut: "USDC",
      rawPrompt: "swap 0.1 ETH to USDC",
    });
  });

  it("parses a swap prompt with a post-swap recipient", () => {
    const intent = parseExecuteIntent(
      "swap 0.0001eth to usdc and send to 0x1111111111111111111111111111111111111111",
      ["ETH", "USDC", "WETH"],
    );

    expect(intent).toEqual({
      action: "swap",
      amount: "0.0001",
      tokenIn: "ETH",
      tokenOut: "USDC",
      recipient: "0x1111111111111111111111111111111111111111",
      rawPrompt: "swap 0.0001eth to usdc and send to 0x1111111111111111111111111111111111111111",
    });
  });

  it("parses a transfer prompt with multiple wallet recipients", () => {
    const intent = parseExecuteIntent(
      "transfer 0.000001eth to 0x1111111111111111111111111111111111111111, 0x2222222222222222222222222222222222222222",
      ["ETH", "USDC", "WETH"],
    );

    expect(intent).toEqual({
      action: "transfer",
      amount: "0.000001",
      token: "ETH",
      recipients: [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ],
      rawPrompt:
        "transfer 0.000001eth to 0x1111111111111111111111111111111111111111, 0x2222222222222222222222222222222222222222",
    });
  });

  it("parses a bridge prompt with an optional recipient", () => {
    const intent = parseExecuteIntent(
      "bridge 0.002 ETH to arbitrum sepolia for 0x1111111111111111111111111111111111111111",
      ["ETH", "USDC", "WETH"],
    );

    expect(intent).toEqual({
      action: "bridge",
      amount: "0.002",
      token: "ETH",
      destinationChain: "arbitrum sepolia",
      recipient: "0x1111111111111111111111111111111111111111",
      rawPrompt: "bridge 0.002 ETH to arbitrum sepolia for 0x1111111111111111111111111111111111111111",
    });
  });

  it("rejects invalid prompt shapes", () => {
    expect(() => parseExecuteIntent("buy 0.1 ETH", ["ETH", "USDC", "WETH"])).toThrow(
      /Prompt must follow/,
    );
  });

  it("rejects transfer prompts without wallet addresses", () => {
    expect(() => parseExecuteIntent("transfer 0.000001eth to these wallets", ["ETH", "USDC", "WETH"])).toThrow(
      /must include at least one wallet address/i,
    );
  });
});

describe("PrimeBot analysis validation", () => {
  it("accepts strict JSON that matches the schema", () => {
    const analysis = validateTradeAnalysis(
      JSON.stringify({
        route: "uniswap_v3_direct",
        expectedOut: "101.3 USDC",
        risk: "low",
        reason: "Single-hop liquid pair on Base Sepolia.",
      }),
    );

    expect(analysis.route).toBe("uniswap_v3_direct");
  });

  it("rejects non-JSON model output", () => {
    expect(() => validateTradeAnalysis("```json\n{}\n```")).toThrow(/non-JSON/);
  });

  it("accepts high-risk analysis for downstream quote validation", () => {
    const analysis = validateTradeAnalysis(
      JSON.stringify({
        route: "uniswap_v3_multihop",
        expectedOut: "unknown",
        risk: "high",
        reason: "Liquidity looks unsafe.",
      }),
    );

    expect(analysis.risk).toBe("high");
  });
});
