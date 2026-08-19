"""Compare saved Hinsdale JSON with already-produced peer-tool JSON.

This adapter deliberately does not download, install, or execute external decompilers.
It normalizes supplied artifacts so a CI job can retain provenance for Heimdall-rs,
Gigahorse, or other tools in a separately managed environment.
"""

import argparse
import json
from pathlib import Path


def load(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def count(value: dict, *path: str) -> int:
    current = value
    for key in path:
        if not isinstance(current, dict):
            return 0
        current = current.get(key, [])
    return len(current) if isinstance(current, list) else 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize saved decompiler output comparisons")
    parser.add_argument("--hinsdale", required=True, type=Path)
    parser.add_argument("--peer", required=True, type=Path)
    parser.add_argument("--peer-name", required=True)
    args = parser.parse_args()
    hinsdale, peer = load(args.hinsdale), load(args.peer)
    print(json.dumps({
        "hinsdale_schema": hinsdale.get("schema_version"),
        "peer_name": args.peer_name,
        "hinsdale_functions": count(hinsdale, "signatures", "functions"),
        "peer_functions": count(peer, "functions"),
        "hinsdale_events": count(hinsdale, "signatures", "events"),
        "peer_events": count(peer, "events"),
        "hinsdale_unresolved_jumps": hinsdale.get("cfg_summary", {}).get("unresolved_jump_count", 0),
        "provenance": "Inputs are supplied artifacts; this adapter does not execute peer tools."
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
