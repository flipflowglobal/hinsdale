import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { QUALITY_TIER_DETAILS, type QualityTier } from "@/lib/hinsdale-data";
import { embeddedEngineRuntimeInfo } from "@/modules/hinsdale-engine/src";

type RuntimeState = { kind: "loading" } | { kind: "ready"; version: string; schemaVersion: string; maxInputBytes: number } | { kind: "unavailable"; message: string };

function TierCard({ tier }: { tier: QualityTier }) {
  const detail = QUALITY_TIER_DETAILS[tier];
  return <View style={styles.tierCard}><View style={styles.tierTop}><Text style={styles.tierName}>{detail.label}</Text><Text style={styles.tierChip}>{detail.status}</Text></View><Text style={styles.tierSummary}>{detail.summary}</Text><View style={styles.capabilityList}>{detail.capabilities.map((capability) => <View key={capability} style={styles.capabilityRow}><View style={styles.capabilityDot} /><Text style={styles.capabilityText}>{capability}</Text></View>)}</View></View>;
}

export default function EngineIntegrityScreen() {
  const [runtime, setRuntime] = useState<RuntimeState>({ kind: "loading" });
  useEffect(() => {
    try { setRuntime({ kind: "ready", ...embeddedEngineRuntimeInfo() }); }
    catch (error) { setRuntime({ kind: "unavailable", message: error instanceof Error ? error.message : "Native runtime information is unavailable." }); }
  }, []);

  const isReady = runtime.kind === "ready";
  return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5" containerClassName="bg-background">
    <View style={styles.topBar}><Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={22} color="#F4F7F8" /></Pressable><View><Text style={styles.screenTitle}>Engine integrity</Text><Text style={styles.screenSubtitle}>Native runtime verification</Text></View><View style={{ width: 38 }} /></View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.hero}><Text style={styles.eyebrow}>ON-DEVICE EXECUTION</Text><Text style={styles.heroTitle}>Analysis is produced by the bundled Rust engine.</Text><Text style={styles.heroBody}>The mobile client validates the versioned engine response before it can display or persist a report. It does not reconstruct findings in TypeScript.</Text></View>
      <Text style={styles.sectionLabel}>RUNTIME STATUS</Text>
      <View style={[styles.runtimeCard, { borderColor: isReady ? "#47D7AC66" : "#F4B94266" }]}><View style={styles.runtimeHeader}><View style={[styles.runtimeIcon, { backgroundColor: isReady ? "#10362D" : "#3D2E10" }]}><MaterialIcons name={isReady ? "verified" : "build"} size={21} color={isReady ? "#47D7AC" : "#F4B942"} /></View><View style={styles.runtimeCopy}><Text style={styles.runtimeTitle}>{runtime.kind === "loading" ? "Checking embedded module" : isReady ? "Embedded engine loaded" : "Native module unavailable"}</Text><Text style={styles.runtimeBody}>{runtime.kind === "loading" ? "Reading native runtime metadata." : isReady ? `Engine ${runtime.version} · ${runtime.schemaVersion}` : runtime.message}</Text></View></View>{isReady && <View style={styles.runtimeMetric}><Text style={styles.runtimeMetricValue}>{runtime.maxInputBytes.toLocaleString()}</Text><Text style={styles.runtimeMetricLabel}>maximum decoded bytecode bytes</Text></View>}</View>
      <Text style={styles.sectionLabel}>EXECUTION PROFILES</Text>
      {(["fast", "precise", "research"] as QualityTier[]).map((tier) => <TierCard key={tier} tier={tier} />)}
      <Text style={styles.sectionLabel}>BUILD REQUIREMENTS</Text>
      <View style={styles.requirementsCard}><View style={styles.requirement}><MaterialIcons name="android" size={18} color="#2DD4E9" /><Text style={styles.requirementText}>Android release or custom development client with the bundled Rust shared libraries.</Text></View><View style={styles.requirement}><MaterialIcons name="phone-iphone" size={18} color="#2DD4E9" /><Text style={styles.requirementText}>iOS release or custom development client with the bundled Rust XCFramework.</Text></View><View style={styles.requirement}><MaterialIcons name="web-asset-off" size={18} color="#F4B942" /><Text style={styles.requirementText}>Web preview and Expo Go deliberately do not execute the native engine and return an explicit unavailable state.</Text></View></View>
      <View style={styles.disclosure}><MaterialIcons name="fact-check" size={20} color="#2DD4E9" /><View style={styles.disclosureCopy}><Text style={styles.disclosureTitle}>Evidence before trust</Text><Text style={styles.disclosureBody}>Reports are bounded reconstructions, not verified source code or a safety guarantee. Review the engine limitations included with each report before acting on an inference.</Text></View></View>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12, paddingTop: 4 }, backButton: { alignItems: "center", backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 12, borderWidth: 1, height: 38, justifyContent: "center", width: 38 }, screenTitle: { color: "#F4F7F8", fontSize: 16, fontWeight: "700", textAlign: "center" }, screenSubtitle: { color: "#9DAAB0", fontSize: 11, marginTop: 2, textAlign: "center" }, content: { gap: 12, paddingBottom: 28 }, hero: { backgroundColor: "#15313A", borderColor: "#2DD4E955", borderRadius: 18, borderWidth: 1, padding: 17 }, eyebrow: { color: "#2DD4E9", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 }, heroTitle: { color: "#F4F7F8", fontSize: 23, fontWeight: "800", letterSpacing: -0.5, lineHeight: 28, marginTop: 7 }, heroBody: { color: "#C7D1D5", fontSize: 13, lineHeight: 19, marginTop: 9 }, sectionLabel: { color: "#718087", fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginTop: 10 }, runtimeCard: { backgroundColor: "#1C2226", borderRadius: 16, borderWidth: 1, padding: 14 }, runtimeHeader: { alignItems: "flex-start", flexDirection: "row", gap: 11 }, runtimeIcon: { alignItems: "center", borderRadius: 11, height: 40, justifyContent: "center", width: 40 }, runtimeCopy: { flex: 1 }, runtimeTitle: { color: "#F4F7F8", fontSize: 14, fontWeight: "800" }, runtimeBody: { color: "#9DAAB0", fontSize: 11, lineHeight: 16, marginTop: 4 }, runtimeMetric: { backgroundColor: "#101315", borderRadius: 10, marginTop: 13, padding: 10 }, runtimeMetricValue: { color: "#F4F7F8", fontSize: 16, fontWeight: "800" }, runtimeMetricLabel: { color: "#718087", fontSize: 10, marginTop: 2 }, tierCard: { backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 16, borderWidth: 1, padding: 14 }, tierTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, tierName: { color: "#F4F7F8", fontSize: 17, fontWeight: "800" }, tierChip: { backgroundColor: "#10362D", borderRadius: 999, color: "#47D7AC", fontSize: 10, fontWeight: "800", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 }, tierSummary: { color: "#9DAAB0", fontSize: 12, lineHeight: 18, marginTop: 6 }, capabilityList: { gap: 8, marginTop: 13 }, capabilityRow: { alignItems: "flex-start", flexDirection: "row", gap: 8 }, capabilityDot: { backgroundColor: "#47D7AC", borderRadius: 3, height: 6, marginTop: 5, width: 6 }, capabilityText: { color: "#C7D1D5", flex: 1, fontSize: 12, lineHeight: 17 }, requirementsCard: { backgroundColor: "#161D21", borderColor: "#2B353B", borderRadius: 16, borderWidth: 1, gap: 13, padding: 14 }, requirement: { alignItems: "flex-start", flexDirection: "row", gap: 10 }, requirementText: { color: "#C7D1D5", flex: 1, fontSize: 12, lineHeight: 17 }, disclosure: { alignItems: "flex-start", backgroundColor: "#15313A", borderColor: "#2DD4E955", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 11, marginTop: 4, padding: 15 }, disclosureCopy: { flex: 1 }, disclosureTitle: { color: "#F4F7F8", fontSize: 14, fontWeight: "800" }, disclosureBody: { color: "#C7D1D5", fontSize: 12, lineHeight: 17, marginTop: 5 }, pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
