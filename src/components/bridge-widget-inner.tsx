"use client";

import { ChainType } from "@lifi/sdk";
import { LiFiWidget } from "@lifi/widget";

const BASE_CHAIN_ID = 8453;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export function BridgeWidgetInner({ toAddress }: { toAddress: string }) {
  return (
    <LiFiWidget
      integrator="handsfor-ai"
      toChain={BASE_CHAIN_ID}
      toToken={USDC_BASE}
      toAddress={{
        address: toAddress,
        chainType: ChainType.EVM,
      }}
      appearance="light"
      hiddenUI={["history", "language", "poweredBy", "walletMenu"]}
      disabledUI={["toToken"]}
      chains={{
        to: { allow: [BASE_CHAIN_ID] },
      }}
      variant="compact"
    />
  );
}
