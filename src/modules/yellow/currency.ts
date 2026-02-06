export function getYellowCurrency() {
  const networkMode = process.env.NETWORK_MODE || "testnet";
  return networkMode === "production" ? "usdc" : "ytest.usd";
}
