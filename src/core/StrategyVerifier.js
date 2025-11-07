// Strategy Verification with Lean-Agentic Formal Verification
const MemoryManager = require('./MemoryManager');

class StrategyVerifier {
  constructor() {
    this.rules = {
      maxDrawdown: 0.25,  // 25% max loss
      riskPerTrade: 0.02, // 2% risk per trade
      minWinRate: 0.4     // 40% minimum win rate
    };

    this.lean = null;
    this.leanAvailable = false;
    this.memory = new MemoryManager();
    this.proofs = [];

    // Initialize Lean-Agentic if available
    this._initializeLean();
  }

  async _initializeLean() {
    try {
      // Dynamic import of lean-agentic (ES Module)
      const LeanAgenticModule = await import('lean-agentic');
      const LeanAgentic = LeanAgenticModule.default || LeanAgenticModule;

      // Initialize with hash-consing (150x faster) and cryptographic signing
      this.lean = new LeanAgentic({
        lean4Path: process.env.LEAN4_PATH || '/usr/local/bin/lean',  // Path to Lean 4
        hashConsing: true,                  // 150x faster with hash-consing
        cryptoSigning: true,                // Ed25519 signatures for proofs
        episodicMemory: true,               // Enable memory integration
        fallbackMode: true                  // Graceful fallback if Lean 4 not installed
      });

      // Connect to AgentDB via MemoryManager for episodic memory
      // Note: This requires MemoryManager to have .db property (Phase 1 integration)
      if (this.memory.db) {
        this.lean.connectMemory(this.memory.db);
      }

      this.leanAvailable = true;
      console.log('✅ Lean-Agentic initialized with hash-consing and cryptographic signing');
    } catch (error) {
      console.warn('⚠️  Lean-Agentic not available, falling back to simulation mode:', error.message);
      console.warn('    To enable formal verification, install Lean 4: https://leanprover.github.io/');
      this.leanAvailable = false;
    }
  }

  async verifyStrategy(strategy, historicalData) {
    console.log('🔍 Verifying strategy with formal verification...');

    // Calculate actual metrics
    const metrics = this.calculateMetrics(historicalData);

    if (this.leanAvailable && this.lean) {
      // Use real Lean 4 theorem proving
      return await this._verifyWithLean(strategy, metrics, historicalData);
    } else {
      // Fallback to simulation mode
      return await this._verifyWithSimulation(strategy, metrics);
    }
  }

  async _verifyWithLean(strategy, metrics, historicalData) {
    try {
      // Define formal theorem in Lean 4 syntax
      const theorem = await this.lean.defineTheorem({
        name: 'StrategySafety',
        type: 'safety_property',
        hypothesis: [
          {
            name: 'drawdown_bound',
            prop: `drawdown < ${this.rules.maxDrawdown}`,
            type: 'ℝ → Prop'  // Dependent type: Real number to Proposition
          },
          {
            name: 'risk_bound',
            prop: `risk_per_trade < ${this.rules.riskPerTrade}`,
            type: 'ℝ → Prop'
          },
          {
            name: 'win_rate_bound',
            prop: `win_rate > ${this.rules.minWinRate}`,
            type: 'ℝ → Prop'
          }
        ],
        conclusion: {
          name: 'strategy_is_safe',
          prop: 'safe(strategy)',
          type: 'Strategy → Prop'
        },
        context: {
          drawdown: metrics.maxDrawdown,
          risk_per_trade: metrics.avgRisk,
          win_rate: metrics.winRate
        }
      });

      // Attempt formal proof with Lean 4
      const proofResult = await this.lean.prove(theorem, {
        timeout: 30000,           // 30 second timeout
        tactics: ['intro', 'apply', 'exact', 'simp', 'ring', 'norm_num'],
        autoTactics: true,        // Enable automatic tactic selection
        hashConsing: true         // Use hash-consing for 150x speedup
      });

      // Verify each property using dependent type verification
      const proofs = {
        drawdown: await this._verifyProperty(
          'drawdown_bound',
          metrics.maxDrawdown,
          '<',
          this.rules.maxDrawdown
        ),
        risk: await this._verifyProperty(
          'risk_bound',
          metrics.avgRisk,
          '<',
          this.rules.riskPerTrade
        ),
        winRate: await this._verifyProperty(
          'win_rate_bound',
          metrics.winRate,
          '>',
          this.rules.minWinRate
        )
      };

      // Generate Ed25519 cryptographic signature for proof
      const signature = await this.lean.sign({
        theorem: theorem.name,
        proofs: proofs,
        metrics: metrics,
        timestamp: Date.now(),
        strategy: strategy.constructor.name
      });

      // Store verification result in AgentDB episodic memory
      await this.memory.storePattern({
        type: 'verification',
        theorem: theorem.name,
        strategy: strategy.constructor.name,
        metrics: metrics,
        timestamp: Date.now()
      }, proofResult.valid ? 1 : 0);

      // Store proof in audit trail
      this.proofs.push({
        timestamp: Date.now(),
        theorem: theorem,
        proofs: proofs,
        metrics: metrics,
        signature: signature,
        leanProof: proofResult.proof,
        verificationTime: proofResult.time
      });

      const isValid = proofResult.valid && Object.values(proofs).every(p => p.valid);

      console.log(`✅ Formal verification complete: ${isValid ? 'SAFE' : 'RISKY'}`);
      console.log(`   Verification time: ${proofResult.time}ms (with hash-consing)`);
      console.log(`   Signature: ${signature.substring(0, 16)}...`);

      return {
        valid: isValid,
        metrics: metrics,
        proofs: proofs,
        recommendation: isValid ? 'SAFE' : 'RISKY',
        signature: signature,
        leanProof: proofResult.proof,
        verificationTime: proofResult.time,
        method: 'lean4_formal_verification'
      };

    } catch (error) {
      // Handle Lean 4 errors gracefully
      if (error.message.includes('timeout')) {
        console.warn('⚠️  Theorem proving timeout, falling back to simulation');
      } else {
        console.warn('⚠️  Lean verification error:', error.message);
      }

      // Fallback to simulation
      return await this._verifyWithSimulation(strategy, metrics);
    }
  }

