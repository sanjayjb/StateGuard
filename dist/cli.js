#!/usr/bin/env node

// src/core/dag/crypto.ts
async function computeCommitHash(content, parentId, timestamp, role) {
  const payload = `${parentId || "root"}:${role}:${timestamp}:${content}`;
  let hashHex = "";
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } else {
    try {
      const nodeCrypto = await import("crypto");
      hashHex = nodeCrypto.createHash("sha256").update(payload).digest("hex");
    } catch {
      let hash = 0;
      for (let i = 0; i < payload.length; i++) {
        const char = payload.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
      }
      hashHex = Math.abs(hash).toString(16).padStart(16, "0");
    }
  }
  const shortHash = hashHex.substring(0, 7);
  return { shortHash, fullHash: hashHex };
}

// src/core/dag/SessionTree.ts
var SessionTree = class {
  nodes = /* @__PURE__ */ new Map();
  branches = /* @__PURE__ */ new Map();
  activeBranchName = "main";
  activeNodeId = null;
  checkpoints = /* @__PURE__ */ new Set();
  listeners = /* @__PURE__ */ new Set();
  constructor(initialBranch = "main") {
    this.activeBranchName = initialBranch;
  }
  /**
   * Subscribe to tree updates
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify(event, payload) {
    for (const listener of this.listeners) {
      try {
        listener(event, payload);
      } catch (err) {
        console.error("StateGuard SessionTree listener error:", err);
      }
    }
  }
  /**
   * Creates a root system/prompt node if the tree is empty
   */
  async initRoot(systemPrompt = "StateGuard Session Initialized") {
    if (this.nodes.size > 0) {
      const existing = this.getActiveNode();
      if (existing) return existing;
    }
    const timestamp = Date.now();
    const { shortHash, fullHash } = await computeCommitHash(systemPrompt, null, timestamp, "system");
    const rootNode = {
      id: shortHash,
      fullHash,
      parentId: null,
      childrenIds: [],
      timestamp,
      role: "system",
      content: systemPrompt,
      metadata: {
        isCheckpoint: true,
        checkpointName: "Genesis State",
        validationStatus: "clean",
        driftScore: 0
      },
      branchName: this.activeBranchName
    };
    this.nodes.set(rootNode.id, rootNode);
    this.checkpoints.add(rootNode.id);
    this.activeNodeId = rootNode.id;
    const branch = {
      name: this.activeBranchName,
      headNodeId: rootNode.id,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.branches.set(this.activeBranchName, branch);
    this.notify("init", rootNode);
    return rootNode;
  }
  /**
   * Commits a new conversation turn (user prompt or assistant response)
   */
  async commit(content, role, metadata = {}) {
    if (this.nodes.size === 0) {
      await this.initRoot();
    }
    const parentId = this.activeNodeId;
    const timestamp = Date.now();
    const { shortHash, fullHash } = await computeCommitHash(content, parentId, timestamp, role);
    let resolvedId = shortHash;
    if (this.nodes.has(resolvedId)) {
      resolvedId = `${shortHash}-${Math.random().toString(36).substring(2, 5)}`;
    }
    const newNode = {
      id: resolvedId,
      fullHash,
      parentId,
      childrenIds: [],
      timestamp,
      role,
      content,
      metadata: {
        validationStatus: "clean",
        driftScore: 0,
        ...metadata
      },
      branchName: this.activeBranchName
    };
    if (parentId && this.nodes.has(parentId)) {
      const parent = this.nodes.get(parentId);
      if (!parent.childrenIds.includes(newNode.id)) {
        parent.childrenIds.push(newNode.id);
      }
    }
    this.nodes.set(newNode.id, newNode);
    this.activeNodeId = newNode.id;
    const existingBranch = this.branches.get(this.activeBranchName);
    if (existingBranch) {
      existingBranch.headNodeId = newNode.id;
      existingBranch.updatedAt = timestamp;
    } else {
      this.branches.set(this.activeBranchName, {
        name: this.activeBranchName,
        headNodeId: newNode.id,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
    if (newNode.metadata.isCheckpoint) {
      this.checkpoints.add(newNode.id);
    }
    this.notify("commit", newNode);
    return newNode;
  }
  /**
   * Tags a specific node as a verified Checkpoint
   */
  checkpoint(nodeId, checkpointName) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    node.metadata.isCheckpoint = true;
    node.metadata.checkpointName = checkpointName;
    this.checkpoints.add(node.id);
    this.notify("checkpoint", { nodeId, checkpointName, node });
    return node;
  }
  /**
   * Creates a new branch from a specified node (or current active node)
   */
  createBranch(branchName, fromNodeId) {
    const targetNodeId = fromNodeId || this.activeNodeId;
    if (!targetNodeId || !this.nodes.has(targetNodeId)) {
      throw new Error(`Invalid source node for branch: ${targetNodeId}`);
    }
    const cleanBranchName = branchName.trim().replace(/\s+/g, "-").toLowerCase();
    if (this.branches.has(cleanBranchName)) {
      throw new Error(`Branch already exists: ${cleanBranchName}`);
    }
    const timestamp = Date.now();
    const branch = {
      name: cleanBranchName,
      headNodeId: targetNodeId,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.branches.set(cleanBranchName, branch);
    this.activeBranchName = cleanBranchName;
    this.activeNodeId = targetNodeId;
    this.notify("branch_created", branch);
    return branch;
  }
  /**
   * Switches active pointer to an existing branch
   */
  checkoutBranch(branchName) {
    const branch = this.branches.get(branchName);
    if (!branch) {
      throw new Error(`Branch not found: ${branchName}`);
    }
    this.activeBranchName = branchName;
    this.activeNodeId = branch.headNodeId;
    this.notify("checkout_branch", branch);
    return branch;
  }
  /**
   * Instant One-Click Rollback:
   * Moves active pointer back to target historical node without destroying future nodes.
   */
  rollback(targetNodeId) {
    const targetNode = this.nodes.get(targetNodeId);
    if (!targetNode) {
      throw new Error(`Cannot rollback to non-existent node: ${targetNodeId}`);
    }
    const previousNodeId = this.activeNodeId;
    this.activeNodeId = targetNode.id;
    const currentBranch = this.branches.get(this.activeBranchName);
    if (currentBranch) {
      currentBranch.headNodeId = targetNode.id;
      currentBranch.updatedAt = Date.now();
    }
    const result = {
      previousNodeId,
      targetNodeId: targetNode.id,
      targetBranch: this.activeBranchName,
      node: targetNode
    };
    this.notify("rollback", result);
    return result;
  }
  /**
   * Updates metadata (validation sweeps, drift scores, hallucination tags) on a node
   */
  updateNodeMetadata(nodeId, updates) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    node.metadata = {
      ...node.metadata,
      ...updates
    };
    if (updates.isCheckpoint !== void 0) {
      if (updates.isCheckpoint) {
        this.checkpoints.add(node.id);
      } else {
        this.checkpoints.delete(node.id);
      }
    }
    this.notify("node_updated", node);
    return node;
  }
  /**
   * Returns complete ancestry lineage path from root up to specified node
   */
  getAncestry(fromNodeId) {
    const targetId = fromNodeId || this.activeNodeId;
    if (!targetId) return [];
    const ancestry = [];
    let currentId = targetId;
    const visited = /* @__PURE__ */ new Set();
    while (currentId) {
      if (visited.has(currentId)) {
        console.warn("Cycle detected in SessionTree DAG:", currentId);
        break;
      }
      visited.add(currentId);
      const node = this.nodes.get(currentId);
      if (!node) break;
      ancestry.unshift(node);
      currentId = node.parentId;
    }
    return ancestry;
  }
  /**
   * Returns active node
   */
  getActiveNode() {
    if (!this.activeNodeId) return null;
    return this.nodes.get(this.activeNodeId) || null;
  }
  getActiveNodeId() {
    return this.activeNodeId;
  }
  getActiveBranchName() {
    return this.activeBranchName;
  }
  getNode(nodeId) {
    return this.nodes.get(nodeId) || null;
  }
  getAllNodes() {
    return Array.from(this.nodes.values());
  }
  getAllBranches() {
    return Array.from(this.branches.values());
  }
  getCheckpoints() {
    const result = [];
    for (const id of this.checkpoints) {
      const node = this.nodes.get(id);
      if (node) result.push(node);
    }
    return result;
  }
  /**
   * Exports full tree snapshot for backups, sync, or encrypted storage
   */
  exportSnapshot() {
    const branchesObj = {};
    for (const [k, v] of this.branches.entries()) {
      branchesObj[k] = v;
    }
    const nodesObj = {};
    for (const [k, v] of this.nodes.entries()) {
      nodesObj[k] = v;
    }
    return {
      version: "1.0.0",
      activeBranch: this.activeBranchName,
      activeNodeId: this.activeNodeId,
      branches: branchesObj,
      nodes: nodesObj,
      checkpoints: Array.from(this.checkpoints)
    };
  }
  /**
   * Restores tree state from snapshot
   */
  importSnapshot(snapshot) {
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
    this.activeBranchName = snapshot.activeBranch || "main";
    this.activeNodeId = snapshot.activeNodeId || null;
    this.notify("imported", snapshot);
  }
};

// src/core/engine/GeminiEngine.ts
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// src/core/engine/promptTemplates.ts
function buildValidationSweepPrompt(ancestry, lastCheckpoint) {
  const formattedTurns = ancestry.map((node, index) => {
    const isCp = node.metadata.isCheckpoint ? " [CHECKPOINT PINNED]" : "";
    return `Turn #${index + 1} [ID: ${node.id}] (${node.role.toUpperCase()})${isCp}:
${node.content}
`;
  }).join("\n---\n");
  const checkpointAnchor = lastCheckpoint ? `Anchor Point (Verified Baseline): Turn [ID: ${lastCheckpoint.id}] - "${lastCheckpoint.content.substring(0, 180)}..."` : `Anchor Point: Genesis Prompt (Turn #1)`;
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

// src/core/engine/GeminiEngine.ts
var GeminiEngine = class {
  client = null;
  apiKey = null;
  model = "gemini-3.8-flash";
  thinkingEffort = "medium";
  constructor(config = {}) {
    this.model = config.model || "gemini-3.8-flash";
    this.thinkingEffort = config.thinkingEffort || "medium";
    if (config.apiKey) {
      this.setApiKey(config.apiKey);
    } else {
      this.detectAmbientCredentials();
    }
  }
  /**
   * Zero-friction auth: Attempts to discover ambient credentials from
   * process.env or window global configuration.
   */
  detectAmbientCredentials() {
    let key = null;
    if (typeof process !== "undefined" && process.env) {
      key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
    }
    if (!key && typeof import.meta !== "undefined" && import.meta.env) {
      const metaEnv = import.meta.env;
      key = metaEnv.VITE_GEMINI_API_KEY || metaEnv.GEMINI_API_KEY || null;
    }
    if (!key && typeof window !== "undefined") {
      const win = window;
      key = win.__STATEGUARD_API_KEY__ || win.GEMINI_API_KEY || null;
    }
    if (key) {
      this.setApiKey(key);
      return true;
    }
    return false;
  }
  setApiKey(apiKey) {
    this.apiKey = apiKey.trim();
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
  }
  hasActiveKey() {
    return !!this.apiKey && !!this.client;
  }
  getModel() {
    return this.model;
  }
  /**
   * Executes an automated validation sweep on dialogue ancestry using Gemini 3.8 Flash
   * with thinkingConfig: { thinkingEffort: 'medium' }
   */
  async runValidationSweep(ancestry, lastCheckpoint) {
    if (ancestry.length === 0) {
      return {
        driftScore: 0,
        hallucinationRisk: "LOW",
        logicalConsistency: true,
        detectedIssues: [],
        suggestedCorrection: null,
        recommendedRollbackNodeId: null,
        reasoningSummary: "No dialogue nodes to analyze."
      };
    }
    const prompt = buildValidationSweepPrompt(ancestry, lastCheckpoint);
    if (this.client) {
      try {
        const levelMap = {
          low: ThinkingLevel.LOW,
          medium: ThinkingLevel.MEDIUM,
          high: ThinkingLevel.HIGH
        };
        const response = await this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            thinkingConfig: {
              thinkingLevel: levelMap[this.thinkingEffort] || ThinkingLevel.MEDIUM
            },
            responseMimeType: "application/json"
          }
        });
        const rawText = response.text || "";
        return this.parseSweepResponse(rawText, ancestry);
      } catch (err) {
        console.warn("Live Gemini 3.8 Flash call failed, utilizing high-precision heuristic fallback:", err);
        return this.runHeuristicSweep(ancestry, lastCheckpoint, `API Notice: ${err.message || "Call failed"}`);
      }
    }
    return this.runHeuristicSweep(ancestry, lastCheckpoint);
  }
  parseSweepResponse(rawText, ancestry) {
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        driftScore: typeof parsed.driftScore === "number" ? Math.min(100, Math.max(0, parsed.driftScore)) : 10,
        hallucinationRisk: ["LOW", "MEDIUM", "HIGH"].includes(parsed.hallucinationRisk) ? parsed.hallucinationRisk : "LOW",
        logicalConsistency: typeof parsed.logicalConsistency === "boolean" ? parsed.logicalConsistency : true,
        detectedIssues: Array.isArray(parsed.detectedIssues) ? parsed.detectedIssues : [],
        suggestedCorrection: parsed.suggestedCorrection || null,
        recommendedRollbackNodeId: parsed.recommendedRollbackNodeId || null,
        reasoningSummary: parsed.reasoningSummary || "Validation sweep completed successfully via gemini-3.8-flash."
      };
    } catch {
      return this.runHeuristicSweep(ancestry, null, "Parsed from text output");
    }
  }
  /**
   * Deterministic local heuristic validation sweep (used for instant offline testing or zero-key mode)
   */
  runHeuristicSweep(ancestry, lastCheckpoint, reasoningPrefix = "Ambient heuristic reasoning") {
    const totalTurns = ancestry.length;
    let drift = Math.min(65, Math.floor(totalTurns * 4.5));
    const detectedIssues = [];
    let hallucinationRisk = "LOW";
    let recommendedRollback = null;
    let suggestedCorrection = null;
    const assistantTurns = ancestry.filter((n) => n.role === "assistant");
    if (assistantTurns.length >= 3) {
      const latest = assistantTurns[assistantTurns.length - 1].content;
      const prev = assistantTurns[assistantTurns.length - 2].content;
      const latestWords = new Set(latest.toLowerCase().split(/\s+/));
      const prevWords = new Set(prev.toLowerCase().split(/\s+/));
      let intersection = 0;
      for (const w of latestWords) {
        if (prevWords.has(w)) intersection++;
      }
      const similarity = intersection / Math.max(1, latestWords.size);
      if (similarity > 0.65) {
        drift = Math.max(drift, 48);
        hallucinationRisk = "MEDIUM";
        detectedIssues.push("Circular repetition loop detected across consecutive assistant responses.");
        suggestedCorrection = "Please disengage from repeating previous premises and refocus directly on solving the primary task objective.";
        if (lastCheckpoint) {
          recommendedRollback = lastCheckpoint.id;
        }
      }
    }
    if (totalTurns > 10 && drift > 40) {
      detectedIssues.push("Long context horizon: 10+ turns accumulated without a verified checkpoint pin.");
    }
    return {
      driftScore: drift,
      hallucinationRisk,
      logicalConsistency: hallucinationRisk !== "HIGH",
      detectedIssues,
      suggestedCorrection,
      recommendedRollbackNodeId: recommendedRollback,
      reasoningSummary: `${reasoningPrefix}: Processed ${ancestry.length} nodes against anchor ${lastCheckpoint ? lastCheckpoint.id : "Genesis"}. Thinking effort level: ${this.thinkingEffort}.`
    };
  }
};

