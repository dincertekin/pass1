import {
  createVaultKey,
  decryptItem,
  deriveKeys,
  encryptItem,
  generateSalt,
  newItemId,
  type EncryptedBlob,
} from "@pass1/crypto";
import { useState, type FormEvent } from "react";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { PasswordField } from "./components/ui/TextField";

// Temporary playground to check the crypto package runs in the browser (Argon2 is WASM).
// Replaced by the real login and vault UI in phases 2 and 3 (see README roadmap).
export function App() {
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<{ ms: number; blob: EncryptedBlob; roundTrip: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const start = performance.now();
      const { encryptionKey } = await deriveKeys(password, generateSalt());
      const ms = Math.round(performance.now() - start);
      const { vaultKey } = await createVaultKey(encryptionKey);
      const itemId = newItemId();
      const blob = await encryptItem(vaultKey, itemId, { name: "Example", password: "s3cret" });
      const roundTrip = (await decryptItem(vaultKey, itemId, blob)).password;
      setResult({ ms, blob, roundTrip });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-sunken px-4 py-10">
      <div className="grid w-full max-w-sm gap-4 rounded-lg border border-border bg-surface p-6 shadow-pop">
        <Logo />
        <div className="grid gap-0.5">
          <h1 className="text-lg font-semibold">Crypto playground</h1>
          <p className="text-[13px] text-muted">Your key is derived on this device. Nothing is sent anywhere.</p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <PasswordField
            label="Master password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
          <Button type="submit" size="lg" disabled={busy || !password}>
            {busy ? "Deriving key with Argon2id…" : "Encrypt sample item"}
          </Button>
        </form>

        {result && (
          <dl className="grid gap-3 border-t border-border pt-4 text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Argon2id key derivation</dt>
              <dd className="font-mono tabular-nums">{result.ms} ms</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-muted">What the server would store</dt>
              <dd className="rounded-md border border-border bg-sunken p-2 font-mono text-xs break-all">
                {JSON.stringify(result.blob)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Decrypted locally</dt>
              <dd className="flex items-center gap-2">
                <span className="font-mono">{result.roundTrip}</span>
                <Badge tone="success">Match</Badge>
              </dd>
            </div>
          </dl>
        )}
      </div>
    </main>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight">
      <span className="grid size-4.5 place-items-center rounded-sm bg-accent font-mono text-[11px] text-on-accent">1</span>
      pass1
    </div>
  );
}
