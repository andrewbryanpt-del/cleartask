import { useEffect, useState, type CSSProperties } from "react";
import { fetchBlobUrl } from "../lib/api";

// /api/v1/files/:key requires a bearer token, which <img src> can't send.
// This fetches through the authenticated client and renders an object URL.
// Keys are immutable (a new upload gets a new UUID), so cached entries
// never go stale.
const objectUrlCache = new Map<string, string>();

export function AuthImage({
  src,
  alt,
  style,
  className,
}: {
  /** API file URL, e.g. "/api/v1/files/<key>" (as returned by the API). */
  src: string;
  alt: string;
  style?: CSSProperties;
  className?: string;
}) {
  const path = src.replace(/^\/api\/v1/, "");
  const [url, setUrl] = useState<string | null>(objectUrlCache.get(path) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    const cached = objectUrlCache.get(path);
    if (cached) {
      setUrl(cached);
      return;
    }
    setUrl(null);
    fetchBlobUrl(path)
      .then((objectUrl) => {
        objectUrlCache.set(path, objectUrl);
        if (active) setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [path]);

  if (failed || !url) {
    return (
      <span
        className={className}
        style={{
          display: "inline-block",
          background: "var(--border)",
          borderRadius: 8,
          ...style,
        }}
        aria-label={failed ? `${alt} (failed to load)` : `${alt} (loading)`}
      />
    );
  }
  return <img src={url} alt={alt} style={style} className={className} />;
}