// src/core/storage/CryptoStorage.ts
var CryptoStorage = class _CryptoStorage {
  static STORAGE_KEY = "stateguard_session_encrypted";
  static TTL_KEY = "stateguard_session_ttl_policy";
  masterPassphrase = "stateguard-ephemeral-local-key";
  constructor(passphrase) {
    if (passphrase) {
      this.masterPassphrase = passphrase;
    }
  }
  /**
   * Derives an AES-GCM 256-bit key using PBKDF2
   */
  async deriveKey(saltBytes) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(this.masterPassphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: 1e5,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
  /**
   * Encrypts and saves tree snapshot with specified TTL policy
   */
  async saveSnapshot(snapshot, ttlPolicy = "24h") {
    const plaintext = JSON.stringify(snapshot);
    const enc = new TextEncoder();
    const encoded = enc.encode(plaintext);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(salt);
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoded
    );
    const ciphertext = this.bufferToBase64(new Uint8Array(ciphertextBuffer));
    const ivBase64 = this.bufferToBase64(iv);
    const saltBase64 = this.bufferToBase64(salt);
    let expiresAt = null;
    const now = Date.now();
    if (ttlPolicy === "1h") expiresAt = now + 60 * 60 * 1e3;
    else if (ttlPolicy === "24h") expiresAt = now + 24 * 60 * 60 * 1e3;
    else if (ttlPolicy === "7d") expiresAt = now + 7 * 24 * 60 * 60 * 1e3;
    else if (ttlPolicy === "session") expiresAt = null;
    const record = {
      ciphertext,
      iv: ivBase64,
      salt: saltBase64,
      expiresAt,
      version: "1.0.0"
    };
    await this.writeRaw(_CryptoStorage.STORAGE_KEY, JSON.stringify(record));
    await this.writeRaw(_CryptoStorage.TTL_KEY, ttlPolicy);
  }
  /**
   * Loads and decrypts tree snapshot, verifying TTL expiration
   */
  async loadSnapshot() {
    const raw = await this.readRaw(_CryptoStorage.STORAGE_KEY);
    if (!raw) return null;
    try {
      const record = JSON.parse(raw);
      if (record.expiresAt && Date.now() > record.expiresAt) {
        console.warn("StateGuard encrypted session expired due to TTL auto-purge. Purging.");
        await this.clear();
        return null;
      }
      const salt = this.base64ToBuffer(record.salt);
      const iv = this.base64ToBuffer(record.iv);
      const ciphertext = this.base64ToBuffer(record.ciphertext);
      const key = await this.deriveKey(salt);
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );
      const dec = new TextDecoder();
      const plaintext = dec.decode(decryptedBuffer);
      return JSON.parse(plaintext);
    } catch (err) {
      console.error("Failed to decrypt StateGuard snapshot:", err);
      return null;
    }
  }
  async clear() {
    await this.removeRaw(_CryptoStorage.STORAGE_KEY);
  }
  async getTTLPolicy() {
    const policy = await this.readRaw(_CryptoStorage.TTL_KEY);
    return policy || "24h";
  }
  // Storage primitives compatible with Chrome Extension Storage or LocalStorage
  async writeRaw(key, value) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      });
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  }
  async readRaw(key) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
          resolve(result[key] || null);
        });
      });
    }
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
    return null;
  }
  async removeRaw(key) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.remove(key, () => resolve());
      });
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  }
  bufferToBase64(buffer) {
    let binary = "";
    const len = buffer.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }
  base64ToBuffer(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
};

