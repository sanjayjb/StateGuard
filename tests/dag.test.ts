import { describe, it, expect, beforeEach } from 'vitest';
import { SessionTree } from '../src/core/dag/SessionTree';

describe('SessionTree DAG Engine', () => {
  let tree: SessionTree;

  beforeEach(() => {
    tree = new SessionTree('main');
  });

  it('initializes root node with deterministic 7-char hash', async () => {
    const root = await tree.initRoot('Initial system prompt');
    expect(root).toBeDefined();
    expect(root.id.length).toBe(7);
    expect(root.role).toBe('system');
    expect(root.metadata.isCheckpoint).toBe(true);
    expect(tree.getActiveNodeId()).toBe(root.id);
  });

  it('commits sequential conversation turns and updates parent-child links', async () => {
    const root = await tree.initRoot('Root');
    const userTurn = await tree.commit('How do I build a compiler?', 'user');
    const aiTurn = await tree.commit('A compiler consists of lexing, parsing, and codegen.', 'assistant');

    expect(userTurn.parentId).toBe(root.id);
    expect(aiTurn.parentId).toBe(userTurn.id);

    const updatedRoot = tree.getNode(root.id);
    expect(updatedRoot?.childrenIds).toContain(userTurn.id);

    const updatedUser = tree.getNode(userTurn.id);
    expect(updatedUser?.childrenIds).toContain(aiTurn.id);

    expect(tree.getActiveNodeId()).toBe(aiTurn.id);
  });

  it('tags and retrieves checkpoints correctly', async () => {
    await tree.initRoot('Root');
    const turn1 = await tree.commit('Checkpoint Turn', 'user');

    tree.checkpoint(turn1.id, 'Clean Architecture Baseline');
    const updated = tree.getNode(turn1.id);
    expect(updated?.metadata.isCheckpoint).toBe(true);
    expect(updated?.metadata.checkpointName).toBe('Clean Architecture Baseline');

    const checkpoints = tree.getCheckpoints();
    expect(checkpoints.some((c) => c.id === turn1.id)).toBe(true);
  });

  it('creates branches and tracks branch pointers independently', async () => {
    await tree.initRoot('Root');
    const mainTurn1 = await tree.commit('Main turn 1', 'user');

    // Create branch from mainTurn1
    const featBranch = tree.createBranch('experimental-refactor', mainTurn1.id);
    expect(featBranch.name).toBe('experimental-refactor');
    expect(tree.getActiveBranchName()).toBe('experimental-refactor');
    expect(tree.getActiveNodeId()).toBe(mainTurn1.id);

    // Commit turn on experimental-refactor
    const featTurn = await tree.commit('Testing alternative AST parser', 'user');
    expect(featTurn.branchName).toBe('experimental-refactor');
    expect(featTurn.parentId).toBe(mainTurn1.id);

    // Switch back to main
    tree.checkoutBranch('main');
    expect(tree.getActiveBranchName()).toBe('main');
    expect(tree.getActiveNodeId()).toBe(mainTurn1.id);
  });

  it('performs one-click rollback to historical node without destroying forward turns', async () => {
    await tree.initRoot('Root');
    await tree.commit('Turn 1 (Stable)', 'user');
    const turn2 = await tree.commit('Turn 2 (Good)', 'assistant');
    const turn3 = await tree.commit('Turn 3 (Drifted Tangent)', 'assistant');

    expect(tree.getActiveNodeId()).toBe(turn3.id);

    // Rollback to turn 2
    const rollbackRes = tree.rollback(turn2.id);
    expect(rollbackRes.targetNodeId).toBe(turn2.id);
    expect(tree.getActiveNodeId()).toBe(turn2.id);

    // Verify turn 3 still exists in DAG nodes
    expect(tree.getNode(turn3.id)).toBeDefined();

    // From turn 2, commit a new clean turn
    const cleanTurn = await tree.commit('Turn 4 (Corrected Path)', 'user');
    expect(cleanTurn.parentId).toBe(turn2.id);
    expect(cleanTurn.id).not.toBe(turn3.id);
  });

  it('retrieves ancestry lineage in proper chronological order', async () => {
    const root = await tree.initRoot('Genesis');
    const t1 = await tree.commit('Step 1', 'user');
    const t2 = await tree.commit('Step 2', 'assistant');
    const t3 = await tree.commit('Step 3', 'user');

    const ancestry = tree.getAncestry(t3.id);
    expect(ancestry.length).toBe(4);
    expect(ancestry[0].id).toBe(root.id);
    expect(ancestry[1].id).toBe(t1.id);
    expect(ancestry[2].id).toBe(t2.id);
    expect(ancestry[3].id).toBe(t3.id);
  });

  it('exports and re-imports serialized tree snapshot faithfully', async () => {
    await tree.initRoot('Root Snapshot Test');
    await tree.commit('Turn A', 'user');
    await tree.commit('Turn B', 'assistant');

    const snapshot = tree.exportSnapshot();
    expect(snapshot.version).toBe('1.0.0');
    expect(Object.keys(snapshot.nodes).length).toBe(3);

    const freshTree = new SessionTree();
    freshTree.importSnapshot(snapshot);

    expect(freshTree.getAllNodes().length).toBe(3);
    expect(freshTree.getActiveNodeId()).toBe(tree.getActiveNodeId());
  });
});
