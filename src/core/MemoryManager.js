// AgentDB Memory Manager - Production Implementation with Vector Database
// Using async initialization to handle ES Module imports

class MemoryManager {
  constructor() {
    // Initialization flag
    this._initialized = false;

    // AgentDB components (loaded dynamically)
    this.db = null;
    this.vectorSearch = null;
    this.reflexion = null;
    this.skillLibrary = null;
    this.causalGraph = null;

    // In-memory storage
    this.patterns = [];
    this.vectors = [];

    // Start async initialization (non-blocking)
    this._initPromise = this._initialize();
  }

  async _initialize() {
    if (this._initialized) return;

    try {
      // Dynamic import of AgentDB (ES Module)
      const agentdb = await import('agentdb');

      // Create SQLite database for persistence
      const dbPath = './data/agentdb/memory.db';
      this.db = agentdb.createDatabase(dbPath);

      // WASM-accelerated vector search
      this.vectorSearch = new agentdb.WASMVectorSearch(this.db);

      // Reflexion memory for self-critique
      this.reflexion = new agentdb.ReflexionMemory(this.db);

      // Skill library for learned patterns
      this.skillLibrary = new agentdb.SkillLibrary(this.db);

      // Causal memory graph for cause-effect reasoning
      this.causalGraph = new agentdb.CausalMemoryGraph(this.db);

      this._initialized = true;
    } catch (error) {
      // Graceful fallback if AgentDB not available
      console.warn('⚠️  AgentDB initialization failed, using in-memory fallback:', error.message);
      this._initialized = false;
    }
  }

  async _ensureInitialized() {
    // Wait for initialization to complete
    if (!this._initialized) {
      await this._initPromise;
    }
  }

  async storePattern(pattern, outcome) {
    await this._ensureInitialized();

    // Convert pattern to vector embedding
    const embedding = this._patternToVector(pattern);

    // Create entry with metadata
    const entry = {
      pattern,
      outcome,
      timestamp: Date.now(),
      success: outcome > 0,
      action: pattern.action,
      id: this.patterns.length
    };

    // Store vector and entry in memory
    this.vectors.push(Float32Array.from(embedding));
    this.patterns.push(entry);

    // Store in AgentDB features if available
    if (this._initialized && this.skillLibrary && outcome > 0) {
      try {
        const skillId = this.skillLibrary.createSkill(
          `${pattern.action}_${entry.id}`,
          `Learned skill for ${pattern.action}`,
          JSON.stringify({ inputs: pattern }),
          JSON.stringify({ pattern, outcome }),
          1
        );
        entry.skillId = skillId;
      } catch (err) {
        // Skill creation is optional
      }
    }

    // Store in reflexion memory if available
    if (this._initialized && this.reflexion) {
      try {
        this.reflexion.storeEpisode(
          `session_${entry.id}`,
          pattern.action,
          outcome > 0 ? 1.0 : 0.0,
          outcome > 0,
          `Action ${pattern.action} resulted in ${outcome}`,
          JSON.stringify(pattern),
          JSON.stringify(pattern),
          100,
          50
        );
      } catch (err) {
        // Reflexion storage is optional
      }
    }

    // Store causal relationship if available
    if (this._initialized && this.causalGraph && this.patterns.length > 1) {
      try {
        const prevPattern = this.patterns[this.patterns.length - 2];
        this.causalGraph.addCausalEdge(
          prevPattern.id,
          entry.id,
          outcome - prevPattern.outcome,
          0.8,
          1
        );
      } catch (err) {
        // Causal edge creation is optional
      }
    }

    return entry;
  }

