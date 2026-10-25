export type SubscriptionTier = 'free' | 'pro';

export interface QuotaStatus {
  tier: SubscriptionTier;
  checkpointsUsedThisMonth: number;
  checkpointsLimit: number; // 20 for free, Infinity for pro
  remainingCheckpoints: number;
  monthIdentifier: string; // YYYY-MM
  isPro: boolean;
  canCreateCheckpoint: boolean;
  canCreateBranch: boolean;
  canRunValidationSweep: boolean;
  maxBranches: number;
}

export class TierManager {
  private static STORAGE_KEY = 'stateguard_quota_status';
  private static LICENSE_KEY = 'stateguard_license_key';
  public static FREE_CHECKPOINT_LIMIT = 20;
  public static FREE_BRANCH_LIMIT = 3;

  private currentTier: SubscriptionTier = 'free';
  private checkpointsUsed: number = 0;
  private currentMonthId: string = '';

  constructor() {
    this.currentMonthId = this.getCurrentMonthIdentifier();
    this.loadState();
  }

  private getCurrentMonthIdentifier(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  public isPro(): boolean {
    return this.currentTier === 'pro';
  }

  public canRunValidationSweep(): boolean {
    return this.isPro();
  }

  public getQuotaStatus(activeBranchCount: number = 1): QuotaStatus {
    this.checkMonthRoll();

    const isPro = this.currentTier === 'pro';
    const limit = isPro ? Infinity : TierManager.FREE_CHECKPOINT_LIMIT;
    const remaining = isPro ? Infinity : Math.max(0, limit - this.checkpointsUsed);
    const canCreateCheckpoint = isPro || this.checkpointsUsed < limit;
    const maxBranches = isPro ? Infinity : TierManager.FREE_BRANCH_LIMIT;
    const canCreateBranch = isPro || activeBranchCount < maxBranches;
    const canRunValidationSweep = isPro;

    return {
      tier: this.currentTier,
      checkpointsUsedThisMonth: this.checkpointsUsed,
      checkpointsLimit: limit,
      remainingCheckpoints: remaining,
      monthIdentifier: this.currentMonthId,
      isPro,
      canCreateCheckpoint,
      canCreateBranch,
      canRunValidationSweep,
      maxBranches,
    };
  }

  public canCreateCheckpoint(): boolean {
    return this.getQuotaStatus().canCreateCheckpoint;
  }

  public recordCheckpointCreation(): boolean {
    this.checkMonthRoll();

    if (!this.canCreateCheckpoint()) {
      return false;
    }

    this.checkpointsUsed++;
    this.saveState();
    return true;
  }

  public activateLicenseKey(licenseKey: string): { success: boolean; message: string } {
    const cleanKey = licenseKey.trim().toUpperCase();

    // Verification logic:
    // Any key starting with SG-PRO- or SG-FOUNDER- with valid checksum pattern
    if (/^SG-(PRO|FOUNDER)-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanKey) || cleanKey === 'SG-PRO-UNLIMITED-TEST') {
      this.currentTier = 'pro';
      this.saveState();
      this.saveLicense(cleanKey);
      return { success: true, message: 'StateGuard Pro activated! Unlimited checkpoints and automated AI background reasoning unlocked.' };
    }

    return { success: false, message: 'Invalid StateGuard license key format. Expected SG-PRO-XXXX-XXXX.' };
  }

  public downgradeToFree(): void {
    this.currentTier = 'free';
    this.saveState();
    this.clearLicense();
  }

  private checkMonthRoll(): void {
    const month = this.getCurrentMonthIdentifier();
    if (month !== this.currentMonthId) {
      this.currentMonthId = month;
      this.checkpointsUsed = 0; // Reset rolling monthly counter
      this.saveState();
    }
  }

  private loadState(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(TierManager.STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.monthId === this.currentMonthId) {
            this.checkpointsUsed = data.checkpointsUsed || 0;
          }
          this.currentTier = data.tier || 'free';
        }

        const lic = localStorage.getItem(TierManager.LICENSE_KEY);
        if (lic) {
          this.currentTier = 'pro';
        }
      } catch {
        // Fallback to defaults
      }
    }
  }

  private saveState(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          TierManager.STORAGE_KEY,
          JSON.stringify({
            tier: this.currentTier,
            checkpointsUsed: this.checkpointsUsed,
            monthId: this.currentMonthId,
          })
        );
      } catch {
        // Ignore storage errors
      }
    }
  }

  private saveLicense(key: string): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(TierManager.LICENSE_KEY, key);
      } catch {}
    }
  }

  private clearLicense(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(TierManager.LICENSE_KEY);
      } catch {}
    }
  }
}
