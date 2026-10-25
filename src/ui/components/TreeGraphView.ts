import { TreeNode, Branch } from '../../core/dag/types';

export interface TreeGraphOptions {
  container: HTMLElement;
  onSelectNode: (node: TreeNode) => void;
  onRollback: (nodeId: string) => void;
  onBranchOff: (nodeId: string) => void;
}

export class TreeGraphView {
  private container: HTMLElement;
  private onSelectNode: (node: TreeNode) => void;
  private onRollback: (nodeId: string) => void;
  private onBranchOff: (nodeId: string) => void;
  private selectedNodeId: string | null = null;

  constructor(options: TreeGraphOptions) {
    this.container = options.container;
    this.onSelectNode = options.onSelectNode;
    this.onRollback = options.onRollback;
    this.onBranchOff = options.onBranchOff;
  }

  public triggerRollback(nodeId: string): void {
    this.onRollback(nodeId);
  }

  public triggerBranchOff(nodeId: string): void {
    this.onBranchOff(nodeId);
  }

  public render(
    nodes: TreeNode[],
    branches: Branch[],
    activeNodeId: string | null,
    activeBranchName: string
  ): void {
    if (!this.container) return;

    this.container.innerHTML = '';

    if (nodes.length === 0) {
      this.container.innerHTML = `
        <div class="empty-tree-state">
          <div class="empty-icon">🌱</div>
          <p>No turns committed yet.</p>
          <span>Start a prompt in the console to watch your Git tree branch live.</span>
        </div>
      `;
      return;
    }

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'git-tree-svg');

    // Layout configuration
    const nodeRadius = 18;
    const verticalGap = 72;
    const horizontalLaneWidth = 90;

    // Map branches to visual lanes
    const branchLaneMap: Map<string, number> = new Map();
    branchLaneMap.set('main', 0);
    let nextLane = 1;
    for (const b of branches) {
      if (!branchLaneMap.has(b.name)) {
        branchLaneMap.set(b.name, nextLane++);
      }
    }

    // Sort nodes chronologically
    const sortedNodes = [...nodes].sort((a, b) => a.timestamp - b.timestamp);
    const nodeCoords: Map<string, { x: number; y: number; lane: number }> = new Map();

    sortedNodes.forEach((node, index) => {
      const lane = branchLaneMap.get(node.branchName) || 0;
      const x = 50 + lane * horizontalLaneWidth;
      const y = 40 + index * verticalGap;
      nodeCoords.set(node.id, { x, y, lane });
    });

    const totalHeight = 80 + sortedNodes.length * verticalGap;
    const totalWidth = Math.max(340, 100 + (branchLaneMap.size * horizontalLaneWidth));
    svg.setAttribute('height', `${totalHeight}px`);
    svg.setAttribute('width', `${totalWidth}px`);

    // Draw branch connecting lines (Bezier curves)
    const defs = document.createElementNS(svgNs, 'defs');
    defs.innerHTML = `
      <linearGradient id="mainBranchGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="100%" stop-color="#818cf8" />
      </linearGradient>
      <linearGradient id="sideBranchGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#34d399" />
        <stop offset="100%" stop-color="#38bdf8" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    `;
    svg.appendChild(defs);

    // Edges
    sortedNodes.forEach((node) => {
      if (!node.parentId) return;
      const parentCoord = nodeCoords.get(node.parentId);
      const currentCoord = nodeCoords.get(node.id);
      if (!parentCoord || !currentCoord) return;

      const path = document.createElementNS(svgNs, 'path');
      const startX = parentCoord.x;
      const startY = parentCoord.y;
      const endX = currentCoord.x;
      const endY = currentCoord.y;

      let d = '';
      if (startX === endX) {
        d = `M ${startX} ${startY} L ${endX} ${endY}`;
      } else {
        // Smooth bezier curve between branching lanes
        const midY = (startY + endY) / 2;
        d = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
      }

      path.setAttribute('d', d);
      path.setAttribute('class', node.branchName === 'main' ? 'tree-edge main-edge' : 'tree-edge side-edge');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('stroke', node.branchName === 'main' ? 'url(#mainBranchGrad)' : 'url(#sideBranchGrad)');
      svg.appendChild(path);
    });

