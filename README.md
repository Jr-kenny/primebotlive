# PrimeBot

PrimeBot is an intent-based DeFi execution engine powered by verifiable intelligence.

This repository contains the full PrimeBot application:

- a Vite/React frontend with Reown wallet connection
- a Node.js TypeScript backend for deterministic parsing, routing, validation, and execution planning


## Submission Summary

PrimeBot lets a user type plain-language DeFi instructions such as:

- `swap 0.0001 ETH to USDC`
- `swap 0.0001 ETH to USDC and send to 0x...`
- `send 0.000001 ETH to 0x..., 0x...`
- `bridge 0.003 ETH to sepolia`

The system converts that intent into a real execution flow:

1. deterministically parse the prompt without using AI
2. analyze the intent and fetch market/inference context
3. explain the route and risk to the user
4. collect the execution fee from the user wallet
5. build real onchain transactions
6. have the connected wallet sign and broadcast them

This project does not use fake execution data. Swaps, transfers, bridging, treasury payment verification, and OpenGradient-backed analysis all run against live services on Base Sepolia and related testnet infrastructure.

## What Is Implemented

### Frontend

- React + TypeScript + Vite application
- Reown AppKit + Wagmi wallet connection on Base Sepolia
- intent-first UI flow without changing the existing screen progression
- helper modals for prompt creation
- interactive route preference selection before execution
- transaction history embedded inside the chat room

### Backend

- deterministic intent parser
- live `/analyze` endpoint for non-broadcast validation
- live `/execute` endpoint for paid execution planning
- OpenGradient TEE inference integration
- schema validation for all model output
- real swap execution planning with `viem`
- real multi-recipient transfer planning
- real bridge execution planning through Across

### Routing and Venues

- Uniswap V3 direct and multihop route discovery
- Uniswap V2 direct and multihop route discovery
- LI.FI same-chain quote integration
- Across bridge quote and execution path
- optional 0x support when `ZEROX_API_KEY` is available

## Core Architecture

### 1. Deterministic Intent Parsing

Intent extraction is rule-based, not AI-based.

PrimeBot parses:

- action
- amount
- input token
- output token
- recipient wallet
- destination chain

This lives in [server/intent.ts](./server/intent.ts) and the Vercel deployment copy in [vercel-api/server/intent.ts](./vercel-api/server/intent.ts).

### 2. Verifiable Inference Through OpenGradient

PrimeBot uses OpenGradient as the source of truth for inference.

Inference flow:

1. resolve an active TEE from the OpenGradient onchain registry
2. pin the TEE TLS certificate
3. send structured swap analysis input to the TEE endpoint
4. handle OpenGradient's x402 payment challenge
5. pay upstream inference in OPG from the backend wallet
6. require a strict JSON response
7. validate the JSON with a schema before using it

The implementation is in [server/opengradient.ts](./server/opengradient.ts) and [vercel-api/server/opengradient.ts](./vercel-api/server/opengradient.ts).

Expected model output:

```json
{
  "route": "...",
  "expectedOut": "...",
  "risk": "low | medium | high",
  "reason": "..."
}
```

If the TEE response is malformed, missing, or unsafe, PrimeBot rejects it.

### 3. User Payment Model

PrimeBot does not require end users to hold OPG.

Current payment design:

- the user pays PrimeBot in native Base Sepolia ETH
- the user sends ETH directly from the connected frontend wallet to the configured treasury
- the backend verifies that treasury payment onchain before allowing execution
- PrimeBot then pays OpenGradient upstream in OPG on the backend side

This keeps the user UX simple while preserving real OpenGradient payment.

The payment verification logic is in [server/payment.ts](./server/payment.ts) and [vercel-api/server/payment.ts](./vercel-api/server/payment.ts).

### 4. Execution Model

PrimeBot does not broadcast from the backend on behalf of the user.

Instead:

- backend analyzes and plans the transaction
- backend returns executable transaction payloads
- frontend wallet signs and broadcasts them

That preserves user control over funds while still letting PrimeBot handle routing, validation, and planning.

## Supported Intent Types

PrimeBot currently executes these intent classes:

- `swap`
- `send`
- `transfer`
- `bridge`

Accepted prompt grammar:

- `swap <amount> <tokenIn> to <tokenOut>`
- `swap <amount> <tokenIn> for <tokenOut>`
- `swap <amount><tokenIn> to <tokenOut> and send to <wallet>`
- `bridge <amount><token> to <destination chain>`
- `bridge <amount><token> to <destination chain> for <wallet>`
- `transfer <amount><token> to <wallet1>, <wallet2>, ...`
- `send <amount><token> to <wallet1>, <wallet2>, ...`

Transfer fanout supports up to `100` wallet addresses per request.

Not yet implemented for execution:

- LP provisioning
- yield strategy execution
- bridge-and-swap compound flows

## Supported Assets and Token Graph

Out of the box, PrimeBot supports:

- `ETH`
- `WETH`
- `USDC`

This deployment also includes `EURC` when configured.

The token graph can be expanded through environment variables without changing code:

- `BASE_SEPOLIA_USDT_ADDRESS`
- `BASE_SEPOLIA_DAI_ADDRESS`
- `BASE_SEPOLIA_EURC_ADDRESS`
- `BASE_SEPOLIA_CBBTC_ADDRESS`
- `BASE_SEPOLIA_CBETH_ADDRESS`
- `BASE_SEPOLIA_EXTRA_TOKENS_JSON`

## Route Selection

PrimeBot is not hardcoded to one pool.

