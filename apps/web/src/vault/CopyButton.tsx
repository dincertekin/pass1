import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "../components/ui/IconButton";
import { copySecret } from "../lib/clipboard";

/** Copies a value and clears the clipboard after the delay set in Settings. */
export function CopyButton({ value, label, what }: { value: string; label: string; what: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    await copySecret(value, what);
    setCopied(true);
  }

  return (
    <IconButton label={copied ? "Copied" : label} onClick={copy} className={copied ? "text-success" : undefined}>
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </IconButton>
  );
}
