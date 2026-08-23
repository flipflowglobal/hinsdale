use std::ffi::{CStr, CString};

fn call_bridge(hex: &str, tier: &str) -> serde_json::Value {
    let hex = CString::new(hex).expect("valid bridge input");
    let tier = CString::new(tier).expect("valid bridge tier");
    let pointer = hinsdale::ffi::hins_analyze_enveloped_json(hex.as_ptr(), tier.as_ptr());
    assert!(
        !pointer.is_null(),
        "bridge must always return a JSON envelope"
    );
    let text = unsafe { CStr::from_ptr(pointer) }
        .to_str()
        .expect("bridge UTF-8")
        .to_owned();
    hinsdale::ffi::hins_free_str(pointer);
    serde_json::from_str(&text).expect("bridge JSON")
}

#[test]
fn embedded_bridge_returns_the_versioned_engine_report() {
    let report = call_bridge(
        "363d3d373d3d3d363d7300000000000000000000000000000000000000005af43d82803e903d91602b57fd5bf3",
        "precise",
    );

    assert_eq!(report["ok"], true);
    assert_eq!(report["report"]["schema_version"], "hinsdale.report/v2");
    assert_eq!(report["report"]["metadata"]["analysis_profile"], "precise");
    assert_eq!(report["report"]["metadata"]["bytecode_len"], 45);
    assert_eq!(
        report["report"]["metadata"]["bytecode_sha256"]
            .as_str()
            .map(str::len),
        Some(64)
    );
}

#[test]
fn embedded_bridge_returns_a_typed_error_for_invalid_input() {
    let result = call_bridge("not-hex", "fast");
    assert_eq!(result["ok"], false);
    assert_eq!(result["error"]["code"], "INVALID_INPUT");
}