    // Nodes
    sortedNodes.forEach((node) => {
      const coord = nodeCoords.get(node.id);
      if (!coord) return;

      const group = document.createElementNS(svgNs, 'g');
      group.setAttribute('class', `tree-node-group ${node.id === activeNodeId ? 'is-active' : ''} ${node.id === this.selectedNodeId ? 'is-selected' : ''}`);
      group.setAttribute('transform', `translate(${coord.x}, ${coord.y})`);
      group.style.cursor = 'pointer';

      // Outer active ring
      if (node.id === activeNodeId) {
        const ring = document.createElementNS(svgNs, 'circle');
        ring.setAttribute('r', `${nodeRadius + 6}`);
        ring.setAttribute('class', 'active-pulse-ring');
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', '#38bdf8');
        ring.setAttribute('stroke-width', '2');
        ring.setAttribute('stroke-dasharray', '4 2');
        group.appendChild(ring);
      }

      // Main Node Circle
      const circle = document.createElementNS(svgNs, 'circle');
      circle.setAttribute('r', `${nodeRadius}`);
      circle.setAttribute('class', `node-circle role-${node.role}`);

      let fillColor = '#1e293b';
      let strokeColor = '#64748b';

      if (node.metadata.isCheckpoint) {
        fillColor = '#065f46';
        strokeColor = '#10b981';
      } else if (node.metadata.validationStatus === 'drift_detected') {
        fillColor = '#7c2d12';
        strokeColor = '#f97316';
      } else if (node.role === 'assistant') {
        fillColor = '#1e1b4b';
        strokeColor = '#6366f1';
      } else if (node.role === 'user') {
        fillColor = '#0f172a';
        strokeColor = '#38bdf8';
      }

      circle.setAttribute('fill', fillColor);
      circle.setAttribute('stroke', strokeColor);
      circle.setAttribute('stroke-width', '2.5');
      group.appendChild(circle);

      // Icon / glyph inside node
      const text = document.createElementNS(svgNs, 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('fill', '#f8fafc');
      text.setAttribute('font-size', '10px');
      text.setAttribute('font-weight', '700');
      text.setAttribute('font-family', 'ui-monospace, SFMono-Regular, monospace');

      let glyph = node.id.substring(0, 3);
      if (node.metadata.isCheckpoint) glyph = '★';
      else if (node.role === 'user') glyph = 'U';
      else if (node.role === 'assistant') glyph = 'AI';
      text.textContent = glyph;
      group.appendChild(text);

      // Node Label (Commit Hash + Role)
      const label = document.createElementNS(svgNs, 'text');
      label.setAttribute('x', `${nodeRadius + 12}`);
      label.setAttribute('y', '0');
      label.setAttribute('dominant-baseline', 'central');
      label.setAttribute('fill', '#cbd5e1');
      label.setAttribute('font-size', '12px');
      label.setAttribute('font-family', 'Inter, system-ui, sans-serif');

      let labelText = `${node.id} · ${node.role}`;
      if (node.metadata.checkpointName) {
        labelText += ` [${node.metadata.checkpointName}]`;
      }
      if (node.metadata.driftScore && node.metadata.driftScore > 30) {
        labelText += ` ⚠ ${node.metadata.driftScore}% drift`;
      }
      label.textContent = labelText;
      group.appendChild(label);

      // Interaction listeners
      group.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedNodeId = node.id;
        this.render(nodes, branches, activeNodeId, activeBranchName);
        this.onSelectNode(node);
      });

      svg.appendChild(group);
    });

    this.container.appendChild(svg);
  }

  public getSelectedNodeId(): string | null {
    return this.selectedNodeId;
  }
}