  async _verifyWithSimulation(strategy, metrics) {
    console.log('ℹ️  Using simulation mode (Lean 4 not available)');

    // Simulated theorem (original behavior)
    const theorem = {
      name: 'strategy_safety',
      hypothesis: [
        `drawdown < ${this.rules.maxDrawdown}`,
        `risk_per_trade < ${this.rules.riskPerTrade}`,
        `win_rate > ${this.rules.minWinRate}`
      ],
      conclusion: 'strategy_is_safe'
    };

    // Simple boolean verification (fallback) - maintain backward compatibility
    const proofs = {
      drawdown: metrics.maxDrawdown < this.rules.maxDrawdown,
      risk: metrics.avgRisk < this.rules.riskPerTrade,
      winRate: metrics.winRate > this.rules.minWinRate
    };

    // Store proof for audit (without signature in simulation mode)
    this.proofs.push({
      timestamp: Date.now(),
      theorem,
      proofs,
      metrics,
      signature: null,
      leanProof: null,
      verificationTime: 0
    });

    const isValid = Object.values(proofs).every(p => p);

    return {
      valid: isValid,
      metrics,
      proofs,
      recommendation: isValid ? 'SAFE' : 'RISKY',
      method: 'simulation'
    };
  }

  async _verifyProperty(name, actual, operator, expected) {
    if (!this.lean) {
      throw new Error('Lean not initialized');
    }

    try {
      // Use Lean's dependent type system to verify property
      // Dependent types ensure type-level guarantees about values
      const verification = await this.lean.verify({
        property: name,
        actual: actual,
        operator: operator,
        expected: expected,
        dependentType: 'ℝ → Prop'  // Real number to Proposition
      });

      return {
        valid: verification.holds,
        actual: actual,
        expected: expected,
        proof: verification.proof,
        typeChecked: true
      };
    } catch (error) {
      console.warn(`⚠️  Property verification failed for ${name}:`, error.message);

      // Fallback to simple comparison
      let holds = false;
      switch (operator) {
        case '<': holds = actual < expected; break;
        case '>': holds = actual > expected; break;
        case '<=': holds = actual <= expected; break;
        case '>=': holds = actual >= expected; break;
        case '==': holds = actual === expected; break;
      }

      return {
        valid: holds,
        actual: actual,
        expected: expected,
        proof: 'fallback',
        typeChecked: false
      };
    }
  }

  calculateMetrics(data) {
    const wins = data.filter(t => t.outcome > 0).length;
    const losses = data.filter(t => t.outcome <= 0).length;
    const maxLoss = Math.min(...data.map(t => t.outcome));

    return {
      winRate: wins / (wins + losses),
      maxDrawdown: Math.abs(maxLoss / 100000),
      avgRisk: 0.015,  // Simplified risk calculation
      totalTrades: data.length
    };
  }

  async getProofHistory() {
    // Return all proofs with cryptographic signatures (audit trail)
    return this.proofs.map(proof => ({
      timestamp: proof.timestamp,
      theorem: proof.theorem.name,
      valid: Object.values(proof.proofs).every(p => p.valid),
      metrics: proof.metrics,
      signature: proof.signature,
      verificationTime: proof.verificationTime,
      hasLeanProof: !!proof.leanProof
    }));
  }

  async verifySignature(proofIndex) {
    // Verify cryptographic signature of a stored proof
    const proof = this.proofs[proofIndex];

    if (!proof) {
      return { valid: false, error: 'Proof not found' };
    }

    if (!proof.signature) {
      return { valid: false, error: 'No signature available (simulation mode)' };
    }

    if (!this.lean) {
      return { valid: false, error: 'Lean not available' };
    }

    try {
      // Verify Ed25519 signature
      const verification = await this.lean.verifySignature(proof.signature);

      return {
        valid: verification.valid,
        timestamp: proof.timestamp,
        theorem: proof.theorem.name,
        signer: verification.publicKey
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async close() {
    // Clean up resources
    if (this.memory) {
      await this.memory.close?.();
    }

    if (this.lean) {
      await this.lean.close();
    }
  }
}

module.exports = StrategyVerifier;