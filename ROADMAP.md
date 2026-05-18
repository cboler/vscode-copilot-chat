# ROADMAP: Custom Enterprise Provider Integration

## Phase 3: Enterprise mTLS Authentication Support
* **Objective:** Extend the extension's networking capabilities to support Mutual TLS (mTLS) for enterprise/DoD API gateways, operating alongside existing extension states.
* **Agent Tasks:**
    1. Implement a custom Node.js `https.Agent` module designed for enterprise environments.
    2. Add configuration logic to read local `.der.p7b` or `.pem` certificate bundles (path defined in user settings, e.g., `army.copilot.certPath`).
    3. Create an injection mechanism so this custom `https.Agent` can be selectively applied to specific outbound HTTP requests without disrupting standard extension lifecycle networking.
* **Acceptance Criteria:** A standalone network utility function successfully performs an mTLS handshake with a test server using a local certificate.

## Phase 4: Custom Inference Provider Routing
* **Objective:** Abstract the model inference client to allow routing to custom, OpenAI-compatible enterprise endpoints (like AskSage or `genai.army.mil`).
* **Agent Tasks:**
    1. Create configuration settings for `army.copilot.endpointUrl` (default: `https://api.genai.army.mil/server/openai/v1/chat/completions`) and `army.copilot.apiKey`.
    2. Implement an adapter pattern for the inference client. If the custom endpoint is defined, route the chat request payload to this URL instead of the default API.
    3. Ensure the request payload is formatted to standard OpenAI Chat Completions JSON schema.
    4. Ensure the response parsing logic seamlessly maps the standard OpenAI `choices[0].message.content` back into the format the VS Code chat UI expects.
* **Acceptance Criteria:** A successful test prompt from the VS Code Chat UI routes to the custom endpoint, utilizes the custom `https.Agent` from Phase 3, and returns a generated response to the UI.