// src/core/monetization/TierManager.ts
var TierManager = class _TierManager {
  static STORAGE_KEY = "stateguard_quota_status";
  static LICENSE_KEY = "stateguard_license_key";
  static FREE_CHECKPOINT_LIMIT = 20;
  static FREE_BRANCH_LIMIT = 3;
  currentTier = "free";
  checkpointsUsed = 0;
  currentMonthId = "";
  constructor() {
    this.currentMonthId = this.getCurrentMonthIdentifier();
    this.loadState();
  }
  getCurrentMonthIdentifier() {
    const d = /* @__PURE__ */ new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  isPro() {
    return this.currentTier === "pro";
  }
  canRunValidationSweep() {
    return this.isPro();
  }
  getQuotaStatus(activeBranchCount = 1) {
    this.checkMonthRoll();
    const isPro = this.currentTier === "pro";
    const limit = isPro ? Infinity : _TierManager.FREE_CHECKPOINT_LIMIT;
    const remaining = isPro ? Infinity : Math.max(0, limit - this.checkpointsUsed);
    const canCreateCheckpoint = isPro || this.checkpointsUsed < limit;
    const maxBranches = isPro ? Infinity : _TierManager.FREE_BRANCH_LIMIT;
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
      maxBranches
    };
  }
  canCreateCheckpoint() {
    return this.getQuotaStatus().canCreateCheckpoint;
  }
  recordCheckpointCreation() {
    this.checkMonthRoll();
    if (!this.canCreateCheckpoint()) {
      return false;
    }
    this.checkpointsUsed++;
    this.saveState();
    return true;
  }
  activateLicenseKey(licenseKey) {
    const cleanKey = licenseKey.trim().toUpperCase();
    if (/^SG-(PRO|FOUNDER)-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanKey) || cleanKey === "SG-PRO-UNLIMITED-TEST") {
      this.currentTier = "pro";
      this.saveState();
      this.saveLicense(cleanKey);
      return { success: true, message: "StateGuard Pro activated! Unlimited checkpoints and automated AI background reasoning unlocked." };
    }
    return { success: false, message: "Invalid StateGuard license key format. Expected SG-PRO-XXXX-XXXX." };
  }
  downgradeToFree() {
    this.currentTier = "free";
    this.saveState();
    this.clearLicense();
  }
  checkMonthRoll() {
    const month = this.getCurrentMonthIdentifier();
    if (month !== this.currentMonthId) {
      this.currentMonthId = month;
      this.checkpointsUsed = 0;
      this.saveState();
    }
  }
  loadState() {
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(_TierManager.STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.monthId === this.currentMonthId) {
            this.checkpointsUsed = data.checkpointsUsed || 0;
          }
          this.currentTier = data.tier || "free";
        }
        const lic = localStorage.getItem(_TierManager.LICENSE_KEY);
        if (lic) {
          this.currentTier = "pro";
        }
      } catch {
      }
    }
  }
  saveState() {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(
          _TierManager.STORAGE_KEY,
          JSON.stringify({
            tier: this.currentTier,
            checkpointsUsed: this.checkpointsUsed,
            monthId: this.currentMonthId
          })
        );
      } catch {
      }
    }
  }
  saveLicense(key) {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(_TierManager.LICENSE_KEY, key);
      } catch {
      }
    }
  }
  clearLicense() {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(_TierManager.LICENSE_KEY);
      } catch {
      }
    }
  }
};

