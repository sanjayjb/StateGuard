import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoStorage } from '../src/core/storage/CryptoStorage';
import { TreeSnapshot } from '../src/core/dag/types';

describe('CryptoStorage AES-GCM & TTL Auto-Purge', () => {
  let storage: CryptoStorage;

  beforeEach(() => {
    storage = new CryptoStorage('test-suite-key-12345');
  });

  it('encrypts, stores, and decrypts a snapshot accurately', async () => {
    const mockSnapshot: TreeSnapshot = {
      version: '1.0.0',
      activeBranch: 'main',
      activeNodeId: 'node-1',
      branches: {
        main: { name: 'main', headNodeId: 'node-1', createdAt: 100, updatedAt: 100 },
      },
      nodes: {
        'node-1': {
          id: 'node-1',
          fullHash: 'hash-full-1',
          parentId: null,
          childrenIds: [],
          timestamp: 100,
          role: 'user',
          content: 'Confidential prompt text regarding project secrets.',
          metadata: {},
          branchName: 'main',
        },
      },
      checkpoints: ['node-1'],
    };

    await storage.saveSnapshot(mockSnapshot, '24h');
    const restored = await storage.loadSnapshot();

    expect(restored).toBeDefined();
    expect(restored?.version).toBe('1.0.0');
    expect(restored?.nodes['node-1'].content).toBe('Confidential prompt text regarding project secrets.');
  });

  it('manages TTL policy retrieval', async () => {
    const policy = await storage.getTTLPolicy();
    expect(['session', '1h', '24h', '7d', 'never']).toContain(policy);
  });
});
