FROM rust:1.97-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --bin hinsdale-cli --bin hinsdale-bench

FROM debian:bookworm-slim
RUN useradd --create-home --uid 10001 hinsdale
COPY --from=build /src/target/release/hinsdale-cli /usr/local/bin/hinsdale-cli
COPY --from=build /src/target/release/hinsdale-bench /usr/local/bin/hinsdale-bench
USER hinsdale
ENTRYPOINT ["hinsdale-cli"]
