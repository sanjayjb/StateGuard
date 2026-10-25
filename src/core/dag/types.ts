export type NodeRole = 'user' | 'assistant' | 'system';

export type ValidationStatus = 'clean' | 'warning' | 'drift_detected' | 'hallucination_risk';

export interface NodeMetadata {
  checkpointName?: string;
  isCheckpoint?: boolean;
  driftScore?: number; // 0 - 100
  hallucinationRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
  validationStatus?: ValidationStatus;
  detectedIssues?: string[];
  suggestedCorrection?: string;
  recommendedRollbackNodeId?: string | null;
  thoughtSummary?: string;
  tokensEstimate?: number;
  tags?: string[];
}

export interface TreeNode {
  id: string; // 7-character Git-style SHA-256 hash
  fullHash: string; // Full SHA-256 hash
  parentId: string | null;
  childrenIds: string[];
  timestamp: number;
  role: NodeRole;
  content: string;
  metadata: NodeMetadata;
  branchName: string;
}

export interface Branch {
  name: string;
  headNodeId: string;
  createdAt: number;
  updatedAt: number;
}

export interface TreeSnapshot {
  version: string;
  activeBranch: string;
  activeNodeId: string | null;
  branches: Record<string, Branch>;
  nodes: Record<string, TreeNode>;
  checkpoints: string[]; // List of checkpoint node IDs
}

export interface RollbackResult {
  previousNodeId: string | null;
  targetNodeId: string;
  targetBranch: string;
  node: TreeNode;
}