  async findSimilar(currentPattern, k = 5) {
    await this._ensureInitialized();

    // Convert current pattern to vector
    const queryVector = Float32Array.from(this._patternToVector(currentPattern));

    if (this.vectors.length === 0) {
      return [];
    }

    // Use WASM-accelerated similarity if available, otherwise fallback
    let similarities;
    if (this._initialized && this.vectorSearch) {
      try {
        similarities = this.vectorSearch.batchSimilarity(queryVector, this.vectors);
      } catch (err) {
        // Fallback to manual cosine similarity
        similarities = this._manualCosineSimilarity(queryVector, this.vectors);
      }
    } else {
      // Fallback to manual cosine similarity
      similarities = this._manualCosineSimilarity(queryVector, this.vectors);
    }

    // Create results with similarity scores
    const results = this.patterns.map((entry, idx) => ({
      pattern: entry.pattern,
      outcome: entry.outcome,
      timestamp: entry.timestamp,
      success: entry.success,
      similarity: similarities[idx]
    }));

    // Filter for successful patterns and sort by similarity
    return results
      .filter(result => result.success)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  _manualCosineSimilarity(queryVector, vectors) {
    // Manual cosine similarity calculation (fallback)
    return vectors.map(vec => {
      let dotProduct = 0;
      let queryMagnitude = 0;
      let vecMagnitude = 0;

      for (let i = 0; i < queryVector.length; i++) {
        dotProduct += queryVector[i] * vec[i];
        queryMagnitude += queryVector[i] * queryVector[i];
        vecMagnitude += vec[i] * vec[i];
      }

      queryMagnitude = Math.sqrt(queryMagnitude);
      vecMagnitude = Math.sqrt(vecMagnitude);

      if (queryMagnitude === 0 || vecMagnitude === 0) return 0;
      return dotProduct / (queryMagnitude * vecMagnitude);
    });
  }

  async getSelfCritique(trajectory) {
    await this._ensureInitialized();

    const taskType = trajectory.length > 0 ? trajectory[0].action : 'unknown';

    if (this._initialized && this.reflexion) {
      try {
        const episodes = this.reflexion.retrieveRelevant(taskType, 10, 0.5);
        return {
          episodes: episodes || [],
          summary: `Retrieved ${(episodes || []).length} similar episodes for ${taskType}`
        };
      } catch (err) {
        return {
          episodes: [],
          summary: `No episodes found for ${taskType}`
        };
      }
    }

    return {
      episodes: [],
      summary: `No episodes found for ${taskType} (AgentDB not initialized)`
    };
  }

  async getSkills() {
    await this._ensureInitialized();

    if (this._initialized && this.skillLibrary) {
      try {
        const skills = this.skillLibrary.searchSkills('', 100, 0.0);
        return (skills || []).map(skill => ({
          name: skill.name,
          description: skill.description,
          usageCount: skill.usage_count || 0,
          successRate: skill.success_rate || 0
        }));
      } catch (err) {
        return [];
      }
    }

    return [];
  }

  async getCausalReasoning(action) {
    await this._ensureInitialized();

    const patterns = this.patterns.filter(p => p.action === action);
    if (patterns.length === 0) {
      return { action, causalPaths: [], insight: 'No patterns found for this action' };
    }

    if (this._initialized && this.causalGraph) {
      try {
        const lastPattern = patterns[patterns.length - 1];
        const effects = this.causalGraph.queryCausalEffects(lastPattern.id || 0);

        return {
          action,
          causalPaths: effects || [],
          insight: `Found ${(effects || []).length} causal relationships for action: ${action}`
        };
      } catch (err) {
        return {
          action,
          causalPaths: [],
          insight: 'Error querying causal effects'
        };
      }
    }

    return {
      action,
      causalPaths: [],
      insight: 'Causal reasoning not available (AgentDB not initialized)'
    };
  }

  _patternToVector(pattern) {
    // Convert trading pattern to 128-dimensional vector
    const vector = new Array(128).fill(0);

    // Encode key features
    vector[0] = pattern.price / 1000;           // Normalized price
    vector[1] = pattern.volume / 10000;         // Normalized volume
    vector[2] = pattern.momentum || 0;          // Momentum
    vector[3] = pattern.cash / 100000;          // Normalized cash
    vector[4] = pattern.positions || 0;         // Number of positions

    // Action encoding (one-hot)
    const actions = ['buy', 'sell', 'hold'];
    const actionIdx = actions.indexOf(pattern.action);
    if (actionIdx !== -1) vector[5 + actionIdx] = 1;

    return vector;
  }

  async close() {
    await this._ensureInitialized();

    if (this.db && typeof this.db.close === 'function') {
      this.db.close();
    }
  }

  getSkills() {
    // Backward compatible synchronous method for tests
    return Array.from(this.patterns)
      .filter(p => p.success)
      .map(p => ({
        name: p.pattern.action,
        pattern: p.pattern
      }));
  }
}

module.exports = MemoryManager;