import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { QUALITY_TIER_DETAILS, type QualityTier } from "@/lib/hinsdale-data";
import { ENGINE_BENCHMARK, ENGINE_IMPLEMENTATION } from "@/lib/engine-status";

const WORKSTREAMS = [
  {
    label: "A",
    title: "Control flow & recovery",
    color: "#2DD4E9",
    items: [
      ["A1", "Global context-sensitive CFG", "Resolve jumps with global context and practical shrinking-context discipline."],
      ["A2", "Private function recovery", "Detect internal call-like patterns and reconstruct recovered function boundaries."],
      ["A3", "Arguments & returns", "Infer values through path-sensitive or path-merged function context."],
      ["A4–A5", "Memory, SSA & structurization", "Improve cross-block value naming, memory state, if/else, loops, and switch recovery."],
    ],
  },
  {
    label: "B",
    title: "Symbolic lifting quality",
    color: "#47D7AC",
    items: [
      ["B1", "Constants & types", "Strengthen constant folding and type propagation."],
      ["B2", "Storage inference", "Recover storage layouts, slots, and mapping-like access patterns."],
      ["B3", "Events & errors", "Improve LOG interpretation and error-string recovery."],
      ["B4", "Hard-block exploration", "Optionally explore difficult symbolic paths with bounded effort."],
    ],
  },
  {
    label: "C",
    title: "Maturity & validation",
    color: "#F4B942",
    items: [
      ["C1–C2", "Benchmark corpus & CI", "Run a public, reproducible corpus with automatic metrics and regression detection."],
      ["C3", "Human evaluation", "Sample readability and usefulness with a documented review protocol."],
      ["C4", "Differential testing", "Compare outputs against Heimdall-rs and Gigahorse to surface defects."],
      ["C5", "Fuzzing", "Generate adversarial contracts to strengthen failure handling."],
    ],
  },
  {
    label: "D",
    title: "Distribution engineering",
    color: "#B6A4FF",
    items: [
      ["D1", "Stable IR & JSON", "Version the intermediate representation and external JSON schema."],
      ["D2", "Quality tiers", "Offer Fast, Precise, and Research execution contracts."],
      ["D3", "Confidence disclosure", "Document limits, expected accuracy, and intended usage."],
      ["D4", "Reproducible delivery", "Ship repeatable builds and container images."],
    ],
  },
];

const CONNECTIONS = [
  ["CFG resolution", "Private function recovery", "Better control flow reveals boundaries; recovered boundaries refine control flow."],
  ["Argument & return inference", "Pseudo-Solidity readability", "Recovered interfaces improve source clarity and human evaluation outcomes."],
  ["Memory/SSA modeling", "Structurization", "Consistent values across blocks support complete, readable control structures."],
  ["Evaluation corpus", "Metric dashboard", "Continuous measurements identify regressions and build distribution confidence."],
  ["Differential testing", "Bug discovery", "Output comparisons identify edge cases that feed maturity work."],
];

function TierCard({ tier }: { tier: QualityTier }) {
  const detail = QUALITY_TIER_DETAILS[tier];
  const available = tier === "fast";
  return <View style={styles.tierCard}><View style={styles.tierTop}><Text style={styles.tierName}>{detail.label}</Text><Text style={[styles.tierChip, available && styles.tierChipAvailable]}>{detail.status}</Text></View><Text style={styles.tierSummary}>{detail.summary}</Text><View style={styles.capabilityList}>{detail.capabilities.map((capability) => <View key={capability} style={styles.capabilityRow}><View style={[styles.capabilityDot, available && styles.capabilityDotAvailable]} /><Text style={styles.capabilityText}>{capability}</Text></View>)}</View></View>;
}

