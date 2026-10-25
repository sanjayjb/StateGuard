import { describe, it, expect, beforeEach } from 'vitest';
import { TierManager } from '../src/core/monetization/TierManager';

describe('TierManager Freemium Quota & Gating', () => {
  let tierManager: TierManager;

  beforeEach(() => {
    tierManager = new TierManager();
    tierManager.downgradeToFree();
  });

  it('starts on free tier with 20-checkpoint limit and manual control', () => {
    const status = tierManager.getQuotaStatus();
    expect(status.tier).toBe('free');
    expect(status.checkpointsLimit).toBe(20);
    expect(status.canCreateCheckpoint).toBe(true);
    expect(status.maxBranches).toBe(3);
    expect(status.canRunValidationSweep).toBe(false);
    expect(status.isPro).toBe(false);
    expect(tierManager.canRunValidationSweep()).toBe(false);
  });

  it('increments checkpoint usage and enforces 20-checkpoint limit on free tier', () => {
    const initial = tierManager.getQuotaStatus().checkpointsUsedThisMonth;
    const recorded = tierManager.recordCheckpointCreation();
    expect(recorded).toBe(true);

    const updated = tierManager.getQuotaStatus().checkpointsUsedThisMonth;
    expect(updated).toBe(initial + 1);

    // Simulate exhausting free quota (20 checkpoints)
    for (let i = updated; i < 20; i++) {
      expect(tierManager.recordCheckpointCreation()).toBe(true);
    }
    expect(tierManager.getQuotaStatus().canCreateCheckpoint).toBe(false);
    expect(tierManager.recordCheckpointCreation()).toBe(false);
  });

  it('unlocks Pro tier with valid license key, granting unlimited checkpoints & validation sweeps', () => {
    const result = tierManager.activateLicenseKey('SG-PRO-UNLIMITED-TEST');
    expect(result.success).toBe(true);

    const status = tierManager.getQuotaStatus();
    expect(status.tier).toBe('pro');
    expect(status.isPro).toBe(true);
    expect(status.checkpointsLimit).toBe(Infinity);
    expect(status.maxBranches).toBe(Infinity);
    expect(status.canRunValidationSweep).toBe(true);
    expect(tierManager.canRunValidationSweep()).toBe(true);
  });

  it('rejects invalid license keys', () => {
    const result = tierManager.activateLicenseKey('INVALID-KEY-1234');
    expect(result.success).toBe(false);
    expect(tierManager.getQuotaStatus().tier).toBe('free');
    expect(tierManager.canRunValidationSweep()).toBe(false);
  });
});
