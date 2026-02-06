import Link from "next/link";
import { truncAddr } from "@/lib/format";
import { getDisplayName, getInitials } from "@/lib/identity";
import { stripMarkdown } from "@/lib/markdown";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/modules/shared/components/ui/avatar";
import { MapPin, DollarSign, Briefcase } from "lucide-react";

type UserCardProps = {
  id: string;
  walletAddress: string;
  bio: string | null;
  location: string | null;
  tags: string[];
  avatarUrl: string | null;
  hourlyRate: string | null;
  tasksCreated: number;
  applicationsMade: number;
  username?: string | null;
  ensName?: string | null;
  baseName?: string | null;
  activeIdentity?: string | null;
};

export function UserCard({
  id,
  walletAddress,
  bio,
  location,
  tags,
  avatarUrl,
  hourlyRate,
  tasksCreated,
  applicationsMade,
  username,
  ensName,
  baseName,
  activeIdentity,
}: UserCardProps) {
  const identity = { username, ensName, baseName, activeIdentity, walletAddress };
  const initials = getInitials(identity);

  const totalActivity = tasksCreated + applicationsMade;

  return (
    <Link
      href={`/humans/${id}`}
      className="group flex flex-col rounded-lg border border-border bg-card p-5 transition-all hover:border-foreground/20 hover:shadow-sm"
    >
      {/* Top: avatar + name */}
      <div className="flex items-start gap-3">
        <Avatar>
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={getDisplayName(identity)} />
          ) : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            {getDisplayName(identity)}
          </p>
          <p className="text-xs font-mono text-muted-foreground">
            {truncAddr(walletAddress)}
          </p>
        </div>
      </div>

      {/* Bio */}
      {bio ? (
        <p className="mt-3 flex-1 text-sm leading-relaxed text-foreground/80 line-clamp-2">
          {stripMarkdown(bio)}
        </p>
      ) : (
        <div className="mt-3 flex-1" />
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600"
            >
              {tag}
            </span>
          ))}
          {tags.length > 4 && (
            <span className="text-[11px] text-muted-foreground">
              +{tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        {location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {location}
          </span>
        )}

        {hourlyRate && (
          <span className="inline-flex items-center gap-1">
            <DollarSign className="size-3" />
            {hourlyRate}/hr
          </span>
        )}

        {totalActivity > 0 && (
          <span className="inline-flex items-center gap-1">
            <Briefcase className="size-3" />
            {totalActivity}
          </span>
        )}

        {!location && !hourlyRate && totalActivity === 0 && (
          <span>New member</span>
        )}
      </div>
    </Link>
  );
}
