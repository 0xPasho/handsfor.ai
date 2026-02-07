const environment = {
  DATABASE_URL: process.env.DATABASE_URL!,
  APP_URL: process.env.APP_URL!,
  SESSION_SECRET: process.env.SESSION_SECRET!,
  NODE_ENV: process.env.NODE_ENV!,
  NETWORK_MODE: (process.env.NETWORK_MODE as "testnet" | "production") || "testnet",
  PLATFORM_WALLET_ADDRESS: process.env.PLATFORM_WALLET_ADDRESS!,
  PLATFORM_WALLET_PRIVATE_KEY: process.env.PLATFORM_WALLET_PRIVATE_KEY!,
  PRIVY_APP_ID: process.env.PRIVY_APP_ID!,
  PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET!,
  PRIVY_AUTHORIZATION_PRIVATE_KEY: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!,
  PRIVY_AUTHORIZATION_PUBLIC_KEY: process.env.PRIVY_AUTHORIZATION_PUBLIC_KEY!,
  YELLOW_WS_URL: process.env.YELLOW_WS_URL!,
  X402_FACILITATOR_URL: process.env.X402_FACILITATOR_URL!,
};

const serverData = {
  appName: "Just",
  environment,
  isTestnet: environment.NETWORK_MODE === "testnet",
  isProduction: environment.NETWORK_MODE === "production",
};

export { serverData };
