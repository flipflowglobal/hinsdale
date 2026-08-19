import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { type ComponentProps, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { SAMPLE_BYTECODE, buildAnalysisReport, bytecodeValidationMessage, type AnalysisMode } from "@/lib/hinsdale-data";
import { useHinsdale } from "@/lib/hinsdale-store";

const MODES: { key: AnalysisMode; title: string; icon: ComponentProps<typeof MaterialIcons>["name"] }[] = [
  { key: "full", title: "Full", icon: "analytics" },
  { key: "security", title: "Security", icon: "security" },
  { key: "signatures", title: "Selectors", icon: "functions" },
];

export default function AnalyzeScreen() {
  const { addReport, preferences } = useHinsdale();
  const [bytecode, setBytecode] = useState("");
  const [mode, setMode] = useState<AnalysisMode>(preferences.defaultMode);

  const runAnalysis = () => {
    const issue = bytecodeValidationMessage(bytecode);
    if (issue) {
      Alert.alert("Bytecode needed", issue);
      return;
    }
    const report = buildAnalysisReport(bytecode, mode);
    addReport(report);
    router.push({ pathname: "/report", params: { id: report.id } });
  };

  const loadSample = () => {
    setBytecode(SAMPLE_BYTECODE);
    setMode("full");
  };

  return (
    <ScreenContainer className="px-5" containerClassName="bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.brandRow}><View style={styles.brandGlyph}><MaterialIcons name="search" size={17} color="#2DD4E9" /></View><Text style={styles.brand}>HINSDALE</Text><View style={styles.localPill}><Text style={styles.localText}>LOCAL</Text></View></View>
          <Text style={styles.headline}>Inspect the contract beneath the interface.</Text>
          <Text style={styles.subheadline}>Paste EVM bytecode to recover known selectors and review local security indicators.</Text>
        </View>

        <View style={styles.inputHeader}><Text style={styles.fieldLabel}>EVM BYTECODE</Text><Pressable onPress={loadSample} style={({ pressed }) => [styles.sampleButton, pressed && styles.pressed]}><MaterialIcons name="auto-fix-high" size={14} color="#2DD4E9" /><Text style={styles.sampleText}>Use example</Text></Pressable></View>
        <TextInput
          value={bytecode}
          onChangeText={setBytecode}
          placeholder="0x608060405234…"
          placeholderTextColor="#607178"
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          style={styles.input}
        />
        <Text style={styles.helper}>{bytecode ? `${bytecode.replace(/\s/g, "").replace(/^0x/i, "").length / 2 || 0} byte characters entered` : "Your input stays on this device."}</Text>

        <Text style={styles.fieldLabel}>ANALYSIS MODE</Text>
        <View style={styles.modeGrid}>
          {MODES.map((option) => (
            <Pressable key={option.key} onPress={() => setMode(option.key)} style={({ pressed }) => [styles.modeCard, mode === option.key && styles.modeCardActive, pressed && styles.pressed]}>
              <MaterialIcons name={option.icon} size={19} color={mode === option.key ? "#2DD4E9" : "#9DAAB0"} />
              <Text style={[styles.modeTitle, mode === option.key && styles.modeTitleActive]}>{option.title}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={runAnalysis} style={({ pressed }) => [styles.analyzeButton, pressed && styles.primaryPressed]}>
          <MaterialIcons name="play-arrow" size={20} color="#101315" />
          <Text style={styles.analyzeText}>Analyze bytecode</Text>
        </Pressable>

        <View style={styles.privacyNote}><MaterialIcons name="lock-outline" size={16} color="#718087" /><Text style={styles.privacyText}>Local mobile inspection. For complete symbolic decompilation, use the Rust Hinsdale pipeline.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28, paddingTop: 8 },
  header: { marginBottom: 28 },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  brandGlyph: { alignItems: "center", backgroundColor: "#15313A", borderRadius: 8, height: 28, justifyContent: "center", width: 28 },
  brand: { color: "#F4F7F8", fontSize: 13, fontWeight: "900", letterSpacing: 1.5 },
  localPill: { backgroundColor: "#10362D", borderRadius: 999, marginLeft: 2, paddingHorizontal: 7, paddingVertical: 3 },
  localText: { color: "#47D7AC", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  headline: { color: "#F4F7F8", fontSize: 31, fontWeight: "800", letterSpacing: -1.05, lineHeight: 36, marginTop: 18, maxWidth: 330 },
  subheadline: { color: "#9DAAB0", fontSize: 14, lineHeight: 20, marginTop: 10, maxWidth: 340 },
  inputHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  fieldLabel: { color: "#718087", fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 8 },
  sampleButton: { alignItems: "center", flexDirection: "row", gap: 5, marginBottom: 8, paddingHorizontal: 3, paddingVertical: 4 },
  sampleText: { color: "#2DD4E9", fontSize: 12, fontWeight: "700" },
  input: { backgroundColor: "#161D21", borderColor: "#344249", borderRadius: 15, borderWidth: 1, color: "#D5F5F8", fontFamily: "monospace", fontSize: 12, lineHeight: 18, minHeight: 145, padding: 14 },
  helper: { color: "#718087", fontSize: 11, marginBottom: 24, marginTop: 7 },
  modeGrid: { flexDirection: "row", gap: 8, marginBottom: 25 },
  modeCard: { alignItems: "center", backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 13, borderWidth: 1, flex: 1, gap: 6, paddingVertical: 12 },
  modeCardActive: { backgroundColor: "#15313A", borderColor: "#2DD4E9" },
  modeTitle: { color: "#9DAAB0", fontSize: 11, fontWeight: "700" },
  modeTitleActive: { color: "#D5F5F8" },
  analyzeButton: { alignItems: "center", backgroundColor: "#2DD4E9", borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 52 },
  analyzeText: { color: "#101315", fontSize: 15, fontWeight: "900" },
  privacyNote: { alignItems: "flex-start", flexDirection: "row", gap: 8, marginTop: 19, paddingHorizontal: 5 },
  privacyText: { color: "#718087", flex: 1, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  primaryPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});
