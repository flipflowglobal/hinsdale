# Hinsdale Report Schema Compatibility Policy

## Status and Scope

This policy governs every artifact emitted through the Hinsdale public report envelope, including the Rust CLI, mobile FFI, persisted mobile history, benchmark output, and any future external consumer. The current supported schema is **`hinsdale.report/v2`**. The policy version is **`1.0`** and is emitted in every current report as `schema_policy` metadata.

> **Compatibility is a contract, not an inference.** A consumer must inspect `schema_version` before parsing a report and must not use a versioned field whose documented meaning it does not support.

| Item | Current commitment |
|---|---|
| Supported report schema | `hinsdale.report/v2` |
| Compatibility mode | `additive-optional` |
| Breaking-change rule | Publish a new schema major, such as `hinsdale.report/v3` |
| Current migration requirement | `false` |
| Current mobile persistence key | `hinsdale.mobile.reports.v2` |

## v2 Compatibility Rules

Within `hinsdale.report/v2`, producers may add **optional** fields and optional nested objects. They may not remove a required v2 field, change a required field’s type, reinterpret existing values, weaken a stated validation guarantee, or make an optional v2 field required. Consumers must ignore fields they do not recognize, retain their existing required-field validation, and safely default optional fields that are absent.

The ABI recovery additions follow this rule. `schema_policy`, `signatures.abi_events`, and `signatures.custom_errors` are additive v2 fields. `abi_events` and `custom_errors` preserve raw bytecode evidence, confidence, and unknown values rather than manufacturing ABI declarations. A v2 consumer that does not render these fields remains compatible; a capable consumer may use them only after validating their types and evidence structure.

| Change category | Allowed in v2 | Required producer action |
|---|---:|---|
| New optional field | Yes | Document the field, set safe defaults, and add contract tests. |
| New optional enum value | Only if consumers already handle unknown values | Document fallback behavior and test it. |
| New required field | No | Publish the next schema major. |
| Type, unit, or semantic change | No | Publish the next schema major and a migration. |
| Removal or rename | No | Deprecate first, then remove only in the next schema major. |

## Migration and Persistence

Mobile clients accept and persist only `hinsdale.report/v2`. Historical objects that fail the v2 contract are excluded from history rather than coerced into a fabricated report. A future schema-major migration must be explicit, deterministic, idempotent, and testable. It must either transform an old report into the new contract while retaining bytecode provenance, or preserve the old report as read-only history with an explicit unsupported-version state.

Every schema-major release must include all of the following before it becomes a release candidate: a machine-readable schema file; a migration guide; a compatibility table; fixture reports for the prior and new schema; FFI, CLI, and mobile persistence tests; and a rollback statement. The policy metadata must set `migration_required` to `true` whenever a consumer action is needed to safely interpret the new schema.

## Deprecation Process

A field or behavior may be deprecated only after it is documented in the schema-policy changelog and a machine-readable replacement or migration path is available. Deprecations require at least **two released engine versions and 90 calendar days**, whichever is longer, before removal in a new schema major. Security or data-integrity defects may use an accelerated process, but the release notes must state the reason, affected versions, mitigation, and rollback path.

The current v2 report has no pending field deprecations. ABI recovery labels are not a source of truth: a recognized label may be corrected as an additive confidence or evidence improvement, while a change that alters a stable field’s semantics requires a new schema major.

## Conformance Requirements

Before release, maintainers must verify that the Rust report serializes the declared `schema_version` and `schema_policy`, the JSON schema accepts the current output, the FFI envelope preserves it, and the mobile client validates and persists it. Tests must cover known ABI events, known custom errors, unknown event topics, unknown custom-error selectors, absent optional ABI fields, and rejected schema-major versions.

The authoritative machine-readable v2 definition is `engine/schema/hinsdale.report.v2.json`; this document defines the compatibility behavior around it.
