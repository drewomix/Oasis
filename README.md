# Phone Notifications on Smart Glasses

Show the notifications you receive on your phone through your smart glasses. Runs on [AugmentOS](https://augmentos.org).

## Running locally with LM Studio on EVEN G1

This app can operate entirely on-device and forward audio transcripts to a local LM Studio instance so the response is rendered on the EVEN G1 display.

1. **Start LM Studio locally** and expose the OpenAI-compatible HTTP server (default `http://localhost:1234/v1`).
2. **Configure the server environment** before launching the Mentra app:

   ```bash
   export AUGMENTOS_API_KEY=<augmentos-api-key>
   export PACKAGE_NAME=<your.package.name>
   export LLM_PROVIDER=lmstudio
   export LLM_MODEL=<lm-studio-model-name>
   export LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1   # adjust if LM Studio runs elsewhere
   export LM_STUDIO_API_KEY=lm-studio                    # optional, use if LM Studio enforces a key
   export ALWAYS_LISTENING=true                         # enables proactive/reactive listening
   ```

   You can also toggle always-on listening per headset from the AugmentOS settings panel using the `always_listening` flag.

3. **Run the service**:

   ```bash
   bun install
   bun run dev
   ```

The server now streams voice activity to LM Studio, receives the completion, and mirrors the answer on the EVEN G1 glasses display while optionally speaking the response aloud.
