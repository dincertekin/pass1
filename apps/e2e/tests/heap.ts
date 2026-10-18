import type { CDPSession } from "@playwright/test";

// Looks inside the page's memory with Chrome's heap snapshots (the same data as the
// DevTools Memory tab), to prove what is and isn't still there after locking.

export interface SecretsInMemory {
  /** Live CryptoKey objects holding key material. Chrome lists these as native "CryptoKey" nodes. */
  cryptoKeys: number;
  /** For each given secret, how many strings in the heap contain it. */
  strings: Record<string, number>;
}

const STRING_TYPES = new Set(["string", "concatenated string", "sliced string"]);

export async function secretsInMemory(cdp: CDPSession, secrets: string[]): Promise<SecretsInMemory> {
  await cdp.send("HeapProfiler.enable");
  // Several rounds, so anything only kept alive by other garbage is collected too.
  for (let i = 0; i < 3; i++) await cdp.send("HeapProfiler.collectGarbage");

  let json = "";
  const onChunk = ({ chunk }: { chunk: string }) => (json += chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);

  const snapshot = JSON.parse(json) as {
    snapshot: { meta: { node_fields: string[]; node_types: [string[]] } };
    nodes: number[];
    strings: string[];
  };
  const fields = snapshot.snapshot.meta.node_fields;
  const typeNames = snapshot.snapshot.meta.node_types[0];
  const typeIndex = fields.indexOf("type");
  const nameIndex = fields.indexOf("name");

  const result: SecretsInMemory = { cryptoKeys: 0, strings: Object.fromEntries(secrets.map((s) => [s, 0])) };
  for (let i = 0; i < snapshot.nodes.length; i += fields.length) {
    const type = typeNames[snapshot.nodes[i + typeIndex]!]!;
    const name = snapshot.strings[snapshot.nodes[i + nameIndex]!]!;
    // Chrome also keeps an empty template object named "CryptoKey" (type "object") for making
    // new keys. It holds no key material, so only the native nodes count.
    if (type === "native" && name === "CryptoKey") result.cryptoKeys++;
    if (STRING_TYPES.has(type)) {
      for (const secret of secrets) if (name.includes(secret)) result.strings[secret]!++;
    }
  }
  return result;
}
