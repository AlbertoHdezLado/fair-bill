"use client";

import { useEffect, useState } from "react";

/** Warns that the room can't be read or updated while the device is offline. */
export function OfflineBanner({ message }: { readonly message: string }) {
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
    <div className="bg-gold px-4 py-2 text-center text-xs font-medium text-gold-foreground">
      {message}
    </div>
  );
}
