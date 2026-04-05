import { createAppKit } from "@reown/appkit/react";
import { baseSepolia } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";

const LOCALHOST_PUBLIC_PROJECT_ID = "b56e18d47c72ab683b10814fe9495694";

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || LOCALHOST_PUBLIC_PROJECT_ID;
const networks = [baseSepolia];
const metadata = {
  name: "PrimeBot",
  description: "PrimeBot pay-to-execute DeFi agent",
  url: import.meta.env.VITE_APP_URL || "http://localhost:8080",
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
};

const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  ssr: false,
});

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  metadata,
  networks,
});

export { projectId, wagmiAdapter };
export const wagmiConfig = wagmiAdapter.wagmiConfig;
