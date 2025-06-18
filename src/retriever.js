import { search } from "fast-fuzzy";

export class Retriever {
  constructor(config, sessionManager) {
    this.config = config;
    this.sessionManager = sessionManager;
    this.topK = config.ragTopK || 3;
    this.strategy = config.ragRetrievalStrategy || "keyword";

    this.strategies = {
      keyword: this.keywordRetrieve.bind(this),
      embedding: this.embeddingRetrieve.bind(this),
    };
  }

  async retrieve(sessionId, query) {
    if (!query) return [];

    const strategyFn = this.strategies[this.strategy];
    if (!strategyFn) return [];

    return await strategyFn(sessionId, query);
  }

  async keywordRetrieve(sessionId, query) {
    const entries = await this.sessionManager.readEntries(sessionId);
    if (!entries.length) return [];

    // Flatten entries to strings for searching
    const texts = entries.map((e) => JSON.stringify(e));

    const matches = search(query, texts, {
      threshold: 0.3,
    });

    return matches.slice(0, this.topK);
  }

  async embeddingRetrieve(_sessionId, _query) {
    // Placeholder for vector-based retrieval in future
    return [];
  }
}
