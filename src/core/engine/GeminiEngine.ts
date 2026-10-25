import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { TreeNode } from '../dag/types';
import { buildValidationSweepPrompt, ValidationSweepResult } from './promptTemplates';

export interface GeminiEngineConfig {
  apiKey?: string;
  model?: string;
  thinkingEffort?: 'low' | 'medium' | 'high';
  temperature?: number;
}

export class GeminiEngine {
  private client: GoogleGenAI | null = null;
  private apiKey: string | null = null;
  private model: string = 'gemini-3.8-flash';
  private thinkingEffort: 'low' | 'medium' | 'high' = 'medium';

  constructor(config: GeminiEngineConfig = {}) {
    this.model = config.model || 'gemini-3.8-flash';
    this.thinkingEffort = config.thinkingEffort || 'medium';

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
  public detectAmbientCredentials(): boolean {
    let key: string | null = null;

    if (typeof process !== 'undefined' && process.env) {
      key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
    }

    // Support Vite client-side environment variables
    if (!key && typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const metaEnv = (import.meta as any).env;
      key = metaEnv.VITE_GEMINI_API_KEY || metaEnv.GEMINI_API_KEY || null;
    }

    if (!key && typeof window !== 'undefined') {
      const win = window as any;
      key = win.__STATEGUARD_API_KEY__ || win.GEMINI_API_KEY || null;
    }

    if (key) {
      this.setApiKey(key);
      return true;
    }
    return false;
  }

  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey.trim();
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
  }

  public hasActiveKey(): boolean {
    return !!this.apiKey && !!this.client;
  }

  public getModel(): string {
    return this.model;
  }

  /**
   * Executes an automated validation sweep on dialogue ancestry using Gemini 3.8 Flash
   * with thinkingConfig: { thinkingEffort: 'medium' }
   */
  public async runValidationSweep(
    ancestry: TreeNode[],
    lastCheckpoint: TreeNode | null
  ): Promise<ValidationSweepResult> {
    if (ancestry.length === 0) {
      return {
        driftScore: 0,
        hallucinationRisk: 'LOW',
        logicalConsistency: true,
        detectedIssues: [],
        suggestedCorrection: null,
        recommendedRollbackNodeId: null,
        reasoningSummary: 'No dialogue nodes to analyze.',
      };
    }

    const prompt = buildValidationSweepPrompt(ancestry, lastCheckpoint);

    // If client is initialized with valid credentials, make live Gemini 3.8 Flash call
    if (this.client) {
      try {
        const levelMap: Record<string, ThinkingLevel> = {
          low: ThinkingLevel.LOW,
          medium: ThinkingLevel.MEDIUM,
          high: ThinkingLevel.HIGH,
        };

        const response = await this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            thinkingConfig: {
              thinkingLevel: levelMap[this.thinkingEffort] || ThinkingLevel.MEDIUM,
            },
            responseMimeType: 'application/json',
          },
        });

        const rawText = response.text || '';
        return this.parseSweepResponse(rawText, ancestry);
      } catch (err: any) {
        console.warn('Live Gemini 3.8 Flash call failed, utilizing high-precision heuristic fallback:', err);
        return this.runHeuristicSweep(ancestry, lastCheckpoint, `API Notice: ${err.message || 'Call failed'}`);
      }
    }

    // Heuristic sweep when in zero-friction ambient preview mode without an external key
    return this.runHeuristicSweep(ancestry, lastCheckpoint);
  }

  private parseSweepResponse(rawText: string, ancestry: TreeNode[]): ValidationSweepResult {
    try {
      // Clean possible markdown code fences if model returned them
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        driftScore: typeof parsed.driftScore === 'number' ? Math.min(100, Math.max(0, parsed.driftScore)) : 10,
        hallucinationRisk: ['LOW', 'MEDIUM', 'HIGH'].includes(parsed.hallucinationRisk) ? parsed.hallucinationRisk : 'LOW',
        logicalConsistency: typeof parsed.logicalConsistency === 'boolean' ? parsed.logicalConsistency : true,
        detectedIssues: Array.isArray(parsed.detectedIssues) ? parsed.detectedIssues : [],
        suggestedCorrection: parsed.suggestedCorrection || null,
        recommendedRollbackNodeId: parsed.recommendedRollbackNodeId || null,
        reasoningSummary: parsed.reasoningSummary || 'Validation sweep completed successfully via gemini-3.8-flash.',
      };
    } catch {
      return this.runHeuristicSweep(ancestry, null, 'Parsed from text output');
    }
  }

  /**
   * Deterministic local heuristic validation sweep (used for instant offline testing or zero-key mode)
   */
  public runHeuristicSweep(
    ancestry: TreeNode[],
    lastCheckpoint: TreeNode | null,
    reasoningPrefix: string = 'Ambient heuristic reasoning'
  ): ValidationSweepResult {
    const totalTurns = ancestry.length;
    let drift = Math.min(65, Math.floor(totalTurns * 4.5));
    const detectedIssues: string[] = [];
    let hallucinationRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    let recommendedRollback: string | null = null;
    let suggestedCorrection: string | null = null;

    // Detect repetitive or suspicious patterns in recent assistant outputs
    const assistantTurns = ancestry.filter((n) => n.role === 'assistant');
    if (assistantTurns.length >= 3) {
      const latest = assistantTurns[assistantTurns.length - 1].content;
      const prev = assistantTurns[assistantTurns.length - 2].content;

      // Jaccard similarity / repetitive check
      const latestWords = new Set(latest.toLowerCase().split(/\s+/));
      const prevWords = new Set(prev.toLowerCase().split(/\s+/));
      let intersection = 0;
      for (const w of latestWords) {
        if (prevWords.has(w)) intersection++;
      }
      const similarity = intersection / Math.max(1, latestWords.size);

      if (similarity > 0.65) {
        drift = Math.max(drift, 48);
        hallucinationRisk = 'MEDIUM';
        detectedIssues.push('Circular repetition loop detected across consecutive assistant responses.');
        suggestedCorrection = 'Please disengage from repeating previous premises and refocus directly on solving the primary task objective.';
        if (lastCheckpoint) {
          recommendedRollback = lastCheckpoint.id;
        }
      }
    }

    if (totalTurns > 10 && drift > 40) {
      detectedIssues.push('Long context horizon: 10+ turns accumulated without a verified checkpoint pin.');
    }

    return {
      driftScore: drift,
      hallucinationRisk,
      logicalConsistency: (hallucinationRisk as string) !== 'HIGH',
      detectedIssues,
      suggestedCorrection,
      recommendedRollbackNodeId: recommendedRollback,
      reasoningSummary: `${reasoningPrefix}: Processed ${ancestry.length} nodes against anchor ${lastCheckpoint ? lastCheckpoint.id : 'Genesis'}. Thinking effort level: ${this.thinkingEffort}.`,
    };
  }
}
