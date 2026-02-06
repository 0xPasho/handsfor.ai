import type { Client } from "yellow-ts";
import type { MessageSigner } from "@erc7824/nitrolite";
import type { Address } from "viem";

export type YellowConnection = {
  client: Client;
  sessionSigner: MessageSigner;
  sessionKeyAddress: Address;
  walletAddress: Address;
};
