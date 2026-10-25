import { SessionTree } from '../core/dag/SessionTree';
import { TreeNode } from '../core/dag/types';
import { TreeGraphView } from './components/TreeGraphView';
import { GeminiEngine } from '../core/engine/GeminiEngine';
import { CryptoStorage, TTLPolicy } from '../core/storage/CryptoStorage';
import { TierManager } from '../core/monetization/TierManager';

export class StateGuardApp {
  private tree: SessionTree;
  private graphView: TreeGraphView | null = null;
  private engine: GeminiEngine;
  private storage: CryptoStorage;
  private tierManager: TierManager;

  private selectedNode: TreeNode | null = null;
  private explorerActiveTab: 'checkpoints' | 'nodes' = 'checkpoints';
  private explorerSearchQuery: string = '';

  constructor() {
    this.tree = new SessionTree('main');
    this.engine = new GeminiEngine({ model: 'gemini-3.8-flash', thinkingEffort: 'medium' });
    this.storage = new CryptoStorage();
    this.tierManager = new TierManager();
  }

  public async init(): Promise<void> {
    this.setupDOM();

    // Attempt restoring encrypted session if existing
    const saved = await this.storage.loadSnapshot();
    if (saved) {
      this.tree.importSnapshot(saved);
    } else {
      await this.tree.initRoot('StateGuard Project Anchor: High-Precision Code Architecture & Validation Session');
    }

    this.selectedNode = this.tree.getActiveNode();
    this.renderAll();
    this.bindEvents();
  }

  private setupDOM(): void {
    const container = document.getElementById('treeCanvas');
    if (container) {
      this.graphView = new TreeGraphView({
        container,
        onSelectNode: (node) => {
          this.selectedNode = node;
          this.renderInspector();
        },
        onRollback: (nodeId) => {
          this.handleRollback(nodeId);
        },
        onBranchOff: (nodeId) => {
          this.handleBranchOff(nodeId);
        },
      });
    }
  }

