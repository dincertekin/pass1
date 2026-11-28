import { COLORS } from "@pass1/core";
import { conformanceChecks } from "@pass1/crypto";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { nativeCryptoProvider } from "./src/crypto/native-provider";

// For now the app only proves its crypto: every conformance check (packages/crypto/src/
// conformance.ts) on this device, before any screen may touch a vault. The vault screens come next.
// The summary line is also logged, so a build script can read the outcome without the screen.

type Outcome = { name: string; passed: boolean; detail?: string; ms: number };

async function runChecks(onResult: (outcome: Outcome) => void): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const check of conformanceChecks(nativeCryptoProvider)) {
    const started = Date.now();
    let outcome: Outcome;
    try {
      await check.run();
      outcome = { name: check.name, passed: true, ms: Date.now() - started };
    } catch (error) {
      outcome = { name: check.name, passed: false, detail: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
    }
    outcomes.push(outcome);
    onResult(outcome);
  }
  return outcomes;
}

export default function App() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void runChecks((outcome) => setOutcomes((current) => [...current, outcome])).then((all) => {
      const passed = all.filter((outcome) => outcome.passed).length;
      console.log(`PASS1_CONFORMANCE ${JSON.stringify({ passed, total: all.length, failed: all.filter((o) => !o.passed) })}`);
      setDone(true);
    });
  }, []);

  const color = (name: keyof typeof COLORS) => COLORS[name][scheme];
  const failures = outcomes.filter((outcome) => !outcome.passed).length;

  return (
    <View style={[styles.screen, { backgroundColor: color("bg") }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: color("text") }]}>Crypto on this device</Text>
        <Text style={{ color: color("muted") }}>
          {done ? (failures === 0 ? `All ${outcomes.length} checks passed.` : `${failures} of ${outcomes.length} checks failed.`) : "Checking…"}
        </Text>
        {outcomes.map((outcome) => (
          <View key={outcome.name} style={[styles.row, { borderColor: color("border") }]}>
            <Text style={{ color: outcome.passed ? color("success") : color("danger"), fontWeight: "600" }}>{outcome.passed ? "Passed" : "Failed"}</Text>
            <Text style={{ color: color("text") }}>{outcome.name}</Text>
            {outcome.detail ? <Text style={{ color: color("danger") }}>{outcome.detail}</Text> : null}
            <Text style={{ color: color("muted"), fontSize: 12 }}>{outcome.ms} ms</Text>
          </View>
        ))}
      </ScrollView>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingTop: 72, gap: 12 },
  title: { fontSize: 28, fontWeight: "700" },
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 2 },
});
