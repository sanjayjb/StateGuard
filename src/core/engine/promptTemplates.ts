import { TreeNode } from '../dag/types';

export interface ValidationSweepResult {
  driftScore: number; // 0 (perfect alignment) to 100 (extreme drift)
  hallucinationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  logicalConsistency: boolean;
  detectedIssues: string[];
  suggestedCorrection: string | null;
  recommendedRollbackNodeId: string | null;
  reasoningSummary: string;
}

export function buildValidationSweepPrompt(
  ancestry: TreeNode[],
  lastCheckpoint: TreeNode | null
): string {
  const formattedTurns = ancestry.map((node, index) => {
    const isCp = node.metadata.isCheckpoint ? ' [CHECKPOINT PINNED]' : '';
    return `Turn #${index + 1} [ID: ${node.id}] (${node.role.toUpperCase()})${isCp}:\n${node.content}\n`;
  }).join('\n---\n');

  const checkpointAnchor = lastCheckpoint
    ? `Anchor Point (Verified Baseline): Turn [ID: ${lastCheckpoint.id}] - "${lastCheckpoint.content.substring(0, 180)}..."`
    : `Anchor Point: Genesis Prompt (Turn #1)`;

  return `You are StateGuard's Automated Session Coherence & Anti-Drift Engine.
Your task is to perform an exhaustive validation sweep on the conversation history provided below, measuring semantic drift, hallucination loops, and logical decay relative to the user's initial objective and baseline checkpoint.

${checkpointAnchor}

=== FULL CONVERSATION ANCESTRY ===
${formattedTurns}
==================================

Analyze the trajectory with rigorous precision:
1. Chat Drift: Has the AI or user veered off into unproductive tangents, lost track of initial constraints, or dropped critical requirements? (Score 0-100 where 0 is pristine focus, 100 is complete topic collapse).
2. Hallucination Risk: Are there ungrounded assertions, fictitious library APIs, fabricated facts, or circular loops where false assumptions are reiterated?
3. Logical Consistency: Do any statements directly contradict earlier established facts in this session?
4. Corrective Action: If drift or hallucination is observed, provide a concise prompt injection that steers the dialogue back to the objective.
5. Rollback Recommendation: If the conversation has suffered irreversible drift or catastrophic hallucinations, identify the exact Node ID (from the Turn IDs listed above) that represents the last pristine, clean state where the user should roll back. If the state is recoverable, set this to null.

You MUST respond strictly with a valid JSON object matching this schema:
{
  "driftScore": number,
  "hallucinationRisk": "LOW" | "MEDIUM" | "HIGH",
  "logicalConsistency": boolean,
  "detectedIssues": string[],
  "suggestedCorrection": string | null,
  "recommendedRollbackNodeId": string | null,
  "reasoningSummary": string
}`;
}
