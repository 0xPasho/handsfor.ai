"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

type ParticipantIdentity = {
  username?: string | null;
  ens_name?: string | null;
  base_name?: string | null;
  active_identity?: string | null;
  wallet_address?: string | null;
};

export type Task = {
  id: string;
  amount: string;
  status: string;
  description: string | null;
  tags?: string[];
  creatorId: string;
  acceptorId: string | null;
  appSessionId: string | null;
  evidenceNotes: string | null;
  disputeReason: string | null;
  resolution: string | null;
  createdAt: string;
  acceptedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  creatorWallet: string | null;
  acceptorWallet: string | null;
  creator?: ParticipantIdentity | null;
  acceptor?: ParticipantIdentity | null;
};

export type UserData = {
  user_id: string;
  wallet_address: string;
  privy_wallet_id: string | null;
  balance: string;
  yellow_balance: string;
  api_key: string;
  is_new: boolean;
  tasks: Task[];
  bio: string | null;
  location: string | null;
  tags: string[];
  avatar_url: string | null;
  twitter_handle: string | null;
  github_handle: string | null;
  website_url: string | null;
  hourly_rate: string | null;
  username: string | null;
  ens_name: string | null;
  ens_avatar: string | null;
  base_name: string | null;
  base_avatar: string | null;
  active_identity: string | null;
};

export function useUser() {
  const { authenticated, getToken } = useAuth();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load user");
      }
      setUser(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (authenticated) {
      fetchUser();
    } else {
      setUser(null);
    }
  }, [authenticated, fetchUser]);

  return { user, loading, error, setError, refetch: fetchUser };
}
