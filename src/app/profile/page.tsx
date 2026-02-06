"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useUser } from "@/hooks/use-user";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/modules/shared/components/ui/avatar";
import { Button } from "@/modules/shared/components/ui/button";
import { Input } from "@/modules/shared/components/ui/input";
import { Textarea } from "@/modules/shared/components/ui/textarea";
import { Separator } from "@/modules/shared/components/ui/separator";
import { Skeleton } from "@/modules/shared/components/ui/skeleton";
import { TagInput } from "@/components/tag-input";
import { truncAddr } from "@/lib/format";
import { MapPin, Globe, DollarSign } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const { ready, authenticated, getToken } = useAuth();
  const { user, loading, error, refetch } = useUser();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [githubHandle, setGithubHandle] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "");
      setBio(user.bio || "");
      setLocation(user.location || "");
      setTags(user.tags || []);
      setAvatarUrl(user.avatar_url || "");
      setTwitterHandle(user.twitter_handle || "");
      setGithubHandle(user.github_handle || "");
      setWebsiteUrl(user.website_url || "");
      setHourlyRate(user.hourly_rate || "");
    }
  }, [user]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const token = await getToken();
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          display_name: displayName || null,
          bio: bio || null,
          location: location || null,
          tags,
          avatar_url: avatarUrl || null,
          twitter_handle: twitterHandle || null,
          github_handle: githubHandle || null,
          website_url: websiteUrl || null,
          hourly_rate: hourlyRate || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setSaved(true);
      await refetch();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [
    displayName,
    bio,
    location,
    tags,
    avatarUrl,
    twitterHandle,
    githubHandle,
    websiteUrl,
    hourlyRate,
    getToken,
    refetch,
  ]);

  if (!ready || !authenticated) return null;

  if (loading) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <Skeleton className="mb-6 h-8 w-40" />
        <Skeleton className="mb-4 h-16 w-16 rounded-full" />
        <Skeleton className="mb-3 h-10 w-full" />
        <Skeleton className="mb-3 h-10 w-full" />
        <Skeleton className="mb-3 h-24 w-full" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-10 text-center">
        <p className="text-sm text-destructive">{error || "Failed to load"}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={refetch}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your public profile on Hands for AI.
      </p>

      {/* Avatar + name header */}
      <div className="mt-8 flex items-center gap-4">
        <Avatar className="size-16">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={displayName || "Avatar"} />
          ) : null}
          <AvatarFallback className="text-lg">
            {displayName
              ? displayName.charAt(0).toUpperCase()
              : user.wallet_address.slice(2, 4).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {displayName || truncAddr(user.wallet_address)}
          </p>
          <p className="truncate text-xs font-mono text-muted-foreground">
            {truncAddr(user.wallet_address)}
          </p>
        </div>
      </div>

      <Separator className="my-8" />

      {/* Form */}
      <div className="space-y-6">
        <Field label="Display Name">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How others see you"
            maxLength={50}
          />
        </Field>

        <Field label="Bio">
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A brief intro..."
            maxLength={500}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {bio.length}/500
          </p>
        </Field>

        <Field label="Location" icon={<MapPin className="size-3" />}>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, Country"
          />
        </Field>

        <Field label="Skills & Tags">
          <TagInput
            tags={tags}
            onChange={setTags}
            placeholder="Type a skill and press Enter..."
            maxTags={10}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {tags.length}/10 tags
          </p>
        </Field>

        <Separator />

        <Field label="Avatar URL">
          <Input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
            type="url"
          />
        </Field>

        <Field
          label="Expected Hourly Rate (USDC)"
          icon={<DollarSign className="size-3" />}
        >
          <Input
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="0.00"
            type="number"
            step="0.01"
            min="0"
          />
        </Field>

        <Separator />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Twitter / X">
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">@</span>
              <Input
                value={twitterHandle}
                onChange={(e) => setTwitterHandle(e.target.value)}
                placeholder="handle"
                className="flex-1"
              />
            </div>
          </Field>
          <Field label="GitHub">
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">@</span>
              <Input
                value={githubHandle}
                onChange={(e) => setGithubHandle(e.target.value)}
                placeholder="username"
                className="flex-1"
              />
            </div>
          </Field>
        </div>

        <Field label="Website" icon={<Globe className="size-3" />}>
          <Input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://yoursite.com"
            type="url"
          />
        </Field>
      </div>

      {/* Save */}
      <div className="mt-8 flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Profile"}
        </Button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {saveError && (
          <span className="text-sm text-destructive">{saveError}</span>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
