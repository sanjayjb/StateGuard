---
name: stateguard
description: Use when managing long chat sessions, preventing context drift, creating checkpoints, rolling back mistakes, or running validation sweeps using the local StateGuard engine.
allowed-tools: Bash, Read, Write
---

# StateGuard: AI State Management & Validation Skill

Manage conversation history with visual Git-style Directed Acyclic Graph (DAG) branching, snapshot clean state checkpoints, rollback dialogue pointers, and execute automated reasoning validation sweeps with `gemini-3.8-flash` (thinkingLevel: medium).

## CLI Execution Commands
All commands run directly against the local StateGuard engine:

### 1. Create Session Checkpoint
Snapshots the current active dialogue node as a verified clean baseline anchor:
```bash
npx stateguard checkpoint "Checkpoint Name"
```

### 2. Run Gemini 3.8 Flash Validation Sweep
Executes a high-precision anti-drift reasoning sweep on conversation ancestry:
```bash
npx stateguard validate
```
Evaluates:
- Semantic Drift Score (0–100)
- Hallucination Risk (`LOW` | `MEDIUM` | `HIGH`)
- Logical Consistency Checks
- Corrective Steering Injection
- Recommended Rollback Target Node ID

### 3. Check StateGuard Session Status
Inspect active branch, active node ID, checkpoint count, and quota status:
```bash
npx stateguard status
```

### 4. Rollback Pointer to Historical Clean State
Rolls active head back to a target node without destroying subsequent forward branches:
```bash
npx stateguard rollback <nodeId>
```

### 5. Create and Checkout New Branch
Branches off conversation trajectory to explore alternative solutions:
```bash
npx stateguard branch <branchName>
```

### 6. View Available Nodes & Checkpoints
Inspect all available conversation nodes and pinned checkpoints across branches:
```bash
npx stateguard list
```

### 7. Verify Integrity & Unit Test Suite
```bash
npm test
```

## Tier Models & Capabilities
- **Free Users**:
  - Manually inspect nodes & conversation lineage in graph and explorer view
  - Create up to 15–20 snapshot checkpoints
  - Manually roll back when spotting mistakes
  - Validation sweep gating: clicking "Run Validation Sweep" opens a friendly upgrade modal:
    *"Unlock automated Gemini 3.8 Flash drift analysis and continuous validation with StateGuard Pro."*
- **Pro Users**:
  - Unlimited manual control (unlimited checkpoints and branches)
  - Automated Gemini 3.8 Flash drift analysis
  - Continuous AI background validation & reasoning on each turn
  - Instant one-click rollback recommendations
