# StateGuard Terms of Service

**Last Updated:** October 2026

PLEASE READ THESE TERMS OF SERVICE CAREFULLY. BY INSTALLING, ACCESSING, OR USING THE STATEGUARD EXTENSION, WORKSPACE PLUGIN, OR ASSOCIATED SERVICES (COLLECTIVELY, "STATEGUARD" OR THE "SERVICE"), YOU AGREE TO BE BOUND BY THESE TERMS.

---

## 1. Description of Service
StateGuard provides an interactive conversational tree management interface (Directed Acyclic Graph) offering visual Git-style branching, checkpoint snapshots, rollbacks, and automated validation sweeps powered by machine learning models including Google Gemini (`gemini-3.8-flash`).

## 2. Disclaimer of Artificial Intelligence Non-Determinism
StateGuard utilizes large language models (LLMs) and heuristic algorithms to perform validation sweeps, drift measurement, and self-correction recommendations. You explicitly acknowledge and agree that:
1. **Non-Deterministic Outputs:** Artificial intelligence systems produce probabilistic, non-deterministic responses. Recommendations, drift scores, and automated sweeps are advisory metrics provided solely for informational and organizational convenience.
2. **Absence of Professional Warranty:** StateGuard does not warrant that AI validation sweeps will detect all hallucinations, syntax errors, factual inaccuracies, or logical fallacies. You remain solely responsible for reviewing and verifying all generated code, text, and prompts.

## 3. Ephemeral Architecture & Privacy
1. **Local-First Processing:** StateGuard operates primarily client-side. Conversation state trees are encrypted using client-side Web Crypto AES-GCM 256-bit standards.
2. **Auto-Purge TTL:** StateGuard implements user-configurable Time-To-Live (TTL) auto-purge mechanisms. You are responsible for exporting or archiving any session snapshots you wish to retain permanently.
3. **Inherited Credentials:** StateGuard operates using ambient environment authorization or user-supplied credentials. We never store, transmit, or resell your credentials to third-party databases.

## 4. Subscription Tiers & Usage Limits
1. **Free Tier:** Users on the Free Tier are granted access to a limited quota of state checkpoints (fifty [50] checkpoints per rolling monthly billing cycle) and up to three (3) concurrent active branch lanes.
2. **Pro Tier:** Users holding a verified Pro license enjoy unlimited checkpoints, extended background reasoning sweeps, and unlimited branching. License keys are non-transferable and subject to revocation in cases of abuse or fraudulent sharing.

## 5. Limitation of Liability & Maximum Cap
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
1. IN NO EVENT SHALL THE OPERATORS, CREATORS, OR CONTRIBUTORS OF STATEGUARD BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, CORRUPTION OF CODE, PRODUCTION DOWNTIME, OR COMMERCIAL LOSS RESULTING FROM MODEL HALLUCINATIONS OR ROLLBACK OPERATIONS.
2. THE MAXIMUM AGGREGATE LIABILITY OF STATEGUARD ARISING OUT OF OR IN CONNECTION WITH THE SERVICE SHALL BE STRICTLY CAPPED AT THE GREATER OF: (A) THE TOTAL AMOUNT ACTUALLY PAID BY YOU FOR STATEGUARD LICENSING IN THE THREE (3) MONTHS PRECEDING THE CLAIM, OR (B) FIFTY UNITED STATES DOLLARS ($50.00 USD).

## 6. Governing Law & Dispute Resolution
These Terms shall be governed by and construed in accordance with the laws of the jurisdiction of the developer, without regard to conflicts of law provisions. Any disputes arising hereunder shall be resolved through binding confidential individual arbitration.
