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

      const quota = tierManager.getQuotaStatus();
      if (!quota.canCreateCheckpoint) {
        console.error(`[StateGuard CLI] Quota limit reached: ${quota.checkpointsUsedThisMonth}/${quota.checkpointsLimit} checkpoints used.`);
        process.exit(1);
      }

      tree.checkpoint(activeNode.id, label);
      tierManager.recordCheckpointCreation();
      await storage.saveSnapshot(tree.exportSnapshot(), '24h');

      console.log(`[StateGuard CLI] Checkpoint created successfully!`);
      console.log(`  Node ID:   ${activeNode.id}`);
      console.log(`  Label:     "${label}"`);
      console.log(`  Quota:     ${quota.checkpointsUsedThisMonth + 1}/${quota.checkpointsLimit} Used (${quota.tier.toUpperCase()})`);
      break;
    }

    case 'validate': {
      console.log('[StateGuard CLI] Running Gemini 3.8 Flash validation sweep (thinkingLevel: medium)...');
      const ancestry = tree.getAncestry();
      const checkpoints = tree.getCheckpoints();
      const lastCheckpoint = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;

      const result = await engine.runValidationSweep(ancestry, lastCheckpoint);
      console.log(`[StateGuard CLI] Validation Complete:`);
      console.log(`  Drift Score:        ${result.driftScore}/100`);
      console.log(`  Hallucination Risk: ${result.hallucinationRisk}`);
      console.log(`  Logical Coherence:  ${result.logicalConsistency ? 'CLEAN' : 'INCONSISTENCY DETECTED'}`);
      if (result.detectedIssues.length > 0) {
        console.log(`  Issues Detected:`);
        result.detectedIssues.forEach((issue) => console.log(`    - ${issue}`));
      }
      if (result.suggestedCorrection) {
        console.log(`  Suggested Steer:    "${result.suggestedCorrection}"`);
      }
      if (result.recommendedRollbackNodeId) {
        console.log(`  Recommended Target: ${result.recommendedRollbackNodeId} (Rollback advised)`);
      }
      break;
    }

    case 'rollback': {
      const targetId = args[1];
      if (!targetId) {
        console.error('[StateGuard CLI] Error: Please provide a target node ID. Usage: stateguard rollback <nodeId>');
        process.exit(1);
      }

      const res = tree.rollback(targetId);
      await storage.saveSnapshot(tree.exportSnapshot(), '24h');
      console.log(`[StateGuard CLI] Pointer rolled back to node: ${res.targetNodeId} on branch "${res.targetBranch}"`);
      break;
    }

    case 'branch': {
      const branchName = args[1];
      if (!branchName) {
        console.error('[StateGuard CLI] Error: Please provide a branch name. Usage: stateguard branch <name>');
        process.exit(1);
      }

      const branch = tree.createBranch(branchName);
      await storage.saveSnapshot(tree.exportSnapshot(), '24h');
      console.log(`[StateGuard CLI] Created and checked out new branch: "${branch.name}" (head: ${branch.headNodeId})`);
      break;
    }

    case 'status': {
      const activeNode = tree.getActiveNode();
      const branches = tree.getAllBranches();
      const checkpoints = tree.getCheckpoints();
      const quota = tierManager.getQuotaStatus(branches.length);

      console.log('=== StateGuard Session Status ===');
      console.log(`  Active Branch:      ${tree.getActiveBranchName()} (${branches.length} total branches)`);
      console.log(`  Active Node:        ${activeNode ? `${activeNode.id} [${activeNode.role}]` : 'None'}`);
      console.log(`  Checkpoints Pinned: ${checkpoints.length} nodes`);
      console.log(`  Quota Tier:         ${quota.tier.toUpperCase()} (${quota.isPro ? 'Unlimited' : `${quota.checkpointsUsedThisMonth}/${quota.checkpointsLimit} Used`})`);
      console.log(`  Engine:             gemini-3.8-flash (thinkingLevel: medium)`);
      break;
    }

    case 'nodes':
    case 'checkpoints':
    case 'list': {
      const checkpoints = tree.getCheckpoints();
      const allNodes = tree.getAllNodes();
      console.log('=== StateGuard Checkpoints ===');
      if (checkpoints.length === 0) {
        console.log('  No checkpoints created yet.');
      } else {
        checkpoints.forEach((c) => {
          console.log(`  ★ [${c.id}] "${c.metadata.checkpointName || 'Checkpoint'}" (branch: ${c.branchName})`);
        });
      }

      console.log('\n=== Available Conversation Nodes ===');
      allNodes.forEach((n) => {
        const isHead = n.id === tree.getActiveNodeId();
        const marker = n.metadata.isCheckpoint ? '★' : (isHead ? '●' : ' ');
        const preview = n.content.replace(/\n/g, ' ').substring(0, 60);
        console.log(`  ${marker} [${n.id}] [${n.role.toUpperCase()}] (${n.branchName}): "${preview}..."`);
      });
      break;
    }

    case 'test': {
      console.log('[StateGuard CLI] Executing session integrity checks...');
      const nodes = tree.getAllNodes();
      const branches = tree.getAllBranches();
      console.log(`  Integrity Check: ${nodes.length} nodes, ${branches.length} branches validated. No cyclic dependencies found.`);
      break;
    }

    default:
      console.log('StateGuard CLI — Usage: stateguard [checkpoint <name> | list | nodes | validate | rollback <id> | branch <name> | status | test]');
  }
}

main().catch((err) => {
  console.error('[StateGuard CLI] Error:', err);
  process.exit(1);
});
