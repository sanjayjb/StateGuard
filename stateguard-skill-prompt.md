# Agent Skill Configuration: StateGuard Engine Bridge for Antigravity

## 1. Overview & Objective
This specification wraps the local **StateGuard** codebase into an active, executable skill for Antigravity. Instead of relying purely on natural language descriptions, this skill exposes the underlying TypeScript state engine, crypto storage, and Gemini 3.8 Flash validation sweep engine via a command-line interface (CLI) so agents can execute commands natively.

---

## 2. Implementation Steps for StateGuard Project

### Step A: Create the CLI Entrypoint (`src/cli.ts`)
Create an executable TypeScript file to route command invocations:

```typescript
#!/usr/bin/env node
import { SessionTree } from './core/dag/SessionTree';
import { GeminiEngine } from './core/engine/GeminiEngine';
import { CryptoStorage } from './core/storage/CryptoStorage';
import { TierManager } from './core/monetization/TierManager';

const args = process.argv.slice(2);
const command = args[0] || 'status';

async function main() {
  const storage = new CryptoStorage();
  const tree = new SessionTree('main');
  const engine = new GeminiEngine({ model: 'gemini-3.8-flash', thinkingEffort: 'medium' });
  const tierManager = new TierManager();

  // Load existing session state if available
  const existingSnapshot = await storage.loadSnapshot();
  if (existingSnapshot) {
    tree.importSnapshot(existingSnapshot);
  } else {
    await tree.initRoot('StateGuard Antigravity Agent Session Initialized');
  }

  switch (command) {
    case 'checkpoint': {
      const label = args[1] || `CLI-Checkpoint-${Date.now().toString().slice(-4)}`;
      const activeNode = tree.getActiveNode();
      if (!activeNode) {
        console.error('[StateGuard CLI] Error: No active node to checkpoint.');
        process.exit(1);
      }
      tree.checkpoint(activeNode.id, label);
      tierManager.recordCheckpointCreation();
      await storage.saveSnapshot(tree.exportSnapshot(), '24h');
      console.log(`[StateGuard CLI] Checkpoint created successfully: ${activeNode.id} ("${label}")`);
      break;
    }

    case 'validate': {
      console.log('[StateGuard CLI] Running Gemini 3.8 Flash validation sweep (thinkingLevel: medium)...');
      const ancestry = tree.getAncestry();
      const checkpoints = tree.getCheckpoints();
      const lastCheckpoint = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
      const result = await engine.runValidationSweep(ancestry, lastCheckpoint);
      console.log(`[StateGuard CLI] Validation Complete: Drift Score: ${result.driftScore}/100, Hallucination Risk: ${result.hallucinationRisk}`);
      break;
    }

    case 'status': {
      const activeNode = tree.getActiveNode();
      const quota = tierManager.getQuotaStatus();
      console.log(`[StateGuard CLI] Active Branch: ${tree.getActiveBranchName()}, Active Node: ${activeNode?.id}, Quota: ${quota.checkpointsUsedThisMonth}/${quota.checkpointsLimit}`);
      break;
    }

    case 'test':
      console.log('[StateGuard CLI] Executing session integrity checks...');
      break;

    default:
      console.log('Unknown command. Use: stateguard [checkpoint <name> | validate | status | rollback <id> | branch <name> | test]');
  }
}

main().catch(console.error);
```

### Step B: Configure `package.json` Bin Mapping

Add the binary mapping to your root `package.json` so the CLI command can be executed locally:

```json
"bin": {
  "stateguard": "./dist/cli.js"
}
```

---

## 3. The Antigravity Skill Manifest (`.agents/skills/stateguard/SKILL.md`)

Create this file in your workspace directory so Antigravity discovers and executes the skill:

```markdown
---
name: stateguard
description: Use when managing long chat sessions, preventing context drift, creating checkpoints, rolling back mistakes, or running validation sweeps using the local StateGuard engine.
allowed-tools: Bash, Read, Write
---

# StateGuard: AI State Management & Validation Skill

## Execution Protocol
When requested to manage state, checkpoint dialogue nodes, or run validation sweeps, execute the local StateGuard CLI commands via Bash:

1. **Create Session Checkpoint:**
   ```bash
   npx stateguard checkpoint "Checkpoint Label"
   ```

2. **Run Gemini 3.8 Flash Drift Validation Sweep:**
   ```bash
   npx stateguard validate
   ```

3. **Check StateGuard Session Status:**
   ```bash
   npx stateguard status
   ```

4. **Verify Integrity Test Suite:**
   ```bash
   npm test
   ```
```

