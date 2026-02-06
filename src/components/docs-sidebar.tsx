"use client";

import { useEffect, useState } from "react";
import { cn } from "@/modules/shared/utils";

type SidebarSection = {
  id: string;
  label: string;
};

export function DocsSidebar({ sections }: { sections: SidebarSection[] }) {
  const [active, setActive] = useState(sections[0]?.id || "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="sticky top-20 hidden lg:block">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        On this page
      </p>
      <ul className="space-y-1">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={cn(
                "block py-1 text-sm transition-colors",
                active === s.id
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
