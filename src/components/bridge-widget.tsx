"use client";

import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/modules/shared/components/ui/dialog";

const LiFiWidgetLazy = dynamic(
  () => import("./bridge-widget-inner").then((m) => m.BridgeWidgetInner),
  { ssr: false, loading: () => <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading bridge...</div> },
);

interface BridgeWidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toAddress: string;
}

export function BridgeWidget({ open, onOpenChange, toAddress }: BridgeWidgetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle>Bridge to Base</DialogTitle>
          <DialogDescription>
            Swap any token from any chain to USDC on Base.
          </DialogDescription>
        </DialogHeader>
        <div className="px-2 pb-2">
          {open && <LiFiWidgetLazy toAddress={toAddress} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
