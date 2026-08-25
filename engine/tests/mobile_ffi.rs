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
    assert_eq!(report["report"]["schema_policy"]["policy_version"], "1.0");
    assert_eq!(
        report["report"]["schema_policy"]["compatibility_mode"],
        "additive-optional"
    );
}

#[test]
fn embedded_bridge_recovers_abi_events_and_custom_errors_with_evidence() {
    let report = call_bridge(
        concat!(
            "7fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "60006000a1",
            "6308c379a060005260046000fd"
        ),
        "research",
    );

    assert_eq!(report["ok"], true);
    let events = report["report"]["signatures"]["abi_events"]
        .as_array()
        .expect("ABI event array");
    assert_eq!(events.len(), 1);
    assert_eq!(
        events[0]["known_signature"],
        "Transfer(address,address,uint256)"
    );
    assert_eq!(events[0]["parameters"].as_array().map(Vec::len), Some(3));
    assert_eq!(events[0]["evidence"][0]["log_opcode"], "LOG1");
    assert!(events[0]["evidence"][0]["log_offset"].is_number());

    let errors = report["report"]["signatures"]["custom_errors"]
        .as_array()
        .expect("custom error array");
    assert_eq!(errors.len(), 1);
    assert_eq!(errors[0]["known_signature"], "Error(string)");
    assert_eq!(errors[0]["evidence"][0]["revert_data_bytes_hint"], 4);
    assert_eq!(errors[0]["evidence"][0]["argument_word_count"], 0);
}

#[test]
fn embedded_bridge_keeps_unknown_abi_hashes_unlabelled_with_evidence() {
    let report = call_bridge(
        concat!(
            "7faaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "60006000a1",
            "63deadbeef60005260046000fd"
        ),
        "research",
    );

    let events = report["report"]["signatures"]["abi_events"]
        .as_array()
        .expect("ABI event array");
    assert_eq!(events[0]["known_signature"], serde_json::Value::Null);
    assert_eq!(events[0]["name"], "UnknownEvent");
    assert_eq!(events[0]["parameters"].as_array().map(Vec::len), Some(0));
    assert!(events[0]["evidence"][0]["topic0_push_offset"].is_number());

    let errors = report["report"]["signatures"]["custom_errors"]
        .as_array()
        .expect("custom error array");
    assert_eq!(errors[0]["known_signature"], serde_json::Value::Null);
    assert_eq!(errors[0]["name"], "CustomError_deadbeef");
    assert_eq!(errors[0]["parameters"].as_array().map(Vec::len), Some(0));
    assert!(errors[0]["evidence"][0]["selector_push_offset"].is_number());
}

#[test]
fn embedded_bridge_returns_a_typed_error_for_invalid_input() {
    let result = call_bridge("not-hex", "fast");
    assert_eq!(result["ok"], false);
    assert_eq!(result["error"]["code"], "INVALID_INPUT");
}
