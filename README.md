# Phone Notifications on Smart Glasses

Show the notifications you receive on your phone through your smart glasses. Runs on [AugmentOS](https://augmentos.org).

## Running locally with LM Studio on EVEN G1

This app can operate entirely on-device and forward audio transcripts to a local LM Studio (or any OpenAI-compatible) instance running the `qwen/qwen3-4b-2507` model so the response is rendered on the EVEN G1 display.

1. **Start LM Studio locally** and expose the OpenAI-compatible HTTP server (default `http://localhost:1234/v1`).
2. **Configure the server environment** before launching the Mentra app:

   ```bash
   export AUGMENTOS_API_KEY=<augmentos-api-key>
   export PACKAGE_NAME=<your.package.name>
   export LLM_MODEL=qwen/qwen3-4b-2507                  # default, override if you host a variant
   export QWEN_API_BASE_URL=http://127.0.0.1:1234/v1    # adjust if LM Studio runs elsewhere
   export QWEN_API_KEY=qwen                             # optional, only if your server enforces a key
   export ALWAYS_LISTENING=true                         # enables proactive/reactive listening (default)
   ```

   You can also toggle always-on listening per headset from the AugmentOS settings panel using the `always_listening` flag.

3. **Run the service**:

   ```bash
   bun install
   bun run dev
   ```

The server now streams voice activity to LM Studio, receives the completion, and mirrors the answer on the EVEN G1 glasses display while optionally speaking the response aloud.