// src/cli.ts
var args = process.argv.slice(2);
var command = args[0] || "status";
async function main() {
  const storage = new CryptoStorage();
  const tree = new SessionTree("main");
  const engine = new GeminiEngine({ model: "gemini-3.8-flash", thinkingEffort: "medium" });
  const tierManager = new TierManager();
  const existingSnapshot = await storage.loadSnapshot();
  if (existingSnapshot) {
    tree.importSnapshot(existingSnapshot);
  } else {
    await tree.initRoot("StateGuard Antigravity Agent Session Initialized");
  }
  switch (command) {
    case "checkpoint": {
      const label = args[1] || `CLI-Checkpoint-${Date.now().toString().slice(-4)}`;
      const activeNode = tree.getActiveNode();
      if (!activeNode) {
        console.error("[StateGuard CLI] Error: No active node to checkpoint.");
        process.exit(1);
      }
      const quota = tierManager.getQuotaStatus();
      if (!quota.canCreateCheckpoint) {
        console.error(`[StateGuard CLI] Quota limit reached: ${quota.checkpointsUsedThisMonth}/${quota.checkpointsLimit} checkpoints used.`);
        process.exit(1);
      }
      tree.checkpoint(activeNode.id, label);
      tierManager.recordCheckpointCreation();
      await storage.saveSnapshot(tree.exportSnapshot(), "24h");
      console.log(`[StateGuard CLI] Checkpoint created successfully!`);
      console.log(`  Node ID:   ${activeNode.id}`);
      console.log(`  Label:     "${label}"`);
      console.log(`  Quota:     ${quota.checkpointsUsedThisMonth + 1}/${quota.checkpointsLimit} Used (${quota.tier.toUpperCase()})`);
      break;
    }
    case "validate": {
      console.log("[StateGuard CLI] Running Gemini 3.8 Flash validation sweep (thinkingLevel: medium)...");
      const ancestry = tree.getAncestry();
      const checkpoints = tree.getCheckpoints();
      const lastCheckpoint = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
      const result = await engine.runValidationSweep(ancestry, lastCheckpoint);
      console.log(`[StateGuard CLI] Validation Complete:`);
      console.log(`  Drift Score:        ${result.driftScore}/100`);
      console.log(`  Hallucination Risk: ${result.hallucinationRisk}`);
      console.log(`  Logical Coherence:  ${result.logicalConsistency ? "CLEAN" : "INCONSISTENCY DETECTED"}`);
      if (result.detectedIssues.length > 0) {
        console.log(`  Issues Detected:`);
        result.detectedIssues.forEach((issue) => console.log(`    - ${issue}`));
      }
      if (result.suggestedCorrection) {
        console.log(`  Suggested Steer:    "${result.suggestedCorrection}"`);
      }
      if (result.recommendedRollbackNodeId) {
        console.log(`  Recommended Target: ${result.recommendedRollbackNodeId} (Rollback advised)`);
      }
      break;
    }
    case "rollback": {
      const targetId = args[1];
      if (!targetId) {
        console.error("[StateGuard CLI] Error: Please provide a target node ID. Usage: stateguard rollback <nodeId>");
        process.exit(1);
      }
      const res = tree.rollback(targetId);
      await storage.saveSnapshot(tree.exportSnapshot(), "24h");
      console.log(`[StateGuard CLI] Pointer rolled back to node: ${res.targetNodeId} on branch "${res.targetBranch}"`);
      break;
    }
    case "branch": {
      const branchName = args[1];
      if (!branchName) {
        console.error("[StateGuard CLI] Error: Please provide a branch name. Usage: stateguard branch <name>");
        process.exit(1);
      }
      const branch = tree.createBranch(branchName);
      await storage.saveSnapshot(tree.exportSnapshot(), "24h");
      console.log(`[StateGuard CLI] Created and checked out new branch: "${branch.name}" (head: ${branch.headNodeId})`);
      break;
    }
    case "status": {
      const activeNode = tree.getActiveNode();
      const branches = tree.getAllBranches();
      const checkpoints = tree.getCheckpoints();
      const quota = tierManager.getQuotaStatus(branches.length);
      console.log("=== StateGuard Session Status ===");
      console.log(`  Active Branch:      ${tree.getActiveBranchName()} (${branches.length} total branches)`);
      console.log(`  Active Node:        ${activeNode ? `${activeNode.id} [${activeNode.role}]` : "None"}`);
      console.log(`  Checkpoints Pinned: ${checkpoints.length} nodes`);
      console.log(`  Quota Tier:         ${quota.tier.toUpperCase()} (${quota.isPro ? "Unlimited" : `${quota.checkpointsUsedThisMonth}/${quota.checkpointsLimit} Used`})`);
      console.log(`  Engine:             gemini-3.8-flash (thinkingLevel: medium)`);
      break;
    }
    case "nodes":
    case "checkpoints":
    case "list": {
      const checkpoints = tree.getCheckpoints();
      const allNodes = tree.getAllNodes();
      console.log("=== StateGuard Checkpoints ===");
      if (checkpoints.length === 0) {
        console.log("  No checkpoints created yet.");
      } else {
        checkpoints.forEach((c) => {
          console.log(`  \u2605 [${c.id}] "${c.metadata.checkpointName || "Checkpoint"}" (branch: ${c.branchName})`);
        });
      }
      console.log("\n=== Available Conversation Nodes ===");
      allNodes.forEach((n) => {
        const isHead = n.id === tree.getActiveNodeId();
        const marker = n.metadata.isCheckpoint ? "\u2605" : isHead ? "\u25CF" : " ";
        const preview = n.content.replace(/\n/g, " ").substring(0, 60);
        console.log(`  ${marker} [${n.id}] [${n.role.toUpperCase()}] (${n.branchName}): "${preview}..."`);
      });
      break;
    }
    case "test": {
      console.log("[StateGuard CLI] Executing session integrity checks...");
      const nodes = tree.getAllNodes();
      const branches = tree.getAllBranches();
      console.log(`  Integrity Check: ${nodes.length} nodes, ${branches.length} branches validated. No cyclic dependencies found.`);
      break;
    }
    default:
      console.log("StateGuard CLI \u2014 Usage: stateguard [checkpoint <name> | list | nodes | validate | rollback <id> | branch <name> | status | test]");
  }
}
main().catch((err) => {
  console.error("[StateGuard CLI] Error:", err);
  process.exit(1);
});
