.PHONY: check test benchmark fmt

check:
	cargo check --all-targets

test:
	cargo test

benchmark:
	cargo run --bin hinsdale-bench -- --tier precise

fmt:
	cargo fmt --check
