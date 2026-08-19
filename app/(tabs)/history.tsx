import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { formatByteCount, formatReportTime, riskAppearance, type AnalysisReport } from "@/lib/hinsdale-data";
import { useHinsdale } from "@/lib/hinsdale-store";

function HistoryItem({ report, onRemove }: { report: AnalysisReport; onRemove: () => void }) {
  const risk = riskAppearance(report.riskLevel);
  return (
    <Pressable onPress={() => router.push({ pathname: "/report", params: { id: report.id } })} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <View style={[styles.riskMark, { backgroundColor: risk.surface, borderColor: `${risk.color}66` }]}><Text style={[styles.riskMarkText, { color: risk.color }]}>{report.riskScore}</Text></View>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle}>{risk.label}</Text>
        <Text style={styles.itemMeta}>{formatByteCount(report.bytecodeLength)} · {report.functions.length} selector{report.functions.length === 1 ? "" : "s"}</Text>
        <Text style={styles.itemDate}>{formatReportTime(report.createdAt)}</Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={10} style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}><MaterialIcons name="close" color="#9DAAB0" size={18} /></Pressable>
    </Pressable>
  );
}

export default function HistoryScreen() {
  const { reports, isReady, removeReport } = useHinsdale();
  const removeWithConfirmation = (report: AnalysisReport) => {
    Alert.alert("Remove report?", "This local analysis result will be removed from your device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeReport(report.id) },
    ]);
  };

  return (
    <ScreenContainer className="px-5" containerClassName="bg-background">
      <View style={styles.header}><View><Text style={styles.title}>History</Text><Text style={styles.subtitle}>Local analysis reports</Text></View><View style={styles.countPill}><Text style={styles.countText}>{reports.length}</Text></View></View>
      {!isReady ? (
        <View style={styles.loading}><ActivityIndicator color="#2DD4E9" /></View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={reports.length ? styles.listContent : styles.emptyContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <HistoryItem report={item} onRemove={() => removeWithConfirmation(item)} />}
          ListEmptyComponent={<View style={styles.empty}><View style={styles.emptyIcon}><MaterialIcons name="history" color="#2DD4E9" size={26} /></View><Text style={styles.emptyTitle}>No saved reports</Text><Text style={styles.emptyBody}>Run a bytecode analysis to keep a local report here for later review.</Text></View>}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingBottom: 18, paddingTop: 8 },
  title: { color: "#F4F7F8", fontSize: 29, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: "#9DAAB0", fontSize: 13, marginTop: 3 },
  countPill: { alignItems: "center", backgroundColor: "#15313A", borderRadius: 999, height: 30, justifyContent: "center", minWidth: 30, paddingHorizontal: 8 },
  countText: { color: "#2DD4E9", fontSize: 13, fontWeight: "800" },
  listContent: { gap: 10, paddingBottom: 24 },
  item: { alignItems: "center", backgroundColor: "#1C2226", borderColor: "#2B353B", borderRadius: 16, borderWidth: 1, flexDirection: "row", padding: 12 },
  riskMark: { alignItems: "center", borderRadius: 13, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  riskMarkText: { fontSize: 17, fontWeight: "800" },
  itemContent: { flex: 1, marginLeft: 12 },
  itemTitle: { color: "#F4F7F8", fontSize: 14, fontWeight: "800" },
  itemMeta: { color: "#C7D1D5", fontSize: 11, marginTop: 4 },
  itemDate: { color: "#718087", fontSize: 11, marginTop: 3 },
  removeButton: { alignItems: "center", height: 34, justifyContent: "center", width: 34 },
  emptyContent: { flexGrow: 1, justifyContent: "center", paddingBottom: 80 },
  empty: { alignItems: "center", paddingHorizontal: 32 },
  emptyIcon: { alignItems: "center", backgroundColor: "#15313A", borderRadius: 16, height: 54, justifyContent: "center", width: 54 },
  emptyTitle: { color: "#F4F7F8", fontSize: 18, fontWeight: "800", marginTop: 15 },
  emptyBody: { color: "#9DAAB0", fontSize: 13, lineHeight: 19, marginTop: 7, textAlign: "center" },
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
