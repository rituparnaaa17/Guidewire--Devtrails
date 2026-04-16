"use client";

/**
 * hooks/useLocationTracker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser Geolocation API hook for ShieldPay.
 *
 * - Captures GPS on mount
 * - Sends coordinates to PUT /api/users/location (JWT-auth)
 * - Polls every 3 minutes silently in background
 * - Returns locationLabel (city name from Nominatim), isVerified, lat, lon
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api";
import { authHeaders, getUser } from "@/lib/auth";

export interface LocationState {
  lat: number | null;
  lon: number | null;
  locationLabel: string;   // e.g. "Koramangala, Bengaluru"
  isVerified: boolean;     // backend accepted the location
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

export function useLocationTracker() {
  const [state, setState] = useState<LocationState>({
    lat: null, lon: null,
    locationLabel: "",
    isVerified: false,
    isLoading: false,
    error: null,
    lastUpdated: null,
  });

  const latestRef = useRef<{ lat: number; lon: number } | null>(null);

  // ── Send coords to backend ─────────────────────────────────────────────────
  const pushToBackend = useCallback(async (lat: number, lon: number) => {
    const user = getUser() as Record<string, string> | null;
    if (!user?.id) return; // not logged in

    try {
      const res = await fetch(apiUrl("/api/user/location"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(authHeaders() as Record<string, string>),
        },
        body: JSON.stringify({ lat, lon }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const label = data.data?.locationLabel ?? "";
      setState((prev) => ({
        ...prev,
        locationLabel: label || prev.locationLabel,
        isVerified: true,
        isLoading: false,
        lastUpdated: new Date(),
      }));
    } catch {
      // Network error — still show GPS coords without verified badge
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  // ── Capture GPS from browser ────────────────────────────────────────────────
  const captureLocation = useCallback((): Promise<{ lat: number; lon: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator?.geolocation) {
        setState((prev) => ({ ...prev, error: "GPS not supported", isLoading: false }));
        reject(new Error("GPS not supported"));
        return;
      }
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          latestRef.current = { lat, lon };
          setState((prev) => ({ ...prev, lat, lon }));
          await pushToBackend(lat, lon);
          resolve({ lat, lon });
        },
        (err) => {
          const msg =
            err.code === 1 ? "Location permission denied"
            : err.code === 2 ? "Location unavailable"
            : "GPS timeout";
          setState((prev) => ({ ...prev, error: msg, isLoading: false }));
          reject(err);
        },
        { timeout: 8000, enableHighAccuracy: true, maximumAge: 60000 }
      );
    });
  }, [pushToBackend]);

  // ── Mount: capture once + set up polling ───────────────────────────────────
  useEffect(() => {
    const user = getUser();
    if (!user) return; // Skip if not logged in

    captureLocation().catch(() => {});

    const interval = setInterval(() => {
      captureLocation().catch(() => {});
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [captureLocation]);

  return { ...state, captureLocation };
}
