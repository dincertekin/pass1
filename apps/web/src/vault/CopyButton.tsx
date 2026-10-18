import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "../components/ui/IconButton";

// Phase 4 adds clearing the clipboard after 30 seconds and a countdown toast.
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  }

  return (
    <IconButton label={copied ? "Copied" : label} onClick={copy} className={copied ? "text-success" : undefined}>
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </IconButton>
  );
}
