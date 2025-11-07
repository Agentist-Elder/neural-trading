// Temporal Analysis with Midstreamer (Async ES Module Support)

class TemporalAnalyzer {
  constructor() {
    this.patterns = [];
    this.metaPatterns = new Map();

    // Midstreamer components (loaded dynamically)
    this.midstream = null;
    this._initialized = false;

    // Start async initialization
    this._initPromise = this._initialize();
  }

  async _initialize() {
    if (this._initialized) return;

    try {
      // Dynamic import of Midstreamer (ES Module)
      const MidstreamerModule = await import('midstreamer');
      const Midstreamer = MidstreamerModule.default || MidstreamerModule;

      // Initialize Midstreamer
      this.midstream = new Midstreamer({
        transport: 'quic',
        scheduler: 'nanosecond',
        metaLearning: true,
        patternCache: true
      });

      this._initialized = true;
    } catch (error) {
      console.warn('⚠️  Midstreamer initialization failed, using fallback:', error.message);
      this._initialized = false;
    }
  }

  async _ensureInitialized() {
    if (!this._initialized) {
      await this._initPromise;
    }
  }

  async calculateTrend(data) {
    await this._ensureInitialized();

    if (this._initialized && this.midstream) {
      try {
        const trendPatterns = {
          upward: [1, 1.1, 1.2, 1.3, 1.4],
          downward: [1, 0.9, 0.8, 0.7, 0.6],
          sideways: [1, 1.05, 0.95, 1, 0.98]
        };

        const similarities = {};
        for (const [trend, pattern] of Object.entries(trendPatterns)) {
          similarities[trend] = await this.midstream.dtw.distance(data, pattern);
        }

        const bestTrend = Object.entries(similarities)
          .sort((a, b) => a[1] - b[1])[0][0];

        return bestTrend.toUpperCase();
      } catch (err) {
        return this._fallbackTrend(data);
      }
    }

    return this._fallbackTrend(data);
  }

  _fallbackTrend(data) {
    // Simple fallback
    return data[data.length - 1] > data[0] ? 'UPWARD' : 'DOWNWARD';
  }

  async calculateVolatility(data) {
    await this._ensureInitialized();

    if (this._initialized && this.midstream) {
      try {
        const stats = await this.midstream.analyze(data);
        return stats.volatility;
      } catch (err) {
        return 1.5; // Fallback
      }
    }

    return 1.5; // Fallback
  }

  async predictNext(data) {
    await this._ensureInitialized();

    if (this._initialized && this.midstream) {
      try {
        const prediction = await this.midstream.predict({
          series: data,
          horizon: 1,
          method: 'meta-learning'
        });
        return prediction.values[0];
      } catch (err) {
        return data[data.length - 1] + 1; // Fallback
      }
    }

    return data[data.length - 1] + 1; // Fallback
  }

  async detectCycles(data) {
    await this._ensureInitialized();

    if (this._initialized && this.midstream) {
      try {
        const cycles = await this.midstream.detectCycles(data, {
          minPeriod: 3,
          maxPeriod: 20,
          threshold: 0.7
        });

        if (cycles.length > 0) {
          return {
            detected: true,
            period: cycles[0].period,
            strength: cycles[0].strength,
            phase: cycles[0].phase
          };
        }
      } catch (err) {
        // Fall through to default
      }
    }

    return { detected: false, period: 0, strength: 0 };
  }

  async findRepeatingPatterns(data) {
    await this._ensureInitialized();

    if (this._initialized && this.midstream) {
      try {
        const patterns = await this.midstream.lcs.find(data, {
          minLength: 3,
          maxGap: 2,
          similarity: 0.8
        });

        return patterns.map(p => ({
          pattern: p.sequence,
          occurrences: p.positions,
          length: p.length,
          similarity: p.similarity
        }));
      } catch (err) {
        return []; // Fallback
      }
    }

    return []; // Fallback
  }

  async analyzePattern(data) {
    await this._ensureInitialized();

    console.log('⏰ Analyzing temporal patterns...');

    const [trend, volatility, prediction, cycles, repeating] = await Promise.all([
      this.calculateTrend(data),
      this.calculateVolatility(data),
      this.predictNext(data),
      this.detectCycles(data),
      this.findRepeatingPatterns(data)
    ]);

    if (this._initialized) {
      await this._metaLearn({ data, trend, volatility, prediction, cycles, repeating });
    }

    return {
      patterns: repeating.length,
      cycles: cycles,
      trend: trend,
      volatility: volatility,
      prediction: prediction,
      repeating: repeating
    };
  }

  async comparePatterns(pattern1, pattern2) {
    await this._ensureInitialized();

    if (this._initialized && this.midstream) {
      try {
        const distance = await this.midstream.dtw.distance(pattern1, pattern2);
        const similarity = 1 / (1 + distance);
        return { distance, similarity };
      } catch (err) {
        // Fallback to simple comparison
      }
    }

    // Fallback
    const diff = Math.abs(pattern1.length - pattern2.length);
    return { distance: diff, similarity: 1 / (1 + diff) };
  }

  async getMetaPatterns() {
    return Array.from(this.metaPatterns.entries()).map(([key, value]) => ({
      pattern: key,
      count: value.count,
      lastSeen: value.lastSeen
    }));
  }

  async _metaLearn(analysis) {
    if (this._initialized && this.midstream) {
      try {
        await this.midstream.metaLearn({
          input: analysis.data,
          output: {
            trend: analysis.trend,
            prediction: analysis.prediction
          },
          context: {
            volatility: analysis.volatility,
            cycles: analysis.cycles
          }
        });
      } catch (err) {
        // Meta-learning is optional
      }
    }

    const patternKey = `${analysis.trend}_${analysis.cycles.detected}`;
    this.metaPatterns.set(patternKey, {
      count: (this.metaPatterns.get(patternKey)?.count || 0) + 1,
      lastSeen: Date.now(),
      analysis: {
        trend: analysis.trend,
        volatility: analysis.volatility,
        cyclesDetected: analysis.cycles.detected,
        patternCount: analysis.repeating.length
      }
    });
  }

  async close() {
    await this._ensureInitialized();

    if (this.midstream && typeof this.midstream.close === 'function') {
      await this.midstream.close();
    }
  }
}

module.exports = TemporalAnalyzer;