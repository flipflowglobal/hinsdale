import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import type { AnalysisMode } from "@/lib/hinsdale-data";
import { useHinsdale } from "@/lib/hinsdale-store";

const MODES: { key: AnalysisMode; title: string; detail: string }[] = [
  { key: "full", title: "Full report", detail: "Selectors, indicators, and source view" },
  { key: "security", title: "Security focus", detail: "Prioritize local opcode warnings" },
  { key: "signatures", title: "Signatures only", detail: "Recover known function selectors" },
];

export default function SettingsScreen() {
  const { reports, preferences, updatePreferences, clearReports } = useHinsdale();
  const confirmClear = () => {
    Alert.alert("Clear report history?", "All saved local reports will be removed from this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: clearReports },
    ]);
  };

  return (
    <ScreenContainer className="px-5" containerClassName="bg-background">
      <View style={styles.header}><Text style={styles.title}>Settings</Text><Text style={styles.subtitle}>Your device, your analysis workflow</Text></View>
      <Text style={styles.sectionLabel}>ANALYSIS</Text>
      <View style={styles.group}>
        {MODES.map((mode, index) => (
          <Pressable key={mode.key} onPress={() => updatePreferences({ defaultMode: mode.key })} style={({ pressed }) => [styles.modeRow, index !== 0 && styles.divider, pressed && styles.pressed]}>
            <View style={styles.modeText}><Text style={styles.modeTitle}>{mode.title}</Text><Text style={styles.modeDetail}>{mode.detail}</Text></View>
            <View style={[styles.radio, preferences.defaultMode === mode.key && styles.radioActive]}>{preferences.defaultMode === mode.key && <View style={styles.radioDot} />}</View>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>LOCAL STORAGE</Text>
      <View style={styles.group}>
        <View style={styles.settingRow}><View style={styles.modeText}><Text style={styles.modeTitle}>Save reports</Text><Text style={styles.modeDetail}>Keep up to 30 analyses on this device</Text></View><Switch value={preferences.historyEnabled} onValueChange={(value) => updatePreferences({ historyEnabled: value })} trackColor={{ false: "#39474F", true: "#2DD4E9" }} thumbColor={preferences.historyEnabled ? "#F4F7F8" : "#C7D1D5"} /></View>
        <Pressable disabled={!reports.length} onPress={confirmClear} style={({ pressed }) => [styles.clearRow, styles.divider, !reports.length && styles.disabled, pressed && styles.pressed]}><View style={styles.clearIcon}><MaterialIcons name="delete-outline" size={19} color="#F35D5D" /></View><View style={styles.modeText}><Text style={styles.clearTitle}>Clear saved reports</Text><Text style={styles.modeDetail}>{reports.length ? `${reports.length} report${reports.length === 1 ? "" : "s"} saved locally` : "No saved reports"}</Text></View><MaterialIcons name="chevron-right" size={22} color="#718087" /></Pressable>
      </View>

      <View style={styles.footer}><MaterialIcons name="memory" size={17} color="#718087" /><Text style={styles.footerText}>Hinsdale Mobile stores reports locally and does not upload submitted bytecode.</Text></View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 23, paddingTop: 8 },
  title: { color: "#F4F7F8", fontSize: 29, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: "#9DAAB0", fontSize: 13, marginTop: 4 },
  sectionLabel: { color: "#718087", fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginBottom: 8, marginTop: 17 },
  group: { backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  modeRow: { alignItems: "center", flexDirection: "row", minHeight: 70, paddingHorizontal: 15 },
  settingRow: { alignItems: "center", flexDirection: "row", minHeight: 74, paddingHorizontal: 15 },
  clearRow: { alignItems: "center", flexDirection: "row", minHeight: 68, paddingHorizontal: 15 },
  divider: { borderTopColor: "#2B353B", borderTopWidth: StyleSheet.hairlineWidth },
  modeText: { flex: 1, paddingRight: 12 },
  modeTitle: { color: "#F4F7F8", fontSize: 14, fontWeight: "700" },
  modeDetail: { color: "#9DAAB0", fontSize: 11, lineHeight: 16, marginTop: 3 },
  radio: { alignItems: "center", borderColor: "#718087", borderRadius: 10, borderWidth: 2, height: 20, justifyContent: "center", width: 20 },
  radioActive: { borderColor: "#2DD4E9" },
  radioDot: { backgroundColor: "#2DD4E9", borderRadius: 5, height: 10, width: 10 },
  clearIcon: { alignItems: "center", backgroundColor: "#3D191D", borderRadius: 10, height: 36, justifyContent: "center", marginRight: 11, width: 36 },
  clearTitle: { color: "#F35D5D", fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  footer: { alignItems: "flex-start", flexDirection: "row", gap: 8, marginTop: 25, paddingHorizontal: 4 },
  footerText: { color: "#718087", flex: 1, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
