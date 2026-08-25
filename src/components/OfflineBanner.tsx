"use client";

import { useEffect, useState } from "react";

/** Warns that the room can't be read or updated while the device is offline. */
export function OfflineBanner({ message }: { readonly message: string }) {
  // Assume online on the first render so it matches the server-rendered HTML;
  // the real value is synced right after mount.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
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
    <div className="bg-gold px-4 py-2 text-center text-xs font-medium text-gold-foreground">
      {message}
    </div>
  );
}
