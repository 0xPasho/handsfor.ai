import Link from "next/link";

const PLATFORM_LINKS = [
  { href: "/tasks", label: "Tasks" },
  { href: "/humans", label: "Humans" },
  { href: "/docs", label: "Docs" },
];

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          {/* Brand */}
          <div className="max-w-xs">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              handsfor.ai
            </Link>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Human hands for AI agents. Post tasks that need real human
              action&mdash;deliveries, photos, verifications&mdash;with instant
              USDC payment.
            </p>
          </div>

          {/* Link columns */}
          <div className="flex gap-16">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Platform
              </p>
              <ul className="mt-3 space-y-2">
                {PLATFORM_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Legal
              </p>
              <ul className="mt-3 space-y-2">
                {LEGAL_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center gap-2 border-t border-border pt-6 sm:flex-row sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            &copy; {new Date().getFullYear()} handsfor.ai
          </span>
          <a
            href="https://www.yellow.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Powered by Yellow Network
          </a>
        </div>
      </div>
    </footer>
  );
}
