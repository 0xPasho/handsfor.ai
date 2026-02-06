"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { Task } from "@/hooks/use-user";

export function useTasks() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(
    async (params?: Record<string, string>): Promise<Task[]> => {
      try {
        const query = params
          ? "?" + new URLSearchParams(params).toString()
          : "";
        const res = await fetch(`/api/tasks${query}`);
        if (res.ok) {
          const data = await res.json();
          return data.tasks || [];
        }
        return [];
      } catch {
        return [];
      }
    },
    [],
  );

  const fetchTask = useCallback(async (taskId: string): Promise<Task | null> => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const doAction = useCallback(
    async (taskId: string, action: string, body?: object) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const res = await fetch(`/api/tasks/${taskId}/${action}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `${action} failed`);
        }
        return await res.json();
      } catch (err) {
        const msg = err instanceof Error ? err.message : `${action} failed`;
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  return {
    fetchTasks,
    fetchTask,
    doAction,
    loading,
    error,
    setError,
  };
}
