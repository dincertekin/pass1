import type { SessionInfo } from "@pass1/shared";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { api } from "../lib/api";
import { errorMessage } from "../session/session";
import { Outcome, Row, Section } from "./layout";
import { describeUserAgent } from "./user-agent";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Everywhere this account is logged in, with a way to log each one out. */
export function Devices() {
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

  const others = sessions?.filter((s) => !s.current) ?? [];

  return (
    <Section title="Devices" note="Where you're logged in">
      {sessions === null && !error && <Row label="Loading…" />}
      {sessions?.map((s) => (
        <Row
          key={s.id}
          label={describeUserAgent(s.userAgent)}
          hint={`Last active ${dateFormat.format(s.lastUsedAt)} · Logged in ${dateFormat.format(s.createdAt)}`}
        >
          {s.current ? (
            <Badge tone="accent">This device</Badge>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => run(() => api.revokeSession(s.id))}>
              Log out
            </Button>
          )}
        </Row>
      ))}
      {others.length > 0 && (
        <Row label="Log out everywhere else" hint="Every device except this one will need to log in again.">
          <Button variant="danger" size="sm" onClick={() => run(() => api.revokeOtherSessions())}>
            Log out {others.length} other{others.length === 1 ? "" : "s"}
          </Button>
        </Row>
      )}
      {error && (
        <div className="px-4 py-3">
          <Outcome tone="danger">{error}</Outcome>
        </div>
      )}
    </Section>
  );
}
