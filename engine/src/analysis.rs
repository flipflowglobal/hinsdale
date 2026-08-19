use serde::{Deserialize, Serialize};

pub const JSON_SCHEMA_VERSION: &str = "hinsdale.report/v2";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QualityTier {
    Fast,
    Precise,
    Research,
}

impl Default for QualityTier {
    fn default() -> Self {
        Self::Fast
    }
}

impl QualityTier {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fast => "fast",
            Self::Precise => "precise",
            Self::Research => "research",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "fast" => Some(Self::Fast),
            "precise" => Some(Self::Precise),
            "research" => Some(Self::Research),
            _ => None,
        }
    }

    pub fn max_block_visits(self) -> usize {
        match self {
            Self::Fast => 1,
            Self::Precise => 3,
            Self::Research => 8,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisOptions {
    pub quality_tier: QualityTier,
    pub max_block_visits: usize,
}

impl Default for AnalysisOptions {
    fn default() -> Self {
        let quality_tier = QualityTier::Fast;
        Self {
            quality_tier,
            max_block_visits: quality_tier.max_block_visits(),
        }
    }
}

impl AnalysisOptions {
    pub fn for_tier(quality_tier: QualityTier) -> Self {
        Self {
            quality_tier,
            max_block_visits: quality_tier.max_block_visits(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityStatus {
    pub quality_tier: QualityTier,
    pub cfg_context: bool,
    pub private_function_candidates: bool,
    pub merged_symbolic_state: bool,
    pub storage_mapping_candidates: bool,
    pub bounded_path_exploration: bool,
    pub limitation: String,
}

impl CapabilityStatus {
    pub fn for_tier(quality_tier: QualityTier) -> Self {
        match quality_tier {
            QualityTier::Fast => Self {
                quality_tier,
                cfg_context: false,
                private_function_candidates: false,
                merged_symbolic_state: false,
                storage_mapping_candidates: false,
                bounded_path_exploration: false,
                limitation: "Fast mode is intended for triage. Dynamic control flow and inferred interfaces remain explicitly unresolved.".into(),
            },
            QualityTier::Precise => Self {
                quality_tier,
                cfg_context: true,
                private_function_candidates: true,
                merged_symbolic_state: true,
                storage_mapping_candidates: true,
                bounded_path_exploration: false,
                limitation: "Precise mode improves reconstruction with bounded static and merged-state evidence; it does not prove source equivalence or safety.".into(),
            },
            QualityTier::Research => Self {
                quality_tier,
                cfg_context: true,
                private_function_candidates: true,
                merged_symbolic_state: true,
                storage_mapping_candidates: true,
                bounded_path_exploration: true,
                limitation: "Research mode increases bounded exploration for hard blocks. Experimental observations require independent verification.".into(),
            },
        }
    }
}