export default function RoadmapScreen() {
  return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5" containerClassName="bg-background">
    <View style={styles.topBar}><Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={22} color="#F4F7F8" /></Pressable><View><Text style={styles.screenTitle}>Engine roadmap</Text><Text style={styles.screenSubtitle}>Transparent capability plan</Text></View><View style={{ width: 38 }} /></View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.hero}><Text style={styles.eyebrow}>HINSDALE ENGINE PROGRAM</Text><Text style={styles.heroTitle}>From bytecode indicators to defensible reconstruction.</Text><Text style={styles.heroBody}>The mobile companion remains local and lightweight today. These workstreams define the engine capabilities and evidence needed before stronger claims are made.</Text></View>

      <Text style={styles.sectionLabel}>IMPLEMENTATION SNAPSHOT</Text>
      <View style={styles.snapshotCard}>
        <Text style={styles.snapshotTitle}>Rust engine foundations are included in this workspace.</Text>
        <Text style={styles.snapshotBody}>The mobile companion does not invoke the Rust engine yet. It continues to run the local Fast inspection and labels engine output as unavailable until a secure service or native bridge is connected.</Text>
        {ENGINE_IMPLEMENTATION.map((item) => <View key={item.title} style={styles.snapshotItem}><View style={styles.snapshotDot} /><View style={styles.snapshotCopy}><View style={styles.snapshotHeading}><Text style={styles.snapshotItemTitle}>{item.title}</Text><Text style={styles.snapshotStatus}>{item.status}</Text></View><Text style={styles.snapshotDetail}>{item.detail}</Text></View></View>)}
      </View>

      <Text style={styles.sectionLabel}>REPRODUCIBLE BASELINE</Text>
      <View style={styles.benchmarkCard}><View style={styles.benchmarkHeader}><View><Text style={styles.benchmarkTitle}>{ENGINE_BENCHMARK.fixture}</Text><Text style={styles.benchmarkMeta}>{ENGINE_BENCHMARK.tier} profile · {ENGINE_BENCHMARK.status}</Text></View><MaterialIcons name="verified" size={22} color="#47D7AC" /></View><View style={styles.metricGrid}><View style={styles.metric}><Text style={styles.metricValue}>{ENGINE_BENCHMARK.bytes}</Text><Text style={styles.metricLabel}>bytes</Text></View><View style={styles.metric}><Text style={styles.metricValue}>{ENGINE_BENCHMARK.blocks}</Text><Text style={styles.metricLabel}>blocks</Text></View><View style={styles.metric}><Text style={styles.metricValue}>{ENGINE_BENCHMARK.resolvedJumps}</Text><Text style={styles.metricLabel}>resolved jumps</Text></View><View style={styles.metric}><Text style={styles.metricValue}>{ENGINE_BENCHMARK.unresolvedJumps}</Text><Text style={styles.metricLabel}>unresolved</Text></View></View><Text style={styles.benchmarkSource}>Fixture provenance: {ENGINE_BENCHMARK.source}</Text></View>

      <Text style={styles.sectionLabel}>QUALITY TIERS</Text>
      {(["fast", "precise", "research"] as QualityTier[]).map((tier) => <TierCard key={tier} tier={tier} />)}

      <Text style={styles.sectionLabel}>CONNECTED DEPENDENCIES</Text>
      <View style={styles.connectionsCard}>{CONNECTIONS.map(([from, to, body]) => <View key={from} style={styles.connectionRow}><View style={styles.connectionPair}><Text style={styles.connectionNode}>{from}</Text><MaterialIcons name="arrow-forward" size={15} color="#2DD4E9" /><Text style={styles.connectionNode}>{to}</Text></View><Text style={styles.connectionBody}>{body}</Text></View>)}</View>

      <Text style={styles.sectionLabel}>WORKSTREAMS</Text>
      {WORKSTREAMS.map((stream) => <View key={stream.label} style={styles.workstream}><View style={[styles.streamLabel, { backgroundColor: `${stream.color}22`, borderColor: `${stream.color}77` }]}><Text style={[styles.streamLabelText, { color: stream.color }]}>{stream.label}</Text></View><View style={styles.streamContent}><Text style={styles.streamTitle}>{stream.title}</Text>{stream.items.map(([code, title, body]) => <View key={code} style={styles.workItem}><Text style={[styles.workCode, { color: stream.color }]}>{code}</Text><View style={styles.workCopy}><Text style={styles.workTitle}>{title}</Text><Text style={styles.workBody}>{body}</Text></View></View>)}</View></View>)}

      <View style={styles.disclosure}><MaterialIcons name="fact-check" size={20} color="#2DD4E9" /><View style={styles.disclosureCopy}><Text style={styles.disclosureTitle}>Confidence before distribution</Text><Text style={styles.disclosureBody}>Metrics should track resolved jumps, recovered CALLs and LOGs, operand resolution, timeout rate, and sampled human readability. Results should be compared across versions before the engine’s scope expands.</Text></View></View>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12, paddingTop: 4 },
  backButton: { alignItems: "center", backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 12, borderWidth: 1, height: 38, justifyContent: "center", width: 38 },
  screenTitle: { color: "#F4F7F8", fontSize: 16, fontWeight: "700", textAlign: "center" },
  screenSubtitle: { color: "#9DAAB0", fontSize: 11, marginTop: 2, textAlign: "center" },
  content: { gap: 12, paddingBottom: 28 },
  hero: { backgroundColor: "#15313A", borderColor: "#2DD4E955", borderRadius: 18, borderWidth: 1, padding: 17 },
  eyebrow: { color: "#2DD4E9", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  heroTitle: { color: "#F4F7F8", fontSize: 23, fontWeight: "800", letterSpacing: -0.5, lineHeight: 28, marginTop: 7 },
  heroBody: { color: "#C7D1D5", fontSize: 13, lineHeight: 19, marginTop: 9 },
  sectionLabel: { color: "#718087", fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginTop: 10 },
  snapshotCard: { backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 16, borderWidth: 1, padding: 14 },
  snapshotTitle: { color: "#F4F7F8", fontSize: 14, fontWeight: "800" },
  snapshotBody: { color: "#9DAAB0", fontSize: 12, lineHeight: 17, marginTop: 6 },
  snapshotItem: { alignItems: "flex-start", flexDirection: "row", gap: 8, marginTop: 13 },
  snapshotDot: { backgroundColor: "#47D7AC", borderRadius: 4, height: 7, marginTop: 5, width: 7 },
  snapshotCopy: { flex: 1 },
  snapshotHeading: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 7 },
  snapshotItemTitle: { color: "#D5F5F8", fontSize: 12, fontWeight: "800" },
  snapshotStatus: { color: "#47D7AC", fontSize: 9, fontWeight: "800" },
  snapshotDetail: { color: "#9DAAB0", fontSize: 11, lineHeight: 16, marginTop: 3 },
  benchmarkCard: { backgroundColor: "#161D21", borderColor: "#47D7AC66", borderRadius: 16, borderWidth: 1, padding: 14 },
  benchmarkHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  benchmarkTitle: { color: "#F4F7F8", fontSize: 14, fontWeight: "800" },
  benchmarkMeta: { color: "#47D7AC", fontSize: 11, fontWeight: "700", marginTop: 4 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  metric: { backgroundColor: "#101315", borderRadius: 10, flexBasis: "46%", flexGrow: 1, padding: 10 },
  metricValue: { color: "#F4F7F8", fontSize: 16, fontWeight: "800" },
  metricLabel: { color: "#718087", fontSize: 10, marginTop: 2 },
  benchmarkSource: { color: "#718087", fontSize: 10, lineHeight: 15, marginTop: 12 },
  tierCard: { backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 16, borderWidth: 1, padding: 14 },
  tierTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  tierName: { color: "#F4F7F8", fontSize: 17, fontWeight: "800" },
  tierChip: { backgroundColor: "#313136", borderRadius: 999, color: "#C7D1D5", fontSize: 10, fontWeight: "800", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 },
  tierChipAvailable: { backgroundColor: "#10362D", color: "#47D7AC" },
  tierSummary: { color: "#9DAAB0", fontSize: 12, lineHeight: 18, marginTop: 6 },
  capabilityList: { gap: 8, marginTop: 13 },
  capabilityRow: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
  capabilityDot: { backgroundColor: "#718087", borderRadius: 3, height: 6, marginTop: 5, width: 6 },
  capabilityDotAvailable: { backgroundColor: "#47D7AC" },
  capabilityText: { color: "#C7D1D5", flex: 1, fontSize: 12, lineHeight: 17 },
  connectionsCard: { backgroundColor: "#161D21", borderColor: "#2B353B", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  connectionRow: { borderBottomColor: "#2B353B", borderBottomWidth: StyleSheet.hairlineWidth, padding: 13 },
  connectionPair: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 },
  connectionNode: { color: "#D5F5F8", fontSize: 12, fontWeight: "800" },
  connectionBody: { color: "#9DAAB0", fontSize: 11, lineHeight: 16, marginTop: 6 },
  workstream: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  streamLabel: { alignItems: "center", borderRadius: 11, borderWidth: 1, height: 34, justifyContent: "center", width: 34 },
  streamLabelText: { fontSize: 15, fontWeight: "900" },
  streamContent: { backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 16, borderWidth: 1, flex: 1, padding: 14 },
  streamTitle: { color: "#F4F7F8", fontSize: 15, fontWeight: "800", marginBottom: 12 },
  workItem: { alignItems: "flex-start", flexDirection: "row", gap: 9, marginTop: 11 },
  workCode: { fontSize: 10, fontWeight: "900", minWidth: 28, paddingTop: 2 },
  workCopy: { flex: 1 },
  workTitle: { color: "#D5F5F8", fontSize: 12, fontWeight: "800" },
  workBody: { color: "#9DAAB0", fontSize: 11, lineHeight: 16, marginTop: 3 },
  disclosure: { alignItems: "flex-start", backgroundColor: "#15313A", borderColor: "#2DD4E955", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 11, marginTop: 4, padding: 15 },
  disclosureCopy: { flex: 1 },
  disclosureTitle: { color: "#F4F7F8", fontSize: 14, fontWeight: "800" },
  disclosureBody: { color: "#C7D1D5", fontSize: 12, lineHeight: 17, marginTop: 5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