  private bindEvents(): void {
    // Tree event subscription
    this.tree.subscribe(async (event) => {
      this.renderAll();
      // Auto-save encrypted snapshot on mutations
      if (['commit', 'rollback', 'checkpoint', 'branch_created'].includes(event)) {
        const ttl = await this.storage.getTTLPolicy();
        await this.storage.saveSnapshot(this.tree.exportSnapshot(), ttl);
      }
    });

    // Prompt Submission
    const sendBtn = document.getElementById('sendPromptBtn');
    const promptInput = document.getElementById('promptInput') as HTMLTextAreaElement;

    if (sendBtn && promptInput) {
      sendBtn.addEventListener('click', () => this.handleSendTurn());
      promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendTurn();
        }
      });
    }

    // Checkpoint Button
    document.getElementById('quickCheckpointBtn')?.addEventListener('click', () => {
      this.handleCreateCheckpoint();
    });

    // Validation Sweep Button (Global delegation to capture dynamic buttons)
    document.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement)?.closest('#runSweepBtn');
      if (target) {
        e.preventDefault();
        this.handleRunValidationSweep();
      }
    });

    // Rollback Button
    document.getElementById('rollbackBtn')?.addEventListener('click', () => {
      if (this.selectedNode) {
        this.handleRollback(this.selectedNode.id);
      }
    });

    // Branch Off Button
    document.getElementById('branchOffBtn')?.addEventListener('click', () => {
      if (this.selectedNode) {
        this.handleBranchOff(this.selectedNode.id);
      }
    });

    // License modal trigger
    document.getElementById('upgradeProBtn')?.addEventListener('click', () => {
      this.showUpgradeModal('Unlock automated Gemini 3.8 Flash drift analysis and continuous validation with StateGuard Pro.');
    });

    // License activate button
    document.getElementById('activateLicenseBtn')?.addEventListener('click', () => {
      const input = document.getElementById('licenseKeyInput') as HTMLInputElement;
      if (input) {
        const res = this.tierManager.activateLicenseKey(input.value);
        alert(res.message);
        if (res.success) {
          this.toggleModal('licenseModal', false);
          this.renderQuotaHUD();
          this.renderAll();
        }
      }
    });

    // Nodes & Checkpoints View Trigger
    document.getElementById('nodesCheckpointsViewBtn')?.addEventListener('click', () => {
      this.showNodesCheckpointsModal();
    });

    // Explorer Tabs
    document.getElementById('explorerTabCheckpoints')?.addEventListener('click', () => {
      this.explorerActiveTab = 'checkpoints';
      document.getElementById('explorerTabCheckpoints')?.classList.add('active');
      document.getElementById('explorerTabNodes')?.classList.remove('active');
      this.renderExplorerItems();
    });

    document.getElementById('explorerTabNodes')?.addEventListener('click', () => {
      this.explorerActiveTab = 'nodes';
      document.getElementById('explorerTabNodes')?.classList.add('active');
      document.getElementById('explorerTabCheckpoints')?.classList.remove('active');
      this.renderExplorerItems();
    });

    // Explorer Search
    document.getElementById('explorerSearchInput')?.addEventListener('input', (e: any) => {
      this.explorerSearchQuery = e.target.value.toLowerCase().trim();
      this.renderExplorerItems();
    });

    // Close Modals
    document.querySelectorAll('.close-modal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.toggleModal('licenseModal', false);
        this.toggleModal('branchModal', false);
        this.toggleModal('apiKeyModal', false);
        this.toggleModal('nodesCheckpointsModal', false);
      });
    });

    // Settings API Key trigger
    document.getElementById('apiKeySettingBtn')?.addEventListener('click', () => {
      this.toggleModal('apiKeyModal', true);
    });

    // Save API key
    document.getElementById('saveApiKeyBtn')?.addEventListener('click', () => {
      const keyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
      if (keyInput && keyInput.value) {
        this.engine.setApiKey(keyInput.value);
        this.toggleModal('apiKeyModal', false);
        alert('Gemini 3.8 Flash engine credentials updated!');
      }
    });

    // TTL selector change
    const ttlSelect = document.getElementById('ttlSelect') as HTMLSelectElement;
    if (ttlSelect) {
      this.storage.getTTLPolicy().then((policy) => {
        ttlSelect.value = policy;
      });
      ttlSelect.addEventListener('change', async () => {
        const val = ttlSelect.value as TTLPolicy;
        await this.storage.saveSnapshot(this.tree.exportSnapshot(), val);
      });
    }

    // Export JSON
    document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
      const snapshot = this.tree.exportSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stateguard-session-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  private async handleSendTurn(): Promise<void> {
    const input = document.getElementById('promptInput') as HTMLTextAreaElement;
    if (!input || !input.value.trim()) return;

    const userPrompt = input.value.trim();
    input.value = '';

    // 1. Commit user turn
    const userNode = await this.tree.commit(userPrompt, 'user');
    this.selectedNode = userNode;

    // 2. Generate model response (simulated context or live call)
    const assistantContent = `[Gemini 3.8 Flash Response]: Processed intent for: "${userPrompt.substring(0, 80)}...". Context lineage maintained across active branch "${this.tree.getActiveBranchName()}".`;

    const assistantNode = await this.tree.commit(assistantContent, 'assistant', {
      validationStatus: 'clean',
      driftScore: 0,
    });
    this.selectedNode = assistantNode;

    // 3. Pro Users: Automated AI background reasoning
    if (this.tierManager.isPro()) {
      this.runBackgroundValidationSweep();
    }
  }

  private handleCreateCheckpoint(): void {
    const activeNode = this.tree.getActiveNode();
    if (!activeNode) return;

    const quota = this.tierManager.getQuotaStatus();
    if (!quota.canCreateCheckpoint) {
      this.showUpgradeModal(`Monthly Free Tier limit of ${TierManager.FREE_CHECKPOINT_LIMIT} checkpoints reached! Upgrade to StateGuard Pro for unlimited checkpoints.`);
      return;
    }

    const name = prompt('Enter a label for this Checkpoint snapshot:', `Verified State ${Date.now().toString().slice(-4)}`);
    if (!name) return;

    this.tree.checkpoint(activeNode.id, name);
    this.tierManager.recordCheckpointCreation();
    this.renderQuotaHUD();
    this.renderAll();
  }

  private handleRollback(nodeId: string): void {
    try {
      const result = this.tree.rollback(nodeId);
      this.selectedNode = result.node;
      this.renderAll();
    } catch (err: any) {
      alert(err.message);
    }
  }

  private handleBranchOff(nodeId: string): void {
    const quota = this.tierManager.getQuotaStatus(this.tree.getAllBranches().length);
    if (!quota.canCreateBranch) {
      this.showUpgradeModal(`Free Tier limit of ${TierManager.FREE_BRANCH_LIMIT} active branches reached. Upgrade to Pro for unlimited branching.`);
      return;
    }

    const branchName = prompt('Enter new branch name:', `feat-${Date.now().toString().slice(-4)}`);
    if (!branchName) return;

    try {
      this.tree.createBranch(branchName, nodeId);
      this.selectedNode = this.tree.getActiveNode();
      this.renderAll();
    } catch (err: any) {
      alert(err.message);
    }
  }

  private async handleRunValidationSweep(): Promise<void> {
    // Free Users: Clicking "Run Validation Sweep" triggers friendly upgrade modal
    if (!this.tierManager.isPro()) {
      this.showUpgradeModal('Unlock automated Gemini 3.8 Flash drift analysis and continuous validation with StateGuard Pro.');
      return;
    }

    const sweepBtn = document.getElementById('runSweepBtn');
    if (sweepBtn) sweepBtn.textContent = '⚡ Sweeping (Gemini 3.8 Flash)...';

    const ancestry = this.tree.getAncestry();
    const checkpoints = this.tree.getCheckpoints();
    const lastCheckpoint = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;

    const result = await this.engine.runValidationSweep(ancestry, lastCheckpoint);

    // Update active node with sweep metrics
    const activeNode = this.tree.getActiveNode();
    if (activeNode) {
      let status: 'clean' | 'warning' | 'drift_detected' = 'clean';
      if (result.driftScore > 35) status = 'drift_detected';
      else if (result.hallucinationRisk !== 'LOW') status = 'warning';

      this.tree.updateNodeMetadata(activeNode.id, {
        driftScore: result.driftScore,
        hallucinationRisk: result.hallucinationRisk,
        validationStatus: status,
        detectedIssues: result.detectedIssues,
        suggestedCorrection: result.suggestedCorrection || undefined,
        recommendedRollbackNodeId: result.recommendedRollbackNodeId,
        thoughtSummary: result.reasoningSummary,
      });
      this.selectedNode = this.tree.getActiveNode();
    }

    if (sweepBtn) sweepBtn.textContent = '⚡ Run Validation Sweep';
    this.renderSweepResult(result);
  }

  /**
   * Automated AI background reasoning for Pro users
   */
  private async runBackgroundValidationSweep(): Promise<void> {
    try {
      const ancestry = this.tree.getAncestry();
      const checkpoints = this.tree.getCheckpoints();
      const lastCheckpoint = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;

      const result = await this.engine.runValidationSweep(ancestry, lastCheckpoint);
      const activeNode = this.tree.getActiveNode();
      if (activeNode) {
        let status: 'clean' | 'warning' | 'drift_detected' = 'clean';
        if (result.driftScore > 35) status = 'drift_detected';
        else if (result.hallucinationRisk !== 'LOW') status = 'warning';

        this.tree.updateNodeMetadata(activeNode.id, {
          driftScore: result.driftScore,
          hallucinationRisk: result.hallucinationRisk,
          validationStatus: status,
          detectedIssues: result.detectedIssues,
          suggestedCorrection: result.suggestedCorrection || undefined,
          recommendedRollbackNodeId: result.recommendedRollbackNodeId,
          thoughtSummary: `[Automated AI Background Reasoning] ${result.reasoningSummary}`,
        });
        if (this.selectedNode?.id === activeNode.id) {
          this.selectedNode = this.tree.getActiveNode();
        }
        this.renderGraph();
        this.renderInspector();
        this.renderSweepResult(result);
      }
    } catch (err) {
      console.warn('StateGuard background AI reasoning notice:', err);
    }
  }

  public showUpgradeModal(customMessage?: string): void {
    const bannerText = document.getElementById('upgradeModalMessage');
    if (bannerText) {
      bannerText.textContent = customMessage || 'Unlock automated Gemini 3.8 Flash drift analysis and continuous validation with StateGuard Pro.';
    }
    this.toggleModal('licenseModal', true);
  }

  /**
   * View Functionality: Open explorer modal to check available nodes and checkpoints
   */
  public showNodesCheckpointsModal(): void {
    this.toggleModal('nodesCheckpointsModal', true);
    this.renderExplorerItems();
  }

  private renderExplorerItems(): void {
    const container = document.getElementById('explorerItemsList');
    const chkBadge = document.getElementById('explorerCheckpointBadge');
    const nodeBadge = document.getElementById('explorerNodeBadge');

    const allNodes = this.tree.getAllNodes().sort((a, b) => b.timestamp - a.timestamp);
    const allCheckpoints = this.tree.getCheckpoints().sort((a, b) => b.timestamp - a.timestamp);
    const activeHeadId = this.tree.getActiveNodeId();

    if (chkBadge) chkBadge.textContent = String(allCheckpoints.length);
    if (nodeBadge) nodeBadge.textContent = String(allNodes.length);

    if (!container) return;

    const isCheckpointsTab = this.explorerActiveTab === 'checkpoints';
    const items = isCheckpointsTab ? allCheckpoints : allNodes;

    // Filter by query
    const filtered = items.filter((item) => {
      if (!this.explorerSearchQuery) return true;
      const q = this.explorerSearchQuery;
      return (
        item.id.toLowerCase().includes(q) ||
        item.branchName.toLowerCase().includes(q) ||
        item.role.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        (item.metadata.checkpointName && item.metadata.checkpointName.toLowerCase().includes(q))
      );
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="explorer-empty-state" style="padding: 24px; text-align: center; color: var(--text-dim);">
          <div style="font-size: 28px; margin-bottom: 6px;">🔍</div>
          <p style="font-size: 13px;">No ${isCheckpointsTab ? 'checkpoints' : 'nodes'} found.</p>
          <span style="font-size: 11px;">${this.explorerSearchQuery ? 'Try clearing your filter search query.' : (isCheckpointsTab ? 'Create a checkpoint with ★ Snapshot Checkpoint!' : 'Start typing in the console to create turns.')}</span>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map((item) => {
      const isHead = item.id === activeHeadId;
      const isChk = !!item.metadata.isCheckpoint;
      const chkName = item.metadata.checkpointName || (isChk ? 'Checkpoint State' : null);
      const roleColor = item.role === 'assistant' ? 'var(--accent-indigo)' : (item.role === 'user' ? 'var(--accent-cyan)' : 'var(--accent-emerald)');
      const formattedDate = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      return `
        <div class="explorer-item-card ${isHead ? 'is-active-head' : ''} ${isChk ? 'is-checkpoint' : ''}">
          <div class="explorer-item-header">
            <div class="explorer-item-title-row">
              <span style="font-family: var(--font-mono); font-weight: 700; color: #fff;">${item.id}</span>
              <span class="tier-badge" style="background: rgba(255, 255, 255, 0.08); color: ${roleColor}; font-size: 9px;">${item.role.toUpperCase()}</span>
              ${isChk ? `<span class="tier-badge" style="background: rgba(16, 185, 129, 0.2); color: var(--accent-emerald); font-size: 9px;">★ ${escapeHtml(chkName || 'CHECKPOINT')}</span>` : ''}
              ${isHead ? `<span class="tier-badge" style="background: rgba(56, 189, 248, 0.2); color: var(--accent-cyan); font-size: 9px;">● ACTIVE HEAD</span>` : ''}
            </div>
            <div style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-cyan);">
              🌿 ${item.branchName}
            </div>
          </div>

          <div class="explorer-item-content">
            ${escapeHtml(item.content)}
          </div>

          <div class="explorer-item-meta">
            <span>⏱️ ${formattedDate}</span>
            <div class="explorer-actions">
              <button class="btn btn-secondary btn-sm explorer-inspect-btn" data-node-id="${item.id}" style="font-size: 11px; padding: 3px 8px;">
                🔍 Inspect
              </button>
              ${!isHead ? `
                <button class="btn btn-rose btn-sm explorer-rollback-btn" data-node-id="${item.id}" style="font-size: 11px; padding: 3px 8px;">
                  ⏪ Rollback Here
                </button>
              ` : `
                <span style="font-size: 11px; color: var(--accent-cyan); font-weight: 600; padding: 3px 6px;">Current Head</span>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach click events to dynamic item buttons
    container.querySelectorAll('.explorer-inspect-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const nodeId = (e.currentTarget as HTMLElement).getAttribute('data-node-id');
        if (nodeId) {
          const node = this.tree.getNode(nodeId);
          if (node) {
            this.selectedNode = node;
            this.renderInspector();
            this.toggleModal('nodesCheckpointsModal', false);
          }
        }
      });
    });

    container.querySelectorAll('.explorer-rollback-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const nodeId = (e.currentTarget as HTMLElement).getAttribute('data-node-id');
        if (nodeId) {
          this.handleRollback(nodeId);
          this.toggleModal('nodesCheckpointsModal', false);
        }
      });
    });
  }

  private renderAll(): void {
    this.renderGraph();
    this.renderInspector();
    this.renderQuotaHUD();
    this.renderBranchList();
  }

  private renderGraph(): void {
    if (this.graphView) {
      this.graphView.render(
        this.tree.getAllNodes(),
        this.tree.getAllBranches(),
        this.tree.getActiveNodeId(),
        this.tree.getActiveBranchName()
      );
    }
  }

  private renderInspector(): void {
    const node = this.selectedNode || this.tree.getActiveNode();
    const container = document.getElementById('inspectorContent');
    if (!container) return;

    if (!node) {
      container.innerHTML = '<p class="text-dim">No node selected.</p>';
      return;
    }

    const isCheckpoint = node.metadata.isCheckpoint;
    const isHead = node.id === this.tree.getActiveNodeId();

    container.innerHTML = `
      <div class="node-details-card">
        <div class="meta-grid">
          <div class="meta-box">
            <div class="meta-label">Node Hash</div>
            <div class="meta-value">${node.id}</div>
          </div>
          <div class="meta-box">
            <div class="meta-label">Role</div>
            <div class="meta-value" style="color: ${node.role === 'assistant' ? 'var(--accent-indigo)' : 'var(--accent-cyan)'}">${node.role.toUpperCase()}</div>
          </div>
          <div class="meta-box">
            <div class="meta-label">Branch</div>
            <div class="meta-value">${node.branchName}</div>
          </div>
          <div class="meta-box">
            <div class="meta-label">Status</div>
            <div class="meta-value" style="color: ${isCheckpoint ? 'var(--accent-emerald)' : 'var(--text-muted)'}">
              ${isCheckpoint ? '★ CHECKPOINT' : (isHead ? '● ACTIVE HEAD' : 'HISTORICAL')}
            </div>
          </div>
        </div>

        <div>
          <div class="meta-label">Message Content</div>
          <div class="content-preview-box">${escapeHtml(node.content)}</div>
        </div>

        ${node.metadata.suggestedCorrection ? `
          <div class="sweep-card active-drift">
            <div class="meta-label" style="color: var(--accent-amber)">Self-Correction Guidance</div>
            <p style="font-size: 12px; margin-top: 4px;">${escapeHtml(node.metadata.suggestedCorrection)}</p>
          </div>
        ` : ''}

        <div style="display: flex; gap: 8px; margin-top: 8px;">
          ${!isHead ? `
            <button id="nodeRollbackBtn" class="btn btn-rose btn-sm" style="flex: 1;">
              ⏪ Rollback Pointer Here
            </button>
          ` : ''}
          <button id="nodeBranchBtn" class="btn btn-secondary btn-sm" style="flex: 1;">
            🌿 Branch Off Node
          </button>
        </div>
      </div>
    `;

    document.getElementById('nodeRollbackBtn')?.addEventListener('click', () => {
      this.handleRollback(node.id);
    });

    document.getElementById('nodeBranchBtn')?.addEventListener('click', () => {
      this.handleBranchOff(node.id);
    });
  }

  private renderSweepResult(result: any): void {
    const container = document.getElementById('sweepCardContainer');
    if (!container) return;

    const driftClass = result.driftScore > 50 ? 'drift-high' : (result.driftScore > 25 ? 'drift-med' : 'drift-low');

    container.innerHTML = `
      <div class="sweep-card ${result.driftScore > 35 ? 'active-drift' : ''}">
        <div class="sweep-header">
          <div style="font-size: 12px; font-weight: 700; color: var(--accent-cyan)">
            Gemini 3.8 Flash Sweep
          </div>
          <span class="tier-badge" style="background: rgba(56, 189, 248, 0.2); color: var(--accent-cyan)">
            Thinking: Medium
          </span>
        </div>

        <div class="drift-gauge-container">
          <span style="font-size: 11px; color: var(--text-dim)">Drift:</span>
          <div class="drift-meter">
            <div class="drift-bar ${driftClass}" style="width: ${result.driftScore}%"></div>
          </div>
          <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 700">${result.driftScore}%</span>
        </div>

        <div style="margin-top: 8px; font-size: 12px; color: var(--text-muted)">
          ${result.reasoningSummary}
        </div>

        ${result.recommendedRollbackNodeId ? `
          <div style="margin-top: 10px;">
            <button id="recommendedRollbackBtn" class="btn btn-rose btn-sm" style="width: 100%;">
              ⏪ Auto-Rollback to Clean Node (${result.recommendedRollbackNodeId})
            </button>
          </div>
        ` : ''}
      </div>
    `;

    if (result.recommendedRollbackNodeId) {
      document.getElementById('recommendedRollbackBtn')?.addEventListener('click', () => {
        this.handleRollback(result.recommendedRollbackNodeId);
      });
    }
  }

  private renderQuotaHUD(): void {
    const quota = this.tierManager.getQuotaStatus(this.tree.getAllBranches().length);
    const hudPill = document.getElementById('quotaUsedPill');
    const badge = document.getElementById('tierBadge');

    if (hudPill) {
      if (quota.isPro) {
        hudPill.textContent = 'Unlimited (Pro)';
      } else {
        hudPill.textContent = `${quota.checkpointsUsedThisMonth}/${quota.checkpointsLimit} Used`;
      }
    }

    if (badge) {
      badge.textContent = quota.tier.toUpperCase();
      badge.className = `tier-badge ${quota.isPro ? 'tier-pro' : 'tier-free'}`;
    }
  }

  private renderBranchList(): void {
    const container = document.getElementById('branchSelector');
    if (!container) return;

    const branches = this.tree.getAllBranches();
    const active = this.tree.getActiveBranchName();

    container.innerHTML = `
      <select id="branchSelectDropdown" class="form-input" style="padding: 4px 8px; font-size: 12px;">
        ${branches.map((b) => `<option value="${b.name}" ${b.name === active ? 'selected' : ''}>🌿 ${b.name}</option>`).join('')}
      </select>
    `;

    document.getElementById('branchSelectDropdown')?.addEventListener('change', (e: any) => {
      this.tree.checkoutBranch(e.target.value);
      this.selectedNode = this.tree.getActiveNode();
      this.renderAll();
    });
  }

  private toggleModal(modalId: string, show: boolean): void {
    const el = document.getElementById(modalId);
    if (el) {
      if (show) el.classList.add('is-visible');
      else el.classList.remove('is-visible');
    }
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Auto-boot on DOM ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new StateGuardApp();
    app.init().catch(console.error);
    (window as any).stateGuardApp = app;
  });
}
