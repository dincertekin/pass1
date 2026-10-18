import { Lock, LogOut } from "lucide-react";
import { Logo } from "../components/Logo";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useSession } from "../session/session";

// Placeholder until Phase 3 builds the real three-pane vault.
export function VaultScreen({ email }: { email: string }) {
  const { lock, logOut } = useSession();

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr]">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <Logo />
        <div className="flex items-center gap-2">
          <span className="hidden text-[13px] text-muted sm:inline">{email}</span>
          <Button variant="secondary" size="sm" onClick={lock}>
            <Lock size={14} /> Lock
          </Button>
          <Button variant="ghost" size="sm" onClick={logOut}>
            <LogOut size={14} /> Log out
          </Button>
        </div>
      </header>
      <main className="grid place-items-center px-4">
        <div className="grid max-w-sm justify-items-center gap-2 text-center">
          <Badge tone="success">Unlocked</Badge>
          <h1 className="text-lg font-semibold">Your vault is open</h1>
          <p className="text-[13px] text-muted">
            The vault key is in memory on this device only. Reload the page and it's gone. Items arrive in Phase 3.
          </p>
        </div>
      </main>
    </div>
  );
}
