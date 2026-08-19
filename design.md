# Hinsdale Mobile Interface Design

## Product Direction

Hinsdale Mobile translates the referenced EVM decompiler into a focused, device-native bytecode analysis companion. The application is designed for analysts who need to begin an audit, inspect a concise security posture, and drill into decoded contract details from a phone without replicating the desktop code editor. The experience is optimised for one-handed, portrait (9:16) use and follows iOS conventions through a clear hierarchy, generous touch targets, native tab navigation, and modal detail views.

## Screen List

| Screen | Primary content and functionality |
|---|---|
| **Analyze** | A bytecode entry area with a paste action, analysis mode options, and a clear primary action. The result state surfaces the contract’s risk score, detected functions, and high-priority findings. |
| **Report Detail** | A vertically segmented report containing Overview, Security, Functions, and Decompiled views. Each section prioritizes plain-language findings before expandable technical detail. |
| **History** | A searchable local record of analyses showing contract label, timestamp, score, and result status. Users can reopen or remove an entry. |
| **Settings** | Local app preferences, including automatic history retention and the default analysis mode. No account or cloud-storage flow is introduced. |

## Key User Flows

| User goal | Mobile flow |
|---|---|
| Assess an EVM contract | Open **Analyze** → paste hex bytecode → select an analysis mode → tap **Analyze bytecode** → review the scored report. |
| Investigate a security concern | Open an analysis report → tap **Security** → select a finding → read the impact and evidence in an expandable detail card. |
| Check decoded contract functionality | Open a report → tap **Functions** → scan detected selectors and recovered signatures → open a function to view its selector and confidence. |
| Resume a previous review | Open **History** → select an analysis row → return to its report detail with the same section structure. |
| Change app behavior | Open **Settings** → adjust local history and preferred analysis type using native switches or selection rows. |

## Layout and Interaction Patterns

The Analyze screen keeps the primary input and action in the lower thumb zone. The result is presented as a compact report card with a prominent risk badge, a short explanatory summary, and section shortcuts. The Report Detail screen uses a segmented control beneath the navigation header so that broad report areas remain reachable without excessive scrolling. Technical code and bytecode are monospaced, horizontally scrollable where necessary, and visually secondary to the audit conclusion. History uses an efficient native list and supports only intentional destructive actions with confirmation.

## Color Choices

The brand relies on a deep charcoal canvas (**#101315**) to evoke a technical analysis environment, an electric cyan accent (**#2DD4E9**) for active interactions and trusted information, a high-signal red (**#F35D5D**) for critical risk, amber (**#F4B942**) for elevated risk, and mint (**#47D7AC**) for low-risk and confirmed states. Elevated cards use graphite (**#1C2226**) with subtle slate dividers (**#2B353B**). Primary text uses **#F4F7F8** while metadata uses **#9DAAB0** for strong legibility in compact developer-facing views.

## Domain Model

| Model | Key fields | Purpose |
|---|---|---|
| **AnalysisReport** | id, bytecodePreview, createdAt, riskLevel, riskScore, functions, findings, pseudoSolidity | Holds a complete locally available analysis result. |
| **SecurityFinding** | id, title, severity, description, evidence | Represents an individual contract warning. |
| **RecoveredFunction** | selector, signature, confidence, payable | Represents a decoded or inferred EVM function. |
| **AnalysisPreferences** | historyEnabled, defaultMode | Stores purely local user preferences. |

## Scope Decision

The mobile build delivers a high-fidelity interaction model and local sample-report experience based on the source project’s report structure. Executing arbitrary EVM decompilation natively requires a portable analysis engine or remote service, neither of which is available in the referenced project’s current Rust/Python desktop implementation. The app therefore clearly represents analysis data locally and preserves an architecture that can be connected to an appropriate engine in a later release.

## Quality Tiers and Capability Disclosure

The expanded product uses three user-selectable **requested engine profiles**. The mobile client continues to execute only the Fast local inspection; Precise and Research are explicitly labeled as roadmap profiles until an external Hinsdale engine is connected. This protects against overstating analysis certainty while giving users a transparent view of the planned progression.

| Requested profile | User-facing purpose | Planned technical focus | Current mobile behavior |
|---|---|---|---|
| **Fast** | Quick triage of submitted bytecode | Linear disassembly, selector recovery, basic security patterns, concise JSON-like summary | Executed locally in the mobile companion. |
| **Precise** | Higher-confidence contract reconstruction | Global context-sensitive CFG and jump resolution, private-function recovery, argument/return inference, SSA-like memory model, and structurization | Displays the requested profile and its pending capabilities; it is not executed locally. |
| **Research** | Investigation of hard or adversarial contracts | Path exploration, merged symbolic states, advanced storage/mapping inference, stronger event/error recovery, and experimental analyses | Displays the requested profile and its pending capabilities; it is not executed locally. |

## Roadmap Screen

The Settings screen provides a route to an engine roadmap instead of adding a fourth tab. The roadmap uses four connected chapters that remain readable in portrait orientation. **Control flow and recovery** communicates the mutual refinement of CFG resolution and private-function boundaries. **Symbolic lifting** connects constant folding, type propagation, storage/mapping inference, memory/SSA, and structurization to pseudo-Solidity readability. **Validation** presents a reproducible corpus, metric dashboard, CI, human samples, differential outputs, and fuzzing as a continuous feedback loop. **Distribution** sets stable IR, versioned JSON, quality tiers, documented limits, and reproducible builds as release requirements.

## Confidence Language

Every report identifies the requested profile and gives a plain-language confidence disclosure. The product differentiates **observed bytecode indicators**, **recovered known selectors**, and **future-engine inferences**. It makes no safety guarantee and explains that risk signals require full symbolic review and human verification before users make security decisions.
