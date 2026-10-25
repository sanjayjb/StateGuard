import { TreeNode, Branch, TreeSnapshot, NodeMetadata, NodeRole, RollbackResult } from './types';
import { computeCommitHash } from './crypto';

export type TreeEventListener = (event: string, payload?: any) => void;

export class SessionTree {
  private nodes: Map<string, TreeNode> = new Map();
  private branches: Map<string, Branch> = new Map();
  private activeBranchName: string = 'main';
  private activeNodeId: string | null = null;
  private checkpoints: Set<string> = new Set();
  private listeners: Set<TreeEventListener> = new Set();

  constructor(initialBranch: string = 'main') {
    this.activeBranchName = initialBranch;
  }

  /**
   * Subscribe to tree updates
   */
  public subscribe(listener: TreeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: string, payload?: any): void {
    for (const listener of this.listeners) {
      try {
        listener(event, payload);
      } catch (err) {
        console.error('StateGuard SessionTree listener error:', err);
      }
    }
  }

  /**
   * Creates a root system/prompt node if the tree is empty
   */
  public async initRoot(systemPrompt: string = 'StateGuard Session Initialized'): Promise<TreeNode> {
    if (this.nodes.size > 0) {
      const existing = this.getActiveNode();
      if (existing) return existing;
    }

    const timestamp = Date.now();
    const { shortHash, fullHash } = await computeCommitHash(systemPrompt, null, timestamp, 'system');

    const rootNode: TreeNode = {
      id: shortHash,
      fullHash,
      parentId: null,
      childrenIds: [],
      timestamp,
      role: 'system',
      content: systemPrompt,
      metadata: {
        isCheckpoint: true,
        checkpointName: 'Genesis State',
        validationStatus: 'clean',
        driftScore: 0,
      },
      branchName: this.activeBranchName,
    };

    this.nodes.set(rootNode.id, rootNode);
    this.checkpoints.add(rootNode.id);
    this.activeNodeId = rootNode.id;

    const branch: Branch = {
      name: this.activeBranchName,
      headNodeId: rootNode.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.branches.set(this.activeBranchName, branch);

    this.notify('init', rootNode);
    return rootNode;
  }

  /**
   * Commits a new conversation turn (user prompt or assistant response)
   */
  public async commit(
    content: string,
    role: NodeRole,
    metadata: NodeMetadata = {}
  ): Promise<TreeNode> {
    if (this.nodes.size === 0) {
      await this.initRoot();
    }

    const parentId = this.activeNodeId;
    const timestamp = Date.now();
    const { shortHash, fullHash } = await computeCommitHash(content, parentId, timestamp, role);

    // Resolve any collision defensively
    let resolvedId = shortHash;
    if (this.nodes.has(resolvedId)) {
      resolvedId = `${shortHash}-${Math.random().toString(36).substring(2, 5)}`;
    }

    const newNode: TreeNode = {
      id: resolvedId,
      fullHash,
      parentId,
      childrenIds: [],
      timestamp,
      role,
      content,
      metadata: {
        validationStatus: 'clean',
        driftScore: 0,
        ...metadata,
      },
      branchName: this.activeBranchName,
    };

    // Update parent reference
    if (parentId && this.nodes.has(parentId)) {
      const parent = this.nodes.get(parentId)!;
      if (!parent.childrenIds.includes(newNode.id)) {
        parent.childrenIds.push(newNode.id);
      }
    }

    this.nodes.set(newNode.id, newNode);
    this.activeNodeId = newNode.id;

    // Update or create active branch head
    const existingBranch = this.branches.get(this.activeBranchName);
    if (existingBranch) {
      existingBranch.headNodeId = newNode.id;
      existingBranch.updatedAt = timestamp;
    } else {
      this.branches.set(this.activeBranchName, {
        name: this.activeBranchName,
        headNodeId: newNode.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    if (newNode.metadata.isCheckpoint) {
      this.checkpoints.add(newNode.id);
    }

    this.notify('commit', newNode);
    return newNode;
  }

  /**
   * Tags a specific node as a verified Checkpoint
   */
  public checkpoint(nodeId: string, checkpointName: string): TreeNode {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    node.metadata.isCheckpoint = true;
    node.metadata.checkpointName = checkpointName;
    this.checkpoints.add(node.id);

    this.notify('checkpoint', { nodeId, checkpointName, node });
    return node;
  }

  /**
   * Creates a new branch from a specified node (or current active node)
   */
  public createBranch(branchName: string, fromNodeId?: string): Branch {
    const targetNodeId = fromNodeId || this.activeNodeId;
    if (!targetNodeId || !this.nodes.has(targetNodeId)) {
      throw new Error(`Invalid source node for branch: ${targetNodeId}`);
    }

    const cleanBranchName = branchName.trim().replace(/\s+/g, '-').toLowerCase();
    if (this.branches.has(cleanBranchName)) {
      throw new Error(`Branch already exists: ${cleanBranchName}`);
    }

    const timestamp = Date.now();
    const branch: Branch = {
      name: cleanBranchName,
      headNodeId: targetNodeId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.branches.set(cleanBranchName, branch);
    this.activeBranchName = cleanBranchName;
    this.activeNodeId = targetNodeId;

    this.notify('branch_created', branch);
    return branch;
  }

  /**
   * Switches active pointer to an existing branch
   */
  public checkoutBranch(branchName: string): Branch {
    const branch = this.branches.get(branchName);
    if (!branch) {
      throw new Error(`Branch not found: ${branchName}`);
    }

    this.activeBranchName = branchName;
    this.activeNodeId = branch.headNodeId;

    this.notify('checkout_branch', branch);
    return branch;
  }

  /**
   * Instant One-Click Rollback:
   * Moves active pointer back to target historical node without destroying future nodes.
   */
  public rollback(targetNodeId: string): RollbackResult {
    const targetNode = this.nodes.get(targetNodeId);
    if (!targetNode) {
      throw new Error(`Cannot rollback to non-existent node: ${targetNodeId}`);
    }

    const previousNodeId = this.activeNodeId;
    this.activeNodeId = targetNode.id;

    // Update current branch head to point to this rollback target
    const currentBranch = this.branches.get(this.activeBranchName);
    if (currentBranch) {
      currentBranch.headNodeId = targetNode.id;
      currentBranch.updatedAt = Date.now();
    }

    const result: RollbackResult = {
      previousNodeId,
      targetNodeId: targetNode.id,
      targetBranch: this.activeBranchName,
      node: targetNode,
    };

    this.notify('rollback', result);
    return result;
  }

  /**
   * Updates metadata (validation sweeps, drift scores, hallucination tags) on a node
   */
  public updateNodeMetadata(nodeId: string, updates: Partial<NodeMetadata>): TreeNode {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    node.metadata = {
      ...node.metadata,
      ...updates,
    };

    if (updates.isCheckpoint !== undefined) {
      if (updates.isCheckpoint) {
        this.checkpoints.add(node.id);
      } else {
        this.checkpoints.delete(node.id);
      }
    }

    this.notify('node_updated', node);
    return node;
  }

  /**
   * Returns complete ancestry lineage path from root up to specified node
   */
  public getAncestry(fromNodeId?: string | null): TreeNode[] {
    const targetId = fromNodeId || this.activeNodeId;
    if (!targetId) return [];

    const ancestry: TreeNode[] = [];
    let currentId: string | null = targetId;
    const visited = new Set<string>();

    while (currentId) {
      if (visited.has(currentId)) {
        console.warn('Cycle detected in SessionTree DAG:', currentId);
        break;
      }
      visited.add(currentId);

      const node = this.nodes.get(currentId);
      if (!node) break;

      ancestry.unshift(node); // Prepend to preserve chronological order (root -> head)
      currentId = node.parentId;
    }

    return ancestry;
  }

  /**
   * Returns active node
   */
  public getActiveNode(): TreeNode | null {
    if (!this.activeNodeId) return null;
    return this.nodes.get(this.activeNodeId) || null;
  }

  public getActiveNodeId(): string | null {
    return this.activeNodeId;
  }

  public getActiveBranchName(): string {
    return this.activeBranchName;
  }

  public getNode(nodeId: string): TreeNode | null {
    return this.nodes.get(nodeId) || null;
  }

  public getAllNodes(): TreeNode[] {
    return Array.from(this.nodes.values());
  }

  public getAllBranches(): Branch[] {
    return Array.from(this.branches.values());
  }

  public getCheckpoints(): TreeNode[] {
    const result: TreeNode[] = [];
    for (const id of this.checkpoints) {
      const node = this.nodes.get(id);
      if (node) result.push(node);
    }
    return result;
  }

  /**
   * Exports full tree snapshot for backups, sync, or encrypted storage
   */
  public exportSnapshot(): TreeSnapshot {
    const branchesObj: Record<string, Branch> = {};
    for (const [k, v] of this.branches.entries()) {
      branchesObj[k] = v;
    }

    const nodesObj: Record<string, TreeNode> = {};
    for (const [k, v] of this.nodes.entries()) {
      nodesObj[k] = v;
    }

    return {
      version: '1.0.0',
      activeBranch: this.activeBranchName,
      activeNodeId: this.activeNodeId,
      branches: branchesObj,
      nodes: nodesObj,
      checkpoints: Array.from(this.checkpoints),
    };
  }

  /**
   * Restores tree state from snapshot
   */
  public importSnapshot(snapshot: TreeSnapshot): void {
    this.nodes.clear();
    this.branches.clear();
    this.checkpoints.clear();

    for (const [k, v] of Object.entries(snapshot.nodes)) {
      this.nodes.set(k, v);
    }

    for (const [k, v] of Object.entries(snapshot.branches)) {
      this.branches.set(k, v);
    }

    for (const cp of snapshot.checkpoints) {
      this.checkpoints.add(cp);
    }

    this.activeBranchName = snapshot.activeBranch || 'main';
    this.activeNodeId = snapshot.activeNodeId || null;

    this.notify('imported', snapshot);
  }
}
