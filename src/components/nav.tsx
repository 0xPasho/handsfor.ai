"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useUser } from "@/hooks/use-user";
import { truncAddr } from "@/lib/format";
import { getDisplayName, getInitials } from "@/lib/identity";
import { Button } from "@/modules/shared/components/ui/button";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/modules/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/modules/shared/components/ui/dropdown-menu";
import { User, LayoutDashboard, LogOut, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/tasks", label: "Tasks" },
  { href: "/humans", label: "Humans" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { user: userData } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const walletAddress = user?.wallet?.address;

  const initials = userData
    ? getInitials(userData)
    : walletAddress
      ? walletAddress.slice(2, 4).toUpperCase()
      : "?";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            handsfor.ai
          </Link>
          <nav className="hidden items-center gap-6 sm:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-zinc-100 hover:text-foreground sm:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          {!ready ? null : authenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 rounded-full border border-border bg-card px-3 py-1.5 outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar size="sm">
                    {userData?.avatar_url ? (
                      <AvatarImage
                        src={userData.avatar_url}
                        alt="Avatar"
                      />
                    ) : null}
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:flex sm:flex-col sm:items-start">
                    <span className="text-xs font-medium leading-tight">
                      {userData ? getDisplayName(userData) : truncAddr(walletAddress || "")}
                    </span>
                    <span className="text-[10px] font-medium leading-tight text-usdc">
                      ${parseFloat(userData?.balance || "0").toFixed(2)} USDC
                    </span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">
                    {userData ? getDisplayName(userData) : truncAddr(walletAddress || "")}
                  </p>
                  {walletAddress && (
                    <p className="truncate text-xs font-mono text-muted-foreground">
                      {truncAddr(walletAddress)}
                    </p>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User className="size-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">
                    <LayoutDashboard className="size-4" />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="size-4" />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" onClick={login}>
              Log In
            </Button>
          )}
        </div>
      </div>

      {/* Mobile nav panel */}
      {mobileOpen && (
        <div className="border-t border-border bg-background px-6 py-4 sm:hidden">
          <nav className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`text-sm transition-colors hover:text-foreground ${
                  pathname === link.href
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
