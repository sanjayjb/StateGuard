import { describe, it, expect } from 'vitest';
import { GeminiEngine } from '../src/core/engine/GeminiEngine';
import { TreeNode } from '../src/core/dag/types';

describe('GeminiEngine Wrapper & Validation Sweeps', () => {
  it('initializes with gemini-3.8-flash and thinkingEffort medium', () => {
    const engine = new GeminiEngine({
      model: 'gemini-3.8-flash',
      thinkingEffort: 'medium',
    });

    expect(engine.getModel()).toBe('gemini-3.8-flash');
  });

  it('runs validation sweep and returns structured drift metrics', async () => {
    const engine = new GeminiEngine({ model: 'gemini-3.8-flash' });

    const mockNodes: TreeNode[] = [
      {
        id: 'a1b2c3d',
        fullHash: 'a1b2c3d...',
        parentId: null,
        childrenIds: ['e4f5a6b'],
        timestamp: 1000,
        role: 'system',
        content: 'System: You are an autonomous coding assistant for Rust.',
        metadata: { isCheckpoint: true },
        branchName: 'main',
      },
      {
        id: 'e4f5a6b',
        fullHash: 'e4f5a6b...',
        parentId: 'a1b2c3d',
        childrenIds: ['c7d8e9f'],
        timestamp: 2000,
        role: 'user',
        content: 'Build a memory pool allocator.',
        metadata: {},
        branchName: 'main',
      },
      {
        id: 'c7d8e9f',
        fullHash: 'c7d8e9f...',
        parentId: 'e4f5a6b',
        childrenIds: [],
        timestamp: 3000,
        role: 'assistant',
        content: 'Here is how to bake chocolate chip cookies with 2 cups of sugar.',
        metadata: {},
        branchName: 'main',
      },
    ];

    const sweepResult = engine.runHeuristicSweep(mockNodes, mockNodes[0]);

    expect(sweepResult).toBeDefined();
    expect(typeof sweepResult.driftScore).toBe('number');
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(sweepResult.hallucinationRisk);
    expect(typeof sweepResult.logicalConsistency).toBe('boolean');
    expect(sweepResult.reasoningSummary).toBeDefined();
  });

  it('handles empty ancestry safely without crashing', async () => {
    const engine = new GeminiEngine();
    const result = await engine.runValidationSweep([], null);
    expect(result.driftScore).toBe(0);
    expect(result.hallucinationRisk).toBe('LOW');
  });
});