The swap engine evaluates available candidates from supported venues, scores them deterministically, and then lets the user choose a preference in the frontend:

- PrimeBot pick
- best return
- safer route
- lower gas

When all available paths collapse to the same route, the UI still remains consistent, but PrimeBot reports that only one viable route was found.

The route engine lives in [server/swap.ts](./server/swap.ts) and [vercel-api/server/swap.ts](./vercel-api/server/swap.ts).

## API Surface

### `GET /health`

Returns backend status, chain id, supported tokens, and supported venues.

### `GET /payment-config`

Returns the treasury address and ETH execution fee required before `/execute`.

### `POST /analyze`

Analyzes a prompt without broadcasting any transaction.

Example request:

```json
{
  "prompt": "swap 0.0001 ETH to USDC",
  "routePreference": "balanced"
}
```

Example response shape:

```json
{
  "intent": {
    "action": "swap",
    "amount": "0.0001",
    "tokenIn": "ETH",
    "tokenOut": "USDC",
    "rawPrompt": "swap 0.0001 ETH to USDC"
  },
  "analysis": {
    "route": "uniswap_v3_direct",
    "expectedOut": "0.049745 USDC",
    "risk": "medium",
    "reason": "PrimeBot found a live route and estimated the expected output."
  }
}
```

### `POST /execute`

Executes the paid flow after treasury payment has been made and verified.

Example request:

```json
{
  "prompt": "swap 0.0001 ETH to USDC",
  "walletAddress": "0x...",
  "paymentTxHash": "0x...",
  "routePreference": "balanced"
}
```

Example response shape:

```json
{
  "analysis": {
    "route": "uniswap_v3_direct",
    "expectedOut": "0.049745 USDC",
    "risk": "medium",
    "reason": "PrimeBot selected a live route and built the execution plan."
  },
  "execution": {
    "kind": "swap",
    "chainId": 84532,
    "txs": [
      {
        "to": "0x...",
        "data": "0x...",
        "value": "100000000000000"
      }
    ]
  }
}
```

The frontend then signs and broadcasts the returned transaction objects.

## Deployment Architecture

PrimeBot is deployed as two Vercel projects:

- frontend project: [https://primebot-sigma.vercel.app](https://primebot-sigma.vercel.app)
- backend project: [https://primebot-api.vercel.app](https://primebot-api.vercel.app)

The frontend uses [vercel.json](./vercel.json) to rewrite `/api/*` to the backend project, so the browser can treat the system as one app.

The backend Vercel project lives in [vercel-api/](./vercel-api) and exposes:

- `/health`
- `/payment-config`
- `/analyze`
- `/execute`

## Local Development

1. Copy `.env.example` to `.env`
2. set a funded Base Sepolia private key
3. install dependencies:

```bash
pnpm install
```

Run locally:

```bash
pnpm server:dev
pnpm dev
```

Default local ports:

- frontend: `http://localhost:8080`
- backend: `http://localhost:8787`

## Environment Requirements

Important environment variables:

- `PRIMEBOT_PRIVATE_KEY`
- `TREASURY_ADDRESS`
- `EXECUTION_FEE_WEI`
- `BASE_RPC_URL`
- `VITE_REOWN_PROJECT_ID`
- `VITE_APP_URL`
- `OPENGRADIENT_MODEL`
- `OPENGRADIENT_SETTLEMENT_TYPE`

Optional integrations:

- `ZEROX_API_KEY` for live 0x routing
- extra token address envs for expanding the token graph

## Real Infrastructure and Contracts

OpenGradient:

- network RPC: `https://ogevmdevnet.opengradient.ai`
- TEE registry: `0x4e72238852f3c918f4E4e57AeC9280dDB0c80248`

Base Sepolia Uniswap:

- V3 factory: `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`
- V3 quoter: `0xC5290058841028F1614F3A6F0F5816cAd0df5E27`
- V3 router: `0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4`
- V2 factory: `0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e`
- V2 router: `0x1689E7B1F10000AE47eBfE339a4f69dECd19F602`

Aggregation and bridge endpoints:

- LI.FI: `https://li.quest/v1`
- Across testnet API: `https://testnet.across.to/api`
- 0x Swap API: `https://api.0x.org`

## Verification Status

The system has already been verified against live testnet infrastructure during development:

- real ETH treasury payment verification
- real Base Sepolia swaps
- real wallet-to-wallet transfers
- real swap-and-send execution
- real Across bridge execution
- real OpenGradient-backed analysis flow

## Known Production Gaps

The app is live, but these are still the main production hardening tasks:

- replace file-based payment ledger storage with a real database
- persist deployment env vars in Vercel project settings instead of relying only on CLI deploy flags
- expand venue coverage beyond the currently verified set
- implement LP and yield execution only when backed by real protocol integrations

## Test Commands

```bash
pnpm build
pnpm build:server
pnpm test -- --runInBand
pnpm exec tsc -p vercel-api/tsconfig.json --noEmit
```

## References

- [Base Ecosystem Contracts](https://docs.base.org/base-chain/network-information/ecosystem-contracts)
- [0x Swap API Docs](https://docs.0x.org/docs/0x-swap-api/introduction)
- [LI.FI API Parameters](https://docs.li.fi/composer/reference/api-parameters)
- [Across Swap API](https://docs.across.to/introduction/swap-api)
- [OpenGradient x402 Gateway](https://docs.opengradient.ai/developers/x402/)
- [OpenGradient Verifiable LLM Inference](https://docs.opengradient.ai/developers/sdk/llm.html)
