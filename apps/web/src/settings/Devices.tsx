import type { SessionInfo } from "@pass1/shared";
import { Monitor, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { api } from "../lib/api";
import { errorMessage } from "../session/session";
import { Outcome, SettingRow } from "./layout";
import { describeUserAgent, isPhone } from "./user-agent";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Everywhere this account is logged in, with a way to log each one out. */
export function DevicesTab() {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions((await api.listSessions()).sessions);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (sessions === null && !error) return <p className="py-4 text-[13px] text-muted">Loading…</p>;
  const others = sessions?.filter((s) => !s.current) ?? [];

  return (
    <div>
      {sessions?.map((s) => {
        const Icon = isPhone(s.userAgent) ? Smartphone : Monitor;
        return (
          <SettingRow
            key={s.id}
            label={
              <span className="flex items-center gap-3">
                <span aria-hidden="true" className="grid size-8.5 place-items-center rounded-lg bg-sunken text-muted">
                  <Icon size={17} />
                </span>
                {describeUserAgent(s.userAgent)}
              </span>
            }
            hint={<span className="pl-11.5">Last active {dateFormat.format(s.lastUsedAt)}</span>}
          >
            {s.current ? (
              <Badge tone="accent">This device</Badge>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => run(() => api.revokeSession(s.id))}>
                Log out
              </Button>
            )}
          </SettingRow>
        );
      })}
      {others.length > 0 && (
        <div className="pt-4">
          <Button variant="danger" onClick={() => run(() => api.revokeOtherSessions())}>
            Log out all other devices
          </Button>
        </div>
      )}
      {error && (
        <div className="pt-3">
          <Outcome tone="danger">{error}</Outcome>
        </div>
      )}
    </div>
  );
}
