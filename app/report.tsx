import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { type ComponentProps, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { QUALITY_TIER_DETAILS, formatByteCount, formatReportTime, riskAppearance, type AnalysisReport } from "@/lib/hinsdale-data";
import { useHinsdale } from "@/lib/hinsdale-store";

type ReportSection = "Overview" | "Security" | "Functions" | "Source";

function SectionTabs({ active, onChange }: { active: ReportSection; onChange: (section: ReportSection) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {(["Overview", "Security", "Functions", "Source"] as ReportSection[]).map((section) => (
        <Pressable key={section} onPress={() => onChange(section)} style={({ pressed }) => [styles.tab, active === section && styles.tabActive, pressed && styles.pressed]}>
          <Text style={[styles.tabText, active === section && styles.tabTextActive]}>{section}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Overview({ report }: { report: AnalysisReport }) {
  const risk = riskAppearance(report.riskLevel);
  const qualityTier = report.qualityTier ?? "fast";
  const profile = QUALITY_TIER_DETAILS[qualityTier];
  return (
    <View style={styles.sectionStack}>
      <View style={styles.metricGrid}>
        <Metric label="Bytecode" value={formatByteCount(report.bytecodeLength)} />
        <Metric label="Instructions" value={report.instructionCount} />
        <Metric label="Blocks" value={report.blockCount} />
        <Metric label="Selectors" value={report.functions.length} />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Analysis indicators</Text>
          <MaterialIcons name="analytics" size={18} color="#2DD4E9" />
        </View>
        <View style={styles.indicatorRow}>
          <View style={[styles.dot, { backgroundColor: report.isProxy ? "#F4B942" : "#47D7AC" }]} />
          <Text style={styles.indicatorText}>{report.isProxy ? "Proxy-like delegatecall pattern observed" : "No proxy-like pattern observed"}</Text>
        </View>
        <View style={styles.indicatorRow}>
          <View style={[styles.dot, { backgroundColor: report.callCount > 0 ? risk.color : "#47D7AC" }]} />
          <Text style={styles.indicatorText}>{report.callCount ? `${report.callCount} call-like opcode indicator(s) observed` : "No call-like opcode indicators observed"}</Text>
        </View>
        <View style={styles.indicatorRow}>
          <View style={[styles.dot, { backgroundColor: report.storageWrites > 0 ? "#F4B942" : "#47D7AC" }]} />
          <Text style={styles.indicatorText}>{report.storageWrites ? `${report.storageWrites} storage-write indicator(s) observed` : "No storage-write opcode indicators observed"}</Text>
        </View>
      </View>

      <View style={styles.noteCard}>
        <MaterialIcons name="info-outline" size={19} color="#9DAAB0" />
        <Text style={styles.noteText}>This local companion inspects bytecode indicators and known selectors. Use the Hinsdale Rust pipeline for a complete symbolic decompilation and audit.</Text>
      </View>
      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View><Text style={styles.profileEyebrow}>REQUESTED ENGINE PROFILE</Text><Text style={styles.profileTitle}>{profile.label}</Text></View>
          <View style={[styles.profileStatus, qualityTier === "fast" && styles.profileStatusAvailable]}><Text style={[styles.profileStatusText, qualityTier === "fast" && styles.profileStatusTextAvailable]}>{profile.status}</Text></View>
        </View>
        <Text style={styles.profileDescription}>{qualityTier === "fast" ? "This report used the local Fast inspection. Rust engine foundations are available in the workspace but are not connected to the mobile runtime." : `This report records the ${profile.label} engine profile. The mobile client executed Fast local inspection; the engine foundations require a secure service or native bridge before they can execute here.`}</Text>
      </View>
    </View>
  );
}

function Security({ report }: { report: AnalysisReport }) {
  if (report.mode === "signatures") {
    return <EmptySection icon="security" title="Security scan was not requested" body="This report was run in signatures-only mode. Start a full or security-focused analysis to review bytecode indicators." />;
  }
  if (!report.findings.length) {
    return <EmptySection icon="verified-user" title="No local warnings" body="No security indicators were identified by this lightweight local scan. This is not a full security assurance." />;
  }
  return (
    <View style={styles.sectionStack}>
      {report.findings.map((finding) => {
        const color = finding.severity === "Critical" ? "#F35D5D" : finding.severity === "High" ? "#F98254" : "#F4B942";
        return (
          <View key={finding.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.severityPill, { backgroundColor: `${color}22` }]}><Text style={[styles.severityText, { color }]}>{finding.severity}</Text></View>
              <MaterialIcons name="warning-amber" size={20} color={color} />
            </View>
            <Text style={styles.findingTitle}>{finding.title}</Text>
            <Text style={styles.findingDescription}>{finding.description}</Text>
            <View style={styles.evidence}><Text style={styles.evidenceText}>{finding.evidence}</Text></View>
          </View>
        );
      })}
    </View>
  );
}

function Functions({ report }: { report: AnalysisReport }) {
  if (!report.functions.length) {
    return <EmptySection icon="functions" title="No known selectors recovered" body="The submitted bytes do not include a selector from the local reference table. A full desktop pipeline may still resolve unknown dispatch paths." />;
  }
  return (
    <View style={styles.sectionStack}>
      {report.functions.map((fn) => (
        <View key={fn.selector} style={styles.functionCard}>
          <View style={styles.functionIcon}><MaterialIcons name="functions" size={18} color="#2DD4E9" /></View>
          <View style={styles.functionContent}>
            <Text style={styles.functionTitle}>{fn.signature ?? "Unknown function"}</Text>
            <Text style={styles.functionSelector}>{fn.selector}</Text>
          </View>
          <View style={[styles.functionPill, { backgroundColor: fn.isView ? "#10362D" : "#15313A" }]}>
            <Text style={[styles.functionPillText, { color: fn.isView ? "#47D7AC" : "#2DD4E9" }]}>{fn.isView ? "View" : fn.confidence}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Source({ report }: { report: AnalysisReport }) {
  return (
    <View style={styles.sectionStack}>
      <View style={styles.codeHeader}><Text style={styles.codeHeaderText}>PSEUDO-SOLIDITY</Text><Text style={styles.codeHeaderText}>LOCAL RECONSTRUCTION</Text></View>
      <ScrollView horizontal style={styles.codeCard} contentContainerStyle={styles.codeScroll} showsHorizontalScrollIndicator>
        <Text style={styles.codeText}>{report.pseudoSolidity}</Text>
      </ScrollView>
      <Text style={styles.sourceNote}>Recovered source is intentionally conservative. It reflects only selectors and opcode indicators available in the local mobile analysis model.</Text>
    </View>
  );
}

function EmptySection({ icon, title, body }: { icon: ComponentProps<typeof MaterialIcons>["name"]; title: string; body: string }) {
  return (
    <View style={styles.emptySection}>
      <View style={styles.emptyIcon}><MaterialIcons name={icon} size={24} color="#2DD4E9" /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export default function ReportScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { reports } = useHinsdale();
  const report = reports.find((item) => item.id === id);
  const [section, setSection] = useState<ReportSection>("Overview");

  if (!report) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5 py-4">
        <View style={styles.missingReport}>
          <Text style={styles.emptyTitle}>Report unavailable</Text>
          <Text style={styles.emptyBody}>This local result is no longer available. Start another analysis from the Analyze tab.</Text>
          <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Return to Analyze</Text></Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const risk = riskAppearance(report.riskLevel);
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-background" className="px-5">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={22} color="#F4F7F8" /></Pressable>
        <View><Text style={styles.screenTitle}>Analysis report</Text><Text style={styles.screenSubtitle}>{formatReportTime(report.createdAt)}</Text></View>
        <View style={{ width: 38 }} />
      </View>

      <View style={[styles.riskCard, { backgroundColor: risk.surface, borderColor: `${risk.color}55` }]}>
        <View>
          <Text style={styles.riskEyebrow}>SECURITY POSTURE</Text>
          <Text style={[styles.riskLabel, { color: risk.color }]}>{risk.label}</Text>
          <Text style={styles.riskDescription}>{report.findings.length ? `${report.findings.length} local finding${report.findings.length === 1 ? "" : "s"} need attention` : "No local warnings in this analysis mode"}</Text>
        </View>
        <View style={[styles.scoreCircle, { borderColor: risk.color }]}><Text style={[styles.scoreValue, { color: risk.color }]}>{report.riskScore}</Text><Text style={styles.scoreCaption}>/100</Text></View>
      </View>

      <Text numberOfLines={1} style={styles.bytecodePreview}>{report.bytecodePreview}</Text>
      <SectionTabs active={section} onChange={setSection} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentBottom}>
        {section === "Overview" && <Overview report={report} />}
        {section === "Security" && <Security report={report} />}
        {section === "Functions" && <Functions report={report} />}
        {section === "Source" && <Source report={report} />}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 18, paddingTop: 4 },
  backButton: { alignItems: "center", backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 12, borderWidth: 1, height: 38, justifyContent: "center", width: 38 },
  screenTitle: { color: "#F4F7F8", fontSize: 16, fontWeight: "700", textAlign: "center" },
  screenSubtitle: { color: "#9DAAB0", fontSize: 11, marginTop: 2, textAlign: "center" },
  riskCard: { alignItems: "center", borderRadius: 20, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: 18 },
  riskEyebrow: { color: "#9DAAB0", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  riskLabel: { fontSize: 27, fontWeight: "800", letterSpacing: -0.5, marginTop: 3 },
  riskDescription: { color: "#C7D1D5", fontSize: 12, marginTop: 4, maxWidth: 185 },
  scoreCircle: { alignItems: "center", borderRadius: 35, borderWidth: 3, height: 70, justifyContent: "center", width: 70 },
  scoreValue: { fontSize: 24, fontWeight: "800", lineHeight: 26 },
  scoreCaption: { color: "#9DAAB0", fontSize: 10 },
  bytecodePreview: { color: "#718087", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 11, marginTop: 14 },
  tabs: { gap: 8, paddingVertical: 16 },
  tab: { borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8 },
  tabActive: { backgroundColor: "#15313A" },
  tabText: { color: "#9DAAB0", fontSize: 13, fontWeight: "700" },
  tabTextActive: { color: "#2DD4E9" },
  contentBottom: { paddingBottom: 24 },
  sectionStack: { gap: 12 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 14, borderWidth: 1, flexBasis: "47%", flexGrow: 1, padding: 13 },
  metricValue: { color: "#F4F7F8", fontSize: 18, fontWeight: "800" },
  metricLabel: { color: "#9DAAB0", fontSize: 11, marginTop: 3 },
  card: { backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 16, borderWidth: 1, padding: 15 },
  cardHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cardTitle: { color: "#F4F7F8", fontSize: 15, fontWeight: "700" },
  indicatorRow: { alignItems: "flex-start", flexDirection: "row", gap: 9, marginTop: 13 },
  dot: { borderRadius: 4, height: 7, marginTop: 5, width: 7 },
  indicatorText: { color: "#C7D1D5", flex: 1, fontSize: 13, lineHeight: 18 },
  noteCard: { alignItems: "flex-start", backgroundColor: "#151C20", borderColor: "#2B353B", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, padding: 14 },
  noteText: { color: "#9DAAB0", flex: 1, fontSize: 12, lineHeight: 17 },
  profileCard: { backgroundColor: "#161D21", borderColor: "#2B353B", borderRadius: 14, borderWidth: 1, padding: 14 },
  profileHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  profileEyebrow: { color: "#718087", fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  profileTitle: { color: "#F4F7F8", fontSize: 17, fontWeight: "800", marginTop: 2 },
  profileStatus: { backgroundColor: "#313136", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  profileStatusAvailable: { backgroundColor: "#10362D" },
  profileStatusText: { color: "#C7D1D5", fontSize: 10, fontWeight: "800" },
  profileStatusTextAvailable: { color: "#47D7AC" },
  profileDescription: { color: "#9DAAB0", fontSize: 12, lineHeight: 17, marginTop: 11 },
  severityPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  severityText: { fontSize: 11, fontWeight: "800" },
  findingTitle: { color: "#F4F7F8", fontSize: 16, fontWeight: "800", marginTop: 12 },
  findingDescription: { color: "#C7D1D5", fontSize: 13, lineHeight: 19, marginTop: 7 },
  evidence: { alignSelf: "flex-start", backgroundColor: "#101315", borderRadius: 7, marginTop: 12, paddingHorizontal: 8, paddingVertical: 6 },
  evidenceText: { color: "#9DAAB0", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 10 },
  functionCard: { alignItems: "center", backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 11, padding: 13 },
  functionIcon: { alignItems: "center", backgroundColor: "#15313A", borderRadius: 10, height: 36, justifyContent: "center", width: 36 },
  functionContent: { flex: 1 },
  functionTitle: { color: "#F4F7F8", fontSize: 13, fontWeight: "700" },
  functionSelector: { color: "#9DAAB0", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 11, marginTop: 3 },
  functionPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  functionPillText: { fontSize: 10, fontWeight: "800" },
  emptySection: { alignItems: "center", backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 18, borderWidth: 1, marginTop: 8, paddingHorizontal: 26, paddingVertical: 32 },
  emptyIcon: { alignItems: "center", backgroundColor: "#15313A", borderRadius: 14, height: 48, justifyContent: "center", width: 48 },
  emptyTitle: { color: "#F4F7F8", fontSize: 17, fontWeight: "800", marginTop: 14, textAlign: "center" },
  emptyBody: { color: "#9DAAB0", fontSize: 13, lineHeight: 19, marginTop: 7, textAlign: "center" },
  codeHeader: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 3 },
  codeHeaderText: { color: "#718087", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  codeCard: { backgroundColor: "#101315", borderColor: "#2B353B", borderRadius: 14, borderWidth: 1, maxHeight: 250, padding: 15 },
  codeScroll: { minWidth: "100%" },
  codeText: { color: "#A9DEE5", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 12, lineHeight: 20 },
  sourceNote: { color: "#9DAAB0", fontSize: 12, lineHeight: 18, paddingHorizontal: 3 },
  missingReport: { alignItems: "center", flex: 1, justifyContent: "center" },
  primaryButton: { alignItems: "center", backgroundColor: "#2DD4E9", borderRadius: 12, marginTop: 20, paddingHorizontal: 18, paddingVertical: 13 },
  primaryButtonText: { color: "#101315", fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
