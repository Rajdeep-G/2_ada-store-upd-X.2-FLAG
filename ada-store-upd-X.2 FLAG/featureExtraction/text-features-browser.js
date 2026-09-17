// Browser-friendly text feature extraction based on featureExtraction logic
// Depends on window.lexicons, window.stopwords_eng.eng, and window.liwc_dictionary

(function () {
  if (typeof window === "undefined") return;

  const lex = window.lexicons || {};
  const stopwordsList = (window.stopwords_eng && window.stopwords_eng.eng) || [];
  const stopWords = new Set(stopwordsList);

  function countOccurrences(sentence, wordToCount) {
    if (!sentence || !wordToCount) return 0;
    const target = String(wordToCount).toLowerCase();
    return String(sentence)
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w === target).length;
  }

  function calculateTopUnigrams(corpus, topN) {
    const text = corpus.join(" ").toLowerCase();
    const tokens = text.split(/\s+/);
    const unigramCounts = {};
    for (const token of tokens) {
      if (!token) continue;
      unigramCounts[token] = (unigramCounts[token] || 0) + 1;
    }
    const sortedUnigrams = Object.keys(unigramCounts).sort(
      (a, b) => unigramCounts[b] - unigramCounts[a]
    );
    const topUnigrams = sortedUnigrams.slice(0, topN);
    return [topUnigrams, unigramCounts];
  }

  function calculateTopBigrams(corpus, topN) {
    const text = corpus.join(" ").toLowerCase();
    const tokens = text.split(/\s+/);
    const bigramCounts = {};
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = tokens[i] + " " + tokens[i + 1];
      bigramCounts[bigram] = (bigramCounts[bigram] || 0) + 1;
    }
    const sortedBigrams = Object.keys(bigramCounts).sort(
      (a, b) => bigramCounts[b] - bigramCounts[a]
    );
    return sortedBigrams.slice(0, topN);
  }

  function calculateTopTrigrams(corpus, topN) {
    const text = corpus.join(" ").toLowerCase();
    const tokens = text.split(/\s+/);
    const trigramCounts = {};
    for (let i = 0; i < tokens.length - 2; i++) {
      const trigram = tokens[i] + " " + tokens[i + 1] + " " + tokens[i + 2];
      trigramCounts[trigram] = (trigramCounts[trigram] || 0) + 1;
    }
    const sortedTrigrams = Object.keys(trigramCounts).sort(
      (a, b) => trigramCounts[b] - trigramCounts[a]
    );
    return sortedTrigrams.slice(0, topN);
  }

  function extractSwearWordFeature(text) {
    const arr = [];
    let total = 0;
    const words = (lex.SWEAR_WORDS || []);
    for (const w of words) {
      const c = countOccurrences(text, w);
      arr.push(c ? 1 : 0);
      total += c;
    }
    arr.push(total);
    return arr;
  }

  function extractRegretWordFeature(text) {
    const categories = [
      lex.REGRET_WORDS_CURSING,
      lex.REGRET_WORDS_DRUG,
      lex.REGRET_WORDS_HEALTH,
      lex.REGRET_WORDS_RACE_RELIGION,
      lex.REGRET_WORDS_RELATIONSHIP,
      lex.REGRET_WORDS_SEX,
      lex.REGRET_WORDS_VIOLENCE,
      lex.REGRET_WORDS_WORK,
    ];
    const feat = [];
    for (const cat of categories) {
      let count = 0;
      for (const w of cat || []) {
        count += countOccurrences(text, w);
      }
      feat.push(count);
    }
    return feat;
  }

  function extractEmotionWordFeature(text) {
    const categories = [
      lex.EMOTION_WORDS_ANGER,
      lex.EMOTION_WORDS_ANTICIPATION,
      lex.EMOTION_WORDS_DISGUST,
      lex.EMOTION_WORDS_FEAR,
      lex.EMOTION_WORDS_JOY,
      lex.EMOTION_WORDS_SADNESS,
      lex.EMOTION_WORDS_SURPRISE,
      lex.EMOTION_WORDS_TRUST,
    ];
    const feat = [];
    for (const cat of categories) {
      let count = 0;
      for (const w of cat || []) {
        count += countOccurrences(text, w);
      }
      feat.push(count);
    }
    return feat;
  }

  function extractSentimentFeature(text) {
    const feat = [];
    let pos = 0;
    let neg = 0;
    let sentimental = 0;
    let subjective = 0;
    for (const w of lex.NRC_SENTIMENT_WORDS_POSITIVE || []) {
      pos += countOccurrences(text, w);
    }
    for (const w of lex.NRC_SENTIMENT_WORDS_NEGATIVE || []) {
      neg += countOccurrences(text, w);
    }
    for (const w of lex.MPQA_WORDS_SENTIMENTAL || []) {
      sentimental += countOccurrences(text, w);
    }
    for (const w of lex.MPQA_WORDS_SUBJECTIVE || []) {
      subjective += countOccurrences(text, w);
    }
    feat.push(pos, neg, sentimental, subjective);
    return feat;
  }

  function extractTopUnigramFeature(text, topUnigrams) {
    const feat = [];
    for (const u of topUnigrams) {
      feat.push(countOccurrences(text, u));
    }
    return feat;
  }

  function extractTopBigramFeature(text, topBigrams) {
    const feat = [];
    const tokens = String(text).toLowerCase().split(/\s+/);
    const bigrams = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.push(tokens[i] + " " + tokens[i + 1]);
    }
    for (const b of topBigrams) {
      let c = 0;
      for (const g of bigrams) if (g === b) c++;
      feat.push(c);
    }
    return feat;
  }

  function extractTopTrigramFeature(text, topTrigrams) {
    const feat = [];
    const tokens = String(text).toLowerCase().split(/\s+/);
    const trigrams = [];
    for (let i = 0; i < tokens.length - 2; i++) {
      trigrams.push(tokens[i] + " " + tokens[i + 1] + " " + tokens[i + 2]);
    }
    for (const t of topTrigrams) {
      let c = 0;
      for (const g of trigrams) if (g === t) c++;
      feat.push(c);
    }
    return feat;
  }

  function Preprocessor() {}
  Preprocessor.prototype.preprocess = function (text) {
    text = String(text || "");
    text = text.toLowerCase().replace(/\s+/g, " ").trim();
    text = text.replace(/\n\r/g, "");
    const words = text.split(/\s+/).filter((w) => w);
    return words.filter((w) => !stopWords.has(w));
  };

  function counter(list) {
    const counts = {};
    for (const item of list) {
      counts[item] = (counts[item] || 0) + 1;
    }
    return counts;
  }

  function LiwcTrieNode() {
    this.character = "*";
    this.children = [];
    this.categories = new Set();
  }

  function createTrie(liwcDict) {
    const T = new LiwcTrieNode();
    for (const [category, words] of Object.entries(liwcDict || {})) {
      for (const word of words) {
        insertWord(T, word, category);
      }
    }
    return T;
  }

  function insertWord(T, word, category) {
    if (!word) return;
    if (word[word.length - 1] !== "*") {
      word = word + "$.".charAt(0); // cheap way to append '$' without confusing tools
    } else {
      // keep '*'
    }
    let t = T;
    let i = 0;
    while (i < word.length) {
      let match = false;
      for (const child of t.children) {
        if (child.character === word[i]) {
          match = true;
          t = child;
          break;
        }
      }
      if (!match) break;
      i += 1;
    }
    while (i < word.length) {
      const child = new LiwcTrieNode();
      child.character = word[i];
      t.children.push(child);
      t = child;
      i += 1;
    }
    t.categories.add(category);
  }

  function getLiwcCategories(T, word) {
    const categories = new Set();
    let t = T;
    word = word + "$.".charAt(0);
    let i = 0;
    while (i < word.length) {
      let match = false;
      for (const child of t.children) {
        if (child.character === "*") {
          child.categories.forEach((cat) => categories.add(cat));
        } else if (child.character === word[i]) {
          match = true;
          t = child;
          break;
        }
      }
      if (!match) break;
      i += 1;
    }
    if (i === word.length) {
      t.categories.forEach((cat) => categories.add(cat));
    }
    return categories;
  }

  function extractLiwcFeature(text, liwcCat, T) {
    const f = [];
    const preprocessor = new Preprocessor();
    const processed = preprocessor.preprocess(text);
    const freq = counter(processed);
    for (const cat of liwcCat) {
      let catCount = 0;
      for (const key of Object.keys(freq)) {
        if (getLiwcCategories(T, key).has(cat)) {
          catCount += 1;
        }
      }
      f.push(catCount);
    }
    return f;
  }

  const liwcDict = window.liwc_dictionary || {};
  const liwcCategories = Object.keys(liwcDict);
  const liwcTrie = createTrie(liwcDict);

  window.computeTextFeaturesForTexts = function (texts) {
    const corpus = (texts || []).map((t) => String(t || ""));
    const TOP_UNIGRAMS_COUNT = 100;
    const TOP_BIGRAMS_COUNT = 100;
    const TOP_TRIGRAMS_COUNT = 100;

    const [TOP_UNIGRAMS] = calculateTopUnigrams(corpus, TOP_UNIGRAMS_COUNT);
    const TOP_BIGRAMS = calculateTopBigrams(corpus, TOP_BIGRAMS_COUNT);
    const TOP_TRIGRAMS = calculateTopTrigrams(corpus, TOP_TRIGRAMS_COUNT);

    const results = [];
    for (const sentence of corpus) {
      const lower = sentence.toLowerCase();
      const emb = {};
      emb.SWEAR_WORD_FEAT = extractSwearWordFeature(lower);
      emb.REGRET_WORD_FEAT = extractRegretWordFeature(lower);
      emb.EMOTION_WORD_FEAT = extractEmotionWordFeature(lower);
      emb.TOP_UNIGRAM_FEAT = extractTopUnigramFeature(lower, TOP_UNIGRAMS);
      emb.TOP_BIGRAM_FEAT = extractTopBigramFeature(lower, TOP_BIGRAMS);
      emb.TOP_TRIGRAM_FEAT = extractTopTrigramFeature(lower, TOP_TRIGRAMS);
      emb.LIWC_FEAT = extractLiwcFeature(lower, liwcCategories, liwcTrie);
      emb.SENTIMENT_FEAT = extractSentimentFeature(lower);
      // Placeholder for Universal Sentence Encoder embedding: keep length consistent with training (300 dims)
      emb.SENT_2_VEC_FEAT = new Array(300).fill(0);
      results.push(emb);
    }
    return results;
  };

  // Build the fixed-length numeric vector expected by the XGBoost model
  // from a single text-features embedding object produced above.
  const TEXT_FEATURE_SPECS = [
    ["TOP_UNIGRAM_FEAT", 100],
    ["TOP_BIGRAM_FEAT", 100],
    ["TOP_TRIGRAM_FEAT", 100],
    ["SWEAR_WORD_FEAT", 60],
    ["SENTIMENT_FEAT", 4],
    ["EMOTION_WORD_FEAT", 8],
    ["REGRET_WORD_FEAT", 8],
    ["SENT_2_VEC_FEAT", 300],
  ];

  window.buildFeatureVectorFromTextFeatures = function (tf) {
    const vec = [];
    tf = tf || {};

    // SOUND_FEATURE_ORDER zeros: SOUNDNET(1024), MFCC(26), Scontrast(8), Tempo(1)
    vec.push(...new Array(1024).fill(0));
    vec.push(...new Array(26).fill(0));
    vec.push(...new Array(8).fill(0));
    vec.push(...new Array(1).fill(0));

    // Text block used by this model does NOT include LIWC for inference.
    for (const [key, expectedLen] of TEXT_FEATURE_SPECS) {
      const src = Array.isArray(tf[key]) ? tf[key] : [];
      const out = new Array(expectedLen).fill(0);
      for (let i = 0; i < Math.min(src.length, expectedLen); i++) {
        const v = Number(src[i]);
        out[i] = Number.isFinite(v) ? v : 0;
      }
      vec.push(...out);
    }

    // USER_FEATURE_ORDER zeros: age(3), gender(2), major(2), duration(3), account(3), frequency(3)
    vec.push(...new Array(3).fill(0)); // age
    vec.push(...new Array(2).fill(0)); // gender
    vec.push(...new Array(2).fill(0)); // major
    vec.push(...new Array(3).fill(0)); // duration
    vec.push(...new Array(3).fill(0)); // account
    vec.push(...new Array(3).fill(0)); // frequency

    // Guardrail: ensure strict model input width.
    if (vec.length !== 1755) {
      console.warn(`[FeatureVector] Expected 1755 features, got ${vec.length}. Auto-fixing.`);
      if (vec.length > 1755) return vec.slice(0, 1755);
      return vec.concat(new Array(1755 - vec.length).fill(0));
    }

    return vec;
  };
})();