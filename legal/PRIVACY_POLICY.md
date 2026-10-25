# StateGuard Privacy Policy

**Effective Date:** October 2026

StateGuard is engineered under a strict **Zero-Data Retention & Local-First Security** doctrine. This Privacy Policy outlines how prompts, session trees, and credentials are handled.

---

## 1. Zero Remote Storage
1. **Local-First Architecture:** Your conversation state trees, node messages, branch pointers, and commit hashes reside exclusively within your local browser or workspace environment (e.g., `chrome.storage.local` or client-side encrypted storage).
2. **Zero Central Telemetry of Prompts:** StateGuard does not collect, record, or transmit user prompts or model responses to any StateGuard-owned servers.

## 2. Client-Side Cryptographic Protection
- All locally cached session trees are encrypted using the Web Crypto API utilizing **AES-GCM 256-bit** encryption with a salt derived from PBKDF2 (100,000 iterations).
- **Auto-Purge TTL:** Configurable Time-To-Live auto-purge policies allow users to automatically destroy cached sessions after 1 hour, 24 hours, 7 days, or immediately at the end of the session.

## 3. Foundation Model Interactions (Google Gemini API)
- When you execute an automated validation sweep, your conversation ancestry is transmitted directly from your client machine to Google's Gen AI endpoints (`gemini-3.8-flash`) via the official `@google/genai` SDK over TLS encryption.
- No intermediary proxy server intercepts or stores your payload.
- Your requests to Google are governed by Google's Cloud / Gemini API Terms of Service and Data Governance policies.

## 4. Quota and License Data
- License verification keys and monthly checkpoint counters are checked locally on the client or against an authenticated verification endpoint solely for quota gating. No session text is attached to quota checks.

## 5. Contact
For privacy inquiries or technical questions regarding StateGuard encryption standards, please contact the maintainers at security@stateguard.ai.
