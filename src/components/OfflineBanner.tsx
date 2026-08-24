"use client";

import { useEffect, useState } from "react";

/** Global banner warning that live selection/realtime updates won't sync while offline. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="bg-warning-solid px-4 py-2 text-center text-xs font-medium text-warning-solid-foreground">
      Sin conexión — tu selección se sincronizará cuando vuelvas a estar en
      línea.
    </div>
  );
}
