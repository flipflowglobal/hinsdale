import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { type ComponentProps, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { QUALITY_TIER_DETAILS, type AnalysisMode } from "@/lib/hinsdale-data";
import { analyzeWithEmbeddedEngine } from "@/lib/hinsdale-engine";
import { useHinsdale } from "@/lib/hinsdale-store";

const MODES: { key: AnalysisMode; title: string; icon: ComponentProps<typeof MaterialIcons>["name"] }[] = [
  { key: "full", title: "Full", icon: "analytics" }, { key: "security", title: "Security", icon: "security" }, { key: "signatures", title: "Selectors", icon: "functions" },
];

export default function AnalyzeScreen() {
  const { addReport, preferences } = useHinsdale();
  const [bytecode, setBytecode] = useState("");
  const [mode, setMode] = useState<AnalysisMode>(preferences.defaultMode);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const runAnalysis = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const report = await analyzeWithEmbeddedEngine(bytecode, mode, preferences.qualityTier);
      addReport(report);
      router.push({ pathname: "/report", params: { id: report.id } });
    } catch (error) {
      Alert.alert("Analysis unavailable", error instanceof Error ? error.message : "The embedded engine could not complete this request.");
    } finally { setIsAnalyzing(false); }
  };

  return <ScreenContainer className="px-5" containerClassName="bg-background"><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><View style={styles.brandRow}><View style={styles.brandGlyph}><MaterialIcons name="memory" size={17} color="#2DD4E9" /></View><Text style={styles.brand}>HINSDALE</Text><View style={styles.localPill}><Text style={styles.localText}>EMBEDDED</Text></View></View><Text style={styles.headline}>Analyze EVM bytecode on device.</Text><Text style={styles.subheadline}>The bundled Rust engine produces the report. No selector table, security heuristic, or pseudo-source is generated in JavaScript.</Text></View>
    <View style={styles.inputHeader}><Text style={styles.fieldLabel}>EVM BYTECODE</Text></View>
    <TextInput value={bytecode} onChangeText={setBytecode} placeholder="Paste bytecode beginning with 0x…" placeholderTextColor="#607178" multiline textAlignVertical="top" autoCapitalize="none" autoCorrect={false} spellCheck={false} editable={!isAnalyzing} style={styles.input} />
    <Text style={styles.helper}>{bytecode ? `${bytecode.replace(/\s/g, "").replace(/^0x/i, "").length / 2 || 0} bytes submitted to the embedded engine` : "Bytecode is analyzed locally by the bundled native engine."}</Text>
    <Text style={styles.fieldLabel}>ENGINE PROFILE</Text><View style={styles.modeGrid}>{MODES.map((option) => <Pressable key={option.key} disabled={isAnalyzing} onPress={() => setMode(option.key)} style={({ pressed }) => [styles.modeCard, mode === option.key && styles.modeCardActive, pressed && styles.pressed]}><MaterialIcons name={option.icon} size={19} color={mode === option.key ? "#2DD4E9" : "#9DAAB0"} /><Text style={[styles.modeTitle, mode === option.key && styles.modeTitleActive]}>{option.title}</Text></Pressable>)}</View>
    <Pressable onPress={() => router.push("/settings")} disabled={isAnalyzing} style={({ pressed }) => [styles.profileCard, pressed && styles.pressed]}><View style={styles.profileIcon}><MaterialIcons name={preferences.qualityTier === "fast" ? "bolt" : preferences.qualityTier === "precise" ? "tune" : "science"} size={19} color="#2DD4E9" /></View><View style={styles.profileCopy}><Text style={styles.profileEyebrow}>EMBEDDED ENGINE PROFILE</Text><Text style={styles.profileTitle}>{QUALITY_TIER_DETAILS[preferences.qualityTier].label} <Text style={styles.profileStatus}>· {QUALITY_TIER_DETAILS[preferences.qualityTier].status}</Text></Text></View><MaterialIcons name="chevron-right" size={21} color="#718087" /></Pressable>
    <Pressable disabled={isAnalyzing} onPress={runAnalysis} style={({ pressed }) => [styles.analyzeButton, isAnalyzing && styles.disabled, pressed && styles.primaryPressed]}>{isAnalyzing ? <ActivityIndicator color="#101315" /> : <MaterialIcons name="play-arrow" size={20} color="#101315" />}<Text style={styles.analyzeText}>{isAnalyzing ? "Running embedded engine" : "Analyze bytecode"}</Text></Pressable>
    <View style={styles.privacyNote}><MaterialIcons name="shield" size={16} color="#718087" /><Text style={styles.privacyText}>The engine runs in the application package. Expo Go and web previews cannot load this native module; use a custom client or release build.</Text></View>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28, paddingTop: 8 }, header: { marginBottom: 28 }, brandRow: { alignItems: "center", flexDirection: "row", gap: 7 }, brandGlyph: { alignItems: "center", backgroundColor: "#15313A", borderRadius: 8, height: 28, justifyContent: "center", width: 28 }, brand: { color: "#F4F7F8", fontSize: 13, fontWeight: "900", letterSpacing: 1.5 }, localPill: { backgroundColor: "#10362D", borderRadius: 999, marginLeft: 2, paddingHorizontal: 7, paddingVertical: 3 }, localText: { color: "#47D7AC", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, headline: { color: "#F4F7F8", fontSize: 31, fontWeight: "800", letterSpacing: -1.05, lineHeight: 36, marginTop: 18, maxWidth: 330 }, subheadline: { color: "#9DAAB0", fontSize: 14, lineHeight: 20, marginTop: 10, maxWidth: 340 }, inputHeader: { marginBottom: 8 }, fieldLabel: { color: "#718087", fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 8 }, input: { backgroundColor: "#161D21", borderColor: "#344249", borderRadius: 15, borderWidth: 1, color: "#D5F5F8", fontFamily: "monospace", fontSize: 12, lineHeight: 18, minHeight: 145, padding: 14 }, helper: { color: "#718087", fontSize: 11, marginBottom: 24, marginTop: 7 }, modeGrid: { flexDirection: "row", gap: 8, marginBottom: 25 }, modeCard: { alignItems: "center", backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 13, borderWidth: 1, flex: 1, gap: 6, paddingVertical: 12 }, modeCardActive: { backgroundColor: "#15313A", borderColor: "#2DD4E9" }, modeTitle: { color: "#9DAAB0", fontSize: 11, fontWeight: "700" }, modeTitleActive: { color: "#D5F5F8" }, profileCard: { alignItems: "center", backgroundColor: "#161D21", borderColor: "#2B353B", borderRadius: 14, borderWidth: 1, flexDirection: "row", marginBottom: 14, padding: 12 }, profileIcon: { alignItems: "center", backgroundColor: "#15313A", borderRadius: 10, height: 36, justifyContent: "center", width: 36 }, profileCopy: { flex: 1, marginLeft: 10 }, profileEyebrow: { color: "#718087", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, profileTitle: { color: "#F4F7F8", fontSize: 13, fontWeight: "800", marginTop: 3 }, profileStatus: { color: "#9DAAB0", fontSize: 11, fontWeight: "600" }, analyzeButton: { alignItems: "center", backgroundColor: "#2DD4E9", borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 52 }, analyzeText: { color: "#101315", fontSize: 15, fontWeight: "900" }, privacyNote: { alignItems: "flex-start", flexDirection: "row", gap: 8, marginTop: 19, paddingHorizontal: 5 }, privacyText: { color: "#718087", flex: 1, fontSize: 11, lineHeight: 16 }, pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] }, primaryPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] }, disabled: { opacity: 0.55 },
});
