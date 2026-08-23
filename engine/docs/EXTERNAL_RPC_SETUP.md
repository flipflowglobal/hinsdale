# External RPC Setup

The verified-corpus ingestion tool is a developer-operated command. It requires a temporary `HINSDALE_CORPUS_RPC_URL` environment variable that points to an HTTPS JSON-RPC endpoint with `eth_getCode` access. This URL is not a Hinsdale product setting, is not included in the mobile application, and must not be committed to source control.

If an Alchemy account is used to obtain the endpoint, use the Alchemy CLI outside this repository to retrieve the existing RPC URL after authenticating. Copy the URL only into the current shell or the project’s secure environment configuration, run the ingestion command, and rotate the endpoint if organizational policy requires it.
