# PrimeBot

Production-grade TypeScript Express backend for a pay-to-execute DeFi agent on Base Sepolia.

## What It Does

- `POST /execute` requires a real Base Sepolia ETH payment to the PrimeBot treasury before execution.
- `POST /analyze` preserves the frontend review flow without broadcasting a transaction.
- Prompt parsing is deterministic. No AI is used to extract the trade intent.
- OpenGradient is called through its real x402-gated TEE endpoint, resolved from the on-chain TEE registry by default.
- The TEE response must be strict JSON and passes a validation layer before execution.
- Swaps execute on Base Sepolia through a deterministic route scorer that compares official Uniswap V2 and V3 routes, including direct and multi-hop paths across configured tokens.
- Swaps also query LI.FI's public quote API for same-chain aggregation on Base Sepolia and compare that route when quotes are available.
- If `ZEROX_API_KEY` is set, PrimeBot also queries the live 0x Swap API as an aggregated venue and compares it against onchain Uniswap routes.
- Bridges execute through Across on Base Sepolia testnet and return the real approval plus origin-chain bridge transactions for the connected wallet to sign.

## Supported Prompt Shape

```json
{
  "prompt": "swap 0.1 ETH to USDC"
}
```

Accepted grammar:

- `swap <amount> <tokenIn> to <tokenOut>`
- `swap <amount> <tokenIn> for <tokenOut>`
- `swap <amount><tokenIn> to <tokenOut> and send to <wallet>`
- `bridge <amount><token> to <destination chain>`
- `bridge <amount><token> to <destination chain> for <wallet>`
- `transfer <amount><token> to <wallet1>, <wallet2>, ...`
- `send <amount><token> to <wallet1>, <wallet2>, ...`

Out of the box, the backend supports `ETH`, `WETH`, and `USDC`.
Transfer prompts support up to `100` wallet addresses per request.

You can expand the routing graph without touching code by setting any of:

- `BASE_SEPOLIA_USDT_ADDRESS`
- `BASE_SEPOLIA_DAI_ADDRESS`
- `BASE_SEPOLIA_EURC_ADDRESS`
- `BASE_SEPOLIA_CBBTC_ADDRESS`
- `BASE_SEPOLIA_CBETH_ADDRESS`
- `BASE_SEPOLIA_EXTRA_TOKENS_JSON`

If you want the sample `swap 0.1 ETH to USDT` prompt to execute, set `BASE_SEPOLIA_USDT_ADDRESS` in `.env`.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `PRIMEBOT_PRIVATE_KEY` to a funded Base Sepolia wallet.
3. Fund that wallet with:
   - Base Sepolia ETH for gas
   - Base Sepolia OPG for OpenGradient x402 inference payments
   - treasury ETH liquidity if you want a separate treasury address from the backend signer
4. Install dependencies:

```bash
pnpm install
```

## Run

Development:

```bash
pnpm server:dev
pnpm dev
```

Default local ports:

- frontend: `http://localhost:8080`
- backend: `http://localhost:8787`

Wallet connection:

- The frontend uses Reown AppKit with Wagmi for real wallet connection.
- Set `VITE_REOWN_PROJECT_ID` to your Reown project ID for production or shared development environments.
- The app targets Base Sepolia and uses the currently connected wallet for treasury payment signing and transaction execution.

Build:

```bash
pnpm build:server
pnpm server:start
```

## Vercel Split

- The root project is the frontend deployment.
- `vercel-api/` is the Vercel-ready backend deployment that exposes the same `/health`, `/payment-config`, `/analyze`, and `/execute` paths through Vercel Functions.
- If you deploy both projects on Vercel, point `VITE_PRIMEBOT_API_URL` in the frontend project at the backend project's URL.

## Real Integrations

- OpenGradient network RPC for TEE discovery: `https://ogevmdevnet.opengradient.ai`
- OpenGradient TEE registry: `0x4e72238852f3c918f4E4e57AeC9280dDB0c80248`
- Optional direct TEE override: `OPENGRADIENT_URL`
- OpenGradient upstream inference asset: `$OPG` on Base Sepolia
- `/execute` user payment asset: native `ETH` sent directly to the configured treasury address
- Optional aggregated venue: 0x Swap API v2 through `https://api.0x.org` when `ZEROX_API_KEY` is configured
- Public same-chain aggregator venue: LI.FI through `https://li.quest/v1`
- Testnet bridge venue: Across through `https://testnet.across.to/api`
- Base Sepolia Uniswap contracts:
  - `v3CoreFactory`: `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`
  - `quoterV2`: `0xC5290058841028F1614F3A6F0F5816cAd0df5E27`
  - `swapRouter`: `0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4`
  - `v2Factory`: `0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e`
  - `v2Router`: `0x1689E7B1F10000AE47eBfE339a4f69dECd19F602`

Those Base Sepolia addresses come from Base's ecosystem contract documentation:
[Base Ecosystem Contracts](https://docs.base.org/base-chain/network-information/ecosystem-contracts)

The optional aggregated venue follows the 0x Swap API docs:
[0x Docs](https://docs.0x.org/docs/0x-swap-api/introduction)

LI.FI's quote API and chain/tool registries are here:
[LI.FI API Parameters](https://docs.li.fi/composer/reference/api-parameters)

Across swap and deposit tracking docs are here:
[Across Swap API](https://docs.across.to/introduction/swap-api)

## Test

```bash
pnpm test
```
