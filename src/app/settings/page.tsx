"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useUser } from "@/hooks/use-user";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/modules/shared/components/ui/avatar";
import { Button } from "@/modules/shared/components/ui/button";
import { Input } from "@/modules/shared/components/ui/input";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Separator } from "@/modules/shared/components/ui/separator";
import { Skeleton } from "@/modules/shared/components/ui/skeleton";
import { TagInput } from "@/components/tag-input";
import { getDisplayName, getInitials } from "@/lib/identity";
import { truncAddr } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/shared/components/ui/select";
import { MapPin, Globe, DollarSign, LayoutDashboard, Eye, Check, X, Loader2, ArrowLeft } from "lucide-react";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function ProfilePage() {
  const router = useRouter();
  const { ready, authenticated, getToken } = useAuth();
  const { user, loading, error, refetch } = useUser();

  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [githubHandle, setGithubHandle] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [username, setUsername] = useState("");
  const [activeIdentity, setActiveIdentity] = useState("username");

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const checkTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

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
      setBio(user.bio || "");
      setLocation(user.location || "");
      setTags(user.tags || []);
      setAvatarUrl(user.avatar_url || "");
      setTwitterHandle(user.twitter_handle || "");
      setGithubHandle(user.github_handle || "");
      setWebsiteUrl(user.website_url || "");
      setHourlyRate(user.hourly_rate || "");
      setUsername(user.username || "");
      setActiveIdentity(user.active_identity || "username");
    }
  }, [user]);

  // Live username availability check
  const checkUsername = useCallback((value: string) => {
    if (checkTimeout.current) clearTimeout(checkTimeout.current);
    const uname = value.toLowerCase();
    if (!uname || uname.length < 3) {
      setUsernameStatus("idle");
      return;
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(uname)) {
      setUsernameStatus("invalid");
      return;
    }
    // If same as current username, no need to check
    if (user?.username === uname) {
      setUsernameStatus("available");
      return;
    }
    setUsernameStatus("checking");
    checkTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/check-username?username=${encodeURIComponent(uname)}`);
        const data = await res.json();
        setUsernameStatus(data.available ? "available" : "taken");
      } catch {
        setUsernameStatus("idle");
      }
    }, 400);
  }, [user?.username]);

  const handleUsernameChange = (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setUsername(cleaned);
    checkUsername(cleaned);
  };

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
          bio: bio || null,
          location: location || null,
          tags,
          avatar_url: avatarUrl || null,
          twitter_handle: twitterHandle || null,
          github_handle: githubHandle || null,
          website_url: websiteUrl || null,
          hourly_rate: hourlyRate || null,
          username: username || null,
          active_identity: activeIdentity,
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
    bio,
    location,
    tags,
    avatarUrl,
    twitterHandle,
    githubHandle,
    websiteUrl,
    hourlyRate,
    username,
    activeIdentity,
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

  const identityOptions: { key: string; label: string; value: string | null }[] = [
    { key: "username", label: "Username", value: username || null },
  ];
  if (user.ens_name) {
    identityOptions.push({ key: "ens", label: "ENS", value: user.ens_name });
  }
  if (user.base_name) {
    identityOptions.push({ key: "base", label: "Base", value: user.base_name });
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 py-10">
      <Link
        href={`/humans/${user?.username || user?.wallet_address || ""}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        My Profile
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your public profile on Hands for AI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/humans/${user?.username || user?.wallet_address || ""}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-zinc-100 hover:text-foreground"
          >
            <Eye className="size-3.5" />
            View Profile
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-zinc-100 hover:text-foreground"
          >
            <LayoutDashboard className="size-3.5" />
            Dashboard
          </Link>
        </div>
      </div>

      {/* Avatar + name header */}
      <div className="mt-8 flex items-center gap-4">
        <Avatar className="size-16">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={username || "Avatar"} />
          ) : null}
          <AvatarFallback className="text-lg">
            {getInitials(user)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {getDisplayName(user)}
          </p>
          <p className="truncate text-xs font-mono text-muted-foreground">
            {truncAddr(user.wallet_address)}
          </p>
        </div>
      </div>

      <Separator className="my-8" />

      {/* Form */}
      <div className="space-y-6">
        {/* Username — primary identity */}
        <Field label="Username">
          <div className="relative">
            <Input
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="your-username"
              maxLength={30}
              className="pr-8 font-mono"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
              {usernameStatus === "checking" && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              {usernameStatus === "available" && (
                <Check className="size-4 text-green-600" />
              )}
              {usernameStatus === "taken" && (
                <X className="size-4 text-destructive" />
              )}
              {usernameStatus === "invalid" && (
                <X className="size-4 text-orange-500" />
              )}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {username
              ? `${username}.handsfor.ai`
              : "Claim your unique URL: username.handsfor.ai"}
          </p>
          {usernameStatus === "taken" && (
            <p className="mt-0.5 text-xs text-destructive">Username is taken</p>
          )}
          {usernameStatus === "invalid" && (
            <p className="mt-0.5 text-xs text-orange-500">
              3-30 chars, lowercase letters, numbers, hyphens
            </p>
          )}
        </Field>

        {/* Public display identity picker */}
        <Field label="Public Display Name">
          <Select value={activeIdentity} onValueChange={setActiveIdentity}>
            <SelectTrigger>
              <SelectValue placeholder="Choose display identity" />
            </SelectTrigger>
            <SelectContent>
              {identityOptions.map((opt) => (
                <SelectItem key={opt.key} value={opt.key}>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground mr-2">
                    {opt.label}
                  </span>
                  {opt.value || "Not set"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            {identityOptions.length === 1
              ? "Connect a wallet with an ENS or Base name to unlock more identity options."
              : "This is the name shown everywhere on the platform."}
          </p>
        </Field>

        <Separator />

        <Field label="Bio">
          <MarkdownEditor
            value={bio}
            onChange={setBio}
            placeholder="A brief intro... (supports markdown)"
            maxLength={500}
            rows={3}
            variant="light"
          />
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
          {(user.ens_avatar || user.base_avatar) && (
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank to use your {user.ens_avatar ? "ENS" : "Base"} avatar automatically.
            </p>
          )}
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
