import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { AnalysisReport, AnalysisMode } from "@/lib/hinsdale-data";

type Preferences = {
  historyEnabled: boolean;
  defaultMode: AnalysisMode;
};

type HinsdaleContextValue = {
  reports: AnalysisReport[];
  preferences: Preferences;
  isReady: boolean;
  addReport: (report: AnalysisReport) => void;
  removeReport: (id: string) => void;
  clearReports: () => void;
  updatePreferences: (next: Partial<Preferences>) => void;
};

const REPORTS_KEY = "hinsdale.mobile.reports.v1";
const PREFERENCES_KEY = "hinsdale.mobile.preferences.v1";
const DEFAULT_PREFERENCES: Preferences = { historyEnabled: true, defaultMode: "full" };
const HinsdaleContext = createContext<HinsdaleContextValue | null>(null);

export function HinsdaleProvider({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [storedReports, storedPreferences] = await AsyncStorage.multiGet([REPORTS_KEY, PREFERENCES_KEY]);
        if (storedReports[1]) setReports(JSON.parse(storedReports[1]) as AnalysisReport[]);
        if (storedPreferences[1]) setPreferences({ ...DEFAULT_PREFERENCES, ...(JSON.parse(storedPreferences[1]) as Partial<Preferences>) });
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const addReport = useCallback(
    (report: AnalysisReport) => {
      setReports((current) => {
        const next = [report, ...current].slice(0, 30);
        if (preferences.historyEnabled) void AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(next));
        return next;
      });
    },
    [preferences.historyEnabled],
  );

  const removeReport = useCallback((id: string) => {
    setReports((current) => {
      const next = current.filter((report) => report.id !== id);
      void AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearReports = useCallback(() => {
    setReports([]);
    void AsyncStorage.removeItem(REPORTS_KEY);
  }, []);

  const updatePreferences = useCallback((next: Partial<Preferences>) => {
    setPreferences((current) => {
      const merged = { ...current, ...next };
      void AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(merged));
      return merged;
    });
  }, []);

  const value = useMemo(
    () => ({ reports, preferences, isReady, addReport, removeReport, clearReports, updatePreferences }),
    [reports, preferences, isReady, addReport, removeReport, clearReports, updatePreferences],
  );

  return <HinsdaleContext.Provider value={value}>{children}</HinsdaleContext.Provider>;
}

export function useHinsdale() {
  const context = useContext(HinsdaleContext);
  if (!context) throw new Error("useHinsdale must be used within HinsdaleProvider");
  return context;
}
