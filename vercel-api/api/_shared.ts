import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

import { AppError, toErrorResponse } from "../server/errors.js";
import { loadConfig } from "../server/config.js";

const config = loadConfig();

export function getConfig() {
  return config;
}

export function getPublicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(config.baseRpcUrl),
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AppError(400, "invalid_request", "Request body must be valid JSON.");
  }
}

export function json(body: unknown, init?: ResponseInit) {
  return withCors(
    Response.json(body, {
      ...init,
      headers: {
        "Cache-Control": "no-store",
        ...(init?.headers ?? {}),
      },
    }),
  );
}

export function handleError(error: unknown) {
  const failure = toErrorResponse(error);
  return json(failure.body, { status: failure.statusCode });
}

export function options() {
  return withCors(
    new Response(null, {
      status: 204,
    }),
  );
}

function withCors(response: Response) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return response;
}
