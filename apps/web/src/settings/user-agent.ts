/**
 * "Chrome on macOS" from a User-Agent string, for the Devices list. Deliberately simple:
 * it only has to help someone recognize their own devices.
 */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";

  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Unknown browser";

  const os =
    /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : null;

  return os ? `${browser} on ${os}` : browser;
}
