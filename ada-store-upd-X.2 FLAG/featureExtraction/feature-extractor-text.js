"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFeatures = void 0;
var lexicons_1 = require("./lexicons");
var lexicons_2 = require("./lexicons");
//$% imported following libraries
var fs = require("fs");
var stopwords_eng_1 = require("./stopwords_eng");
//$%
var TOP_UNIGRAMS_COUNT = 100;
var TOP_BIGRAMS_COUNT = 100;
//$% trigram 
var TOP_TRIGRAMS_COUNT = 100;
//$% trigram

//$% LIWC stuff
// Loading LIWC dictionary from JSON file
var liwcDictJSON = fs.readFileSync('LIWC_DIC.json', 'utf8');
var liwcDict = JSON.parse(liwcDictJSON);
// Creating LIWC trie
var T = createTrie(liwcDict);
//$% LIWC stuff
function extractTextFeatures(text) {
    var text_features = [];
    //$% now calculateTopUnigrams returns two values [string[], Record<string, number>], earlier it was only string[]
    var result_calculateTopUnigrams = calculateTopUnigrams(text, TOP_UNIGRAMS_COUNT);
    var TOP_UNIGRAMS = result_calculateTopUnigrams[0];
    var unigramCounts = result_calculateTopUnigrams[1];
    //$%
    var TOP_BIGRAMS = calculateTopBigrams(text, TOP_BIGRAMS_COUNT);
    //$% trigram
    var TOP_TRIGRAMS = calculateTopTrigrams(text, TOP_TRIGRAMS_COUNT);
    //$% trigram
    //$% LIWC stuff
    var liwcCat = [];
    for (var uni in Object.keys(unigramCounts)) {
        for (var cat in Array.from(getLiwcCategories(T, uni))) {
            if (!liwcCat.includes(cat)) {
                liwcCat.push(cat);
            }
        }
    }
    //$%
    for (var _i = 0, text_1 = text; _i < text_1.length; _i++) {
        var sentence = text_1[_i];
        var text_embedding = {};
        var lowercaseSentence = sentence.toLowerCase();
        text_embedding["SWEAR_WORD_FEAT"] = extractSwearWordFeature(lowercaseSentence);
        text_embedding["REGRET_WORD_FEAT"] = extractRegretWordFeature(lowercaseSentence);
        text_embedding["EMOTION_WORD_FEAT"] = extractEmotionWordFeature(lowercaseSentence);
        text_embedding["TOP_UNIGRAM_FEAT"] = extractTopUnigramFeature(lowercaseSentence, TOP_UNIGRAMS);
        text_embedding["TOP_BIGRAM_FEAT"] = extractTopBigramFeature(lowercaseSentence, TOP_BIGRAMS);
        //$% trigram
        text_embedding["TOP_TRIGRAM_FEAT"] = extractTopTrigramFeature(lowercaseSentence, TOP_TRIGRAMS);
        //$% trigram
        //$% LIWC
        text_embedding["LIWC_FEAT"] = extractLiwcFeature(lowercaseSentence, liwcCat, T);
        //$% LIWC
        text_features.push(text_embedding);
    }
    return text_features;
}
exports.extractTextFeatures = extractTextFeatures;
function extractEmotionWordFeature(text) {
    var emotionWordFeature = [];
    var emotionWordCount = 0;
    // EMOTION_WORDS_ANGER
    for (var _i = 0, EMOTION_WORDS_ANGER_1 = lexicons_2.EMOTION_WORDS_ANGER; _i < EMOTION_WORDS_ANGER_1.length; _i++) {
        var emotionWord = EMOTION_WORDS_ANGER_1[_i];
        var cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);
    // EMOTION_WORDS_ANTICIPATION
    emotionWordCount = 0;
    for (var _a = 0, EMOTION_WORDS_ANTICIPATION_1 = lexicons_2.EMOTION_WORDS_ANTICIPATION; _a < EMOTION_WORDS_ANTICIPATION_1.length; _a++) {
        var emotionWord = EMOTION_WORDS_ANTICIPATION_1[_a];
        var cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);
    // EMOTION_WORDS_DISGUST
    emotionWordCount = 0;
    for (var _b = 0, EMOTION_WORDS_DISGUST_1 = lexicons_2.EMOTION_WORDS_DISGUST; _b < EMOTION_WORDS_DISGUST_1.length; _b++) {
        var emotionWord = EMOTION_WORDS_DISGUST_1[_b];
        var cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);
    // EMOTION_WORDS_FEAR
    emotionWordCount = 0;
    for (var _c = 0, EMOTION_WORDS_FEAR_1 = lexicons_2.EMOTION_WORDS_FEAR; _c < EMOTION_WORDS_FEAR_1.length; _c++) {
        var emotionWord = EMOTION_WORDS_FEAR_1[_c];
        var cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);
    // EMOTION_WORDS_JOY
    emotionWordCount = 0;
    for (var _d = 0, EMOTION_WORDS_JOY_1 = lexicons_2.EMOTION_WORDS_JOY; _d < EMOTION_WORDS_JOY_1.length; _d++) {
        var emotionWord = EMOTION_WORDS_JOY_1[_d];
        var cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);
    // EMOTION_WORDS_SADNESS
    emotionWordCount = 0;
    for (var _e = 0, EMOTION_WORDS_SADNESS_1 = lexicons_2.EMOTION_WORDS_SADNESS; _e < EMOTION_WORDS_SADNESS_1.length; _e++) {
        var emotionWord = EMOTION_WORDS_SADNESS_1[_e];
        var cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);
    // EMOTION_WORDS_SURPRISE
    emotionWordCount = 0;
    for (var _f = 0, EMOTION_WORDS_SURPRISE_1 = lexicons_2.EMOTION_WORDS_SURPRISE; _f < EMOTION_WORDS_SURPRISE_1.length; _f++) {
        var emotionWord = EMOTION_WORDS_SURPRISE_1[_f];
        var cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);
    // EMOTION_WORDS_TRUST
    emotionWordCount = 0;
    for (var _g = 0, EMOTION_WORDS_TRUST_1 = lexicons_2.EMOTION_WORDS_TRUST; _g < EMOTION_WORDS_TRUST_1.length; _g++) {
        var emotionWord = EMOTION_WORDS_TRUST_1[_g];
        var cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);
    return emotionWordFeature;
}
function extractRegretWordFeature(text) {
    var regretWordFeature = [];
    var regretWordCount = 0;
    // REGRET_WORDS_CURSING
    for (var _i = 0, REGRET_WORDS_CURSING_1 = lexicons_2.REGRET_WORDS_CURSING; _i < REGRET_WORDS_CURSING_1.length; _i++) {
        var regretWord = REGRET_WORDS_CURSING_1[_i];
        var cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);
    // REGRET_WORDS_DRUG
    regretWordCount = 0;
    for (var _a = 0, REGRET_WORDS_DRUG_1 = lexicons_2.REGRET_WORDS_DRUG; _a < REGRET_WORDS_DRUG_1.length; _a++) {
        var regretWord = REGRET_WORDS_DRUG_1[_a];
        var cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);
    // REGRET_WORDS_HEALTH
    regretWordCount = 0;
    for (var _b = 0, REGRET_WORDS_HEALTH_1 = lexicons_2.REGRET_WORDS_HEALTH; _b < REGRET_WORDS_HEALTH_1.length; _b++) {
        var regretWord = REGRET_WORDS_HEALTH_1[_b];
        var cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);
    // REGRET_WORDS_RACE_RELIGION
    regretWordCount = 0;
    for (var _c = 0, REGRET_WORDS_RACE_RELIGION_1 = lexicons_2.REGRET_WORDS_RACE_RELIGION; _c < REGRET_WORDS_RACE_RELIGION_1.length; _c++) {
        var regretWord = REGRET_WORDS_RACE_RELIGION_1[_c];
        var cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);
    // REGRET_WORDS_RELATIONSHIP
    regretWordCount = 0;
    for (var _d = 0, REGRET_WORDS_RELATIONSHIP_1 = lexicons_2.REGRET_WORDS_RELATIONSHIP; _d < REGRET_WORDS_RELATIONSHIP_1.length; _d++) {
        var regretWord = REGRET_WORDS_RELATIONSHIP_1[_d];
        var cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);
    // REGRET_WORDS_SEX
    regretWordCount = 0;
    for (var _e = 0, REGRET_WORDS_SEX_1 = lexicons_2.REGRET_WORDS_SEX; _e < REGRET_WORDS_SEX_1.length; _e++) {
        var regretWord = REGRET_WORDS_SEX_1[_e];
        var cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);
    // REGRET_WORDS_VIOLENCE
    regretWordCount = 0;
    for (var _f = 0, REGRET_WORDS_VIOLENCE_1 = lexicons_2.REGRET_WORDS_VIOLENCE; _f < REGRET_WORDS_VIOLENCE_1.length; _f++) {
        var regretWord = REGRET_WORDS_VIOLENCE_1[_f];
        var cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);
    // REGRET_WORDS_WORK
    regretWordCount = 0;
    for (var _g = 0, REGRET_WORDS_WORK_1 = lexicons_2.REGRET_WORDS_WORK; _g < REGRET_WORDS_WORK_1.length; _g++) {
        var regretWord = REGRET_WORDS_WORK_1[_g];
        var cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);
    return regretWordFeature;
}
function extractSwearWordFeature(text) {
    var swearWordFeature = [];
    var swearWordCount = 0;
    for (var _i = 0, SWEAR_WORDS_1 = lexicons_1.SWEAR_WORDS; _i < SWEAR_WORDS_1.length; _i++) {
        var swearWord = SWEAR_WORDS_1[_i];
        var cnt = countOccurrences(text, swearWord);
        if (cnt) {
            swearWordFeature.push(1);
            swearWordCount += cnt;
        }
        else {
            swearWordFeature.push(0);
        }
    }
    swearWordFeature.push(swearWordCount);
    return swearWordFeature;
}
function extractTopUnigramFeature(text, topUnigrams) {
    var topUnigramFeature = [];
    for (var _i = 0, topUnigrams_1 = topUnigrams; _i < topUnigrams_1.length; _i++) {
        var unigram = topUnigrams_1[_i];
        var cnt = countOccurrences(text, unigram);
        topUnigramFeature.push(cnt);
    }
    return topUnigramFeature;
}
function extractTopBigramFeature(text, topBigrams) {
    var topBigramFeature = [];
    var bigrams = [];
    var tokens = text.split(/\s+/); //.map((token) => token.replace(/[.,!?;'"-]/g, ''));
    for (var i = 0; i < tokens.length - 1; i++) {
        var bigram = tokens[i] + ' ' + tokens[i + 1];
        bigrams.push(bigram);
    }
    var _loop_1 = function (topBigram) {
        var cnt = bigrams.filter(function (bigram) { return bigram === topBigram; }).length;
        topBigramFeature.push(cnt);
    };
    for (var _i = 0, topBigrams_1 = topBigrams; _i < topBigrams_1.length; _i++) {
        var topBigram = topBigrams_1[_i];
        _loop_1(topBigram);
    }
    return topBigramFeature;
}
//$% trigram
function extractTopTrigramFeature(text, topTrigrams) {
    var topTrigramFeature = [];
    var trigrams = [];
    var tokens = text.split(/\s+/);
    for (var i = 0; i < tokens.length - 2; i++) {
        var trigram = tokens[i] + ' ' + tokens[i + 1] + ' ' + tokens[i + 2];
        trigrams.push(trigram);
    }
    var _loop_2 = function (topTrigram) {
        var cnt = trigrams.filter(function (trigram) { return trigram === topTrigram; }).length;
        topTrigramFeature.push(cnt);
    };
    for (var _i = 0, topTrigrams_1 = topTrigrams; _i < topTrigrams_1.length; _i++) {
        var topTrigram = topTrigrams_1[_i];
        _loop_2(topTrigram);
    }
    return topTrigramFeature;
}
//$% trigram
function countOccurrences(sentence, wordToCount) {
    return sentence.split(/\s+/).filter(function (word) { return word === wordToCount; }).length;
}
function calculateTopUnigrams(corpus, topN) {
    var text = corpus.join(" ").toLowerCase();
    var tokens = text.split(/\s+/); //.map((token) => token.replace(/[.,!?;'"-]/g, ''));
    var unigramCounts = {};
    for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
        var token = tokens_1[_i];
        if (token) {
            unigramCounts[token] = (unigramCounts[token] || 0) + 1;
        }
    }
    var sortedUnigrams = Object.keys(unigramCounts).sort(function (a, b) { return unigramCounts[b] - unigramCounts[a]; });
    var topUnigrams = sortedUnigrams.slice(0, topN);
    //$% now calculateTopUnigrams returns two values [string[], Record<string, number>], earlier it was only string[]
    return [topUnigrams, unigramCounts];
    //$%
}
function calculateTopBigrams(corpus, topN) {
    var text = corpus.join(" ").toLowerCase();
    var tokens = text.split(/\s+/); //.map((token) => token.replace(/[.,!?;'"-]/g, ''));
    var bigramCounts = {};
    for (var i = 0; i < tokens.length - 1; i++) {
        var bigram = tokens[i] + ' ' + tokens[i + 1];
        bigramCounts[bigram] = (bigramCounts[bigram] || 0) + 1;
    }
    var sortedBigrams = Object.keys(bigramCounts).sort(function (a, b) { return bigramCounts[b] - bigramCounts[a]; });
    var topBigrams = sortedBigrams.slice(0, topN);
    return topBigrams;
}
//$% trigram
function calculateTopTrigrams(corpus, topN) {
    var text = corpus.join(" ").toLowerCase();
    var tokens = text.split(/\s+/);
    var trigramCounts = {};
    for (var i = 0; i < tokens.length - 2; i++) {
        var trigram = tokens[i] + ' ' + tokens[i + 1] + ' ' + tokens[i + 2];
        trigramCounts[trigram] = (trigramCounts[trigram] || 0) + 1;
    }
    var sortedTrigrams = Object.keys(trigramCounts).sort(function (a, b) { return trigramCounts[b] - trigramCounts[a]; });
    var topTrigrams = sortedTrigrams.slice(0, topN);
    return topTrigrams;
}
// //$% trigram
// // $% Sentiment
// import * as fs from 'fs';
// interface LexiconEntry {
//     subj: number;
//     sent: number;
// }
// const lexicon: { [key: string]: LexiconEntry } = {};
// const lexiconCsv: string = fs.readFileSync('./MPQA/lexicon_easy.csv', 'utf8');
// const lexiconData: (string | number)[][] = lexiconCsv.split('\n').map(row => row.split(','));
// for (const row of lexiconData) {
//     row[1] = parseInt(row[1] as string);
//     row[2] = parseInt(row[2] as string);
//     lexicon[row[0] as string] = {
//         subj: row[1] as number,
//         sent: row[2] as number,
//     };
// }
// interface NRCEntry {
//     Positive: number;
//     Negative: number;
//     Anger: number;
//     Anticipation: number;
//     Disgust: number;
//     Fear: number;
//     Joy: number;
//     Sadness: number;
//     Surprise: number;
//     Trust: number;
// }
// const lexicon_NRC: { [key: string]: NRCEntry } = {};
// const NRC_EMOCsv: string = fs.readFileSync('NRC_EMO.csv', 'utf8');
// const NRC_EMOData: (string | number)[][] = NRC_EMOCsv.split('\n').map(row => row.split(','));
// for (const row of NRC_EMOData) {
//     row[1] = parseInt(row[1] as string);
//     row[2] = parseInt(row[2] as string);
//     row[3] = parseInt(row[3] as string);
//     row[4] = parseInt(row[4] as string);
//     row[5] = parseInt(row[5] as string);
//     row[6] = parseInt(row[6] as string);
//     row[7] = parseInt(row[7] as string);
//     row[8] = parseInt(row[8] as string);
//     row[9] = parseInt(row[9] as string);
//     row[10] = parseInt(row[10] as string);
//     lexicon_NRC[row[0] as string] = {
//         Positive: row[1] as number,
//         Negative: row[2] as number,
//         Anger: row[3] as number,
//         Anticipation: row[4] as number,
//         Disgust: row[5] as number,
//         Fear: row[6] as number,
//         Joy: row[7] as number,
//         Sadness: row[8] as number,
//         Surprise: row[9] as number,
//         Trust: row[10] as number,
//     };
// }
// import * as natural from 'natural';
// // Read the contents of the local 'english' stopwords file
// const englishStopwordsPath = './stopwords/english';
// const englishStopwordsContent = fs.readFileSync(englishStopwordsPath, 'utf8');
// // Create a Set from the stopwords content
// const stopWords = new Set(englishStopwordsContent.split('\n'));
// // Define a tokenizer using RegexpTokenizer
// const tokenizer = new natural.RegexpTokenizer({ pattern: /\w+/ });
// function decontracted(phrase: string): string {
//     phrase = phrase.replace(/won't/g, 'will not');
//     phrase = phrase.replace(/can't/g, 'can not');
//     phrase = phrase.replace(/n't/g, ' not');
//     phrase = phrase.replace(/'re/g, ' are');
//     phrase = phrase.replace(/'s/g, ' is');
//     phrase = phrase.replace(/'d/g, ' would');
//     phrase = phrase.replace(/'ll/g, ' will');
//     phrase = phrase.replace(/'t/g, ' not');
//     phrase = phrase.replace(/'ve/g, ' have');
//     phrase = phrase.replace(/'m/g, ' am');
//     return phrase;
// }
// function preprocess(text: string): string[] {
//     text = decontracted(text);
//     text = text.toLowerCase();
//     text = text.replace(/[\n\r]+/g, '');
//     text = text.replace(/\s{2,}/g, ' ');
//     text = text.trim();
//     const words: string[] = tokenizer.tokenize(text) as string[];
//     const tokens: string[] = words.filter(word => !stopWords.has(word));
//     return tokens;
// }
// function sentiment_features(text: string): number[] {
//     const feat: number[] = [];
//     let c_p = 0;
//     let c_n = 0;
//     let c_pnr = 0;
//     let c_nnr = 0;
//     const tokens: string[] = preprocess(text);
//     for (const token of tokens) {
//         if (lexicon_NRC[token]) {
//             if (lexicon_NRC[token]['Positive'] === 1) {
//                 c_pnr += 1;
//             } else if (lexicon_NRC[token]['Negative'] === 1) {
//                 c_nnr += 1;
//             }
//         }
//     }
//     feat.push(c_pnr);
//     feat.push(c_nnr);
//     // for (const token of tokens) {
//     //     if (lexicon[token]) {
//     //         const senti = lexicon[token]['sent'];
//     //         if (senti >= 0) {
//     //             c_p += 1;
//     //         } else {
//     //             c_n += 1;
//     //         }
//     //     }
//     // }
//     // feat.push(c_p);
//     // feat.push(c_n);
//     return feat;
// }
// function emotion_features(text: string): number[] {
//     const f_emo: number[] = [];
//     let Anger = 0;
//     let Anticipation = 0;
//     let Disgust = 0;
//     let FeabuildFeatureVectorFromTextFeaturesr = 0;
//     let Joy = 0;
//     let Sadness = 0;
//     let Surprise = 0;
//     let Trust = 0;
//     const tokens: string[] = preprocess(text);
//     for (const token of tokens) {
//         if (lexicon_NRC[token]) {
//             if (lexicon_NRC[token]['Anger'] === 1) {
//                 Anger += 1;
//             }
//             if (lexicon_NRC[token]['Anticipation'] === 1) {
//                 Anticipation += 1;
//             }
//             if (lexicon_NRC[token]['Disgust'] === 1) {
//                 Disgust += 1;
//             }
//             if (lexicon_NRC[token]['Fear'] === 1) {
//                 Fear += 1;
//             }
//             if (lexicon_NRC[token]['Joy'] === 1) {
//                 Joy += 1;
//             }
//             if (lexicon_NRC[token]['Sadness'] === 1) {
//                 Sadness += 1;
//             }
//             if (lexicon_NRC[token]['Surprise'] === 1) {
//                 Surprise += 1;
//             }
//             if (lexicon_NRC[token]['Trust'] === 1) {
//                 Trust += 1;
//             }
//         }
//     }
//     f_emo.push(Anger);
//     f_emo.push(Anticipation);
//     f_emo.push(Disgust);
//     f_emo.push(Fear);
//     f_emo.push(Joy);
//     f_emo.push(Sadness);
//     f_emo.push(Surprise);
//     f_emo.push(Trust);
//     return f_emo;
// }
// const text = "Life is full of ups and downs, but I always try to stay positive and find joy in the little things.";
// const sentFeatures = sentiment_features(text);
// const emoFeatures = emotion_features(text);
// console.log("Sentiment Features:", sentFeatures);
// console.log("Emotion Features:", emoFeatures);
// //$% Sentiment
//%$ LIWC related classes and functions
var Preprocessor = /** @class */ (function () {
    function Preprocessor() {
        this.stopWords = new Set(stopwords_eng_1.eng);
    }
    Preprocessor.prototype.decontracted = function (phrase) {
        phrase = phrase.replace(/won't/g, "will not");
        phrase = phrase.replace(/can't/g, "can not");
        phrase = phrase.replace(/n't/g, " not");
        phrase = phrase.replace(/'re/g, " are");
        phrase = phrase.replace(/'s/g, " is");
        phrase = phrase.replace(/'d/g, " would");
        phrase = phrase.replace(/'ll/g, " will");
        phrase = phrase.replace(/'t/g, " not");
        phrase = phrase.replace(/'ve/g, " have");
        phrase = phrase.replace(/'m/g, " am");
        return phrase;
    };
    Preprocessor.prototype.preprocess = function (text) {
        var _this = this;
        text = this.decontracted(text);
        text = text.toLowerCase().replace(/\s+/g, ' ').trim(); // Replace consecutive whitespace with a single space and trim
        text = text.replace(/\n\r/g, ''); // Remove newline and carriage return
        var words = text.split(/\w+/).filter(function (word) { return word !== ''; }); // Split based on non-word characters
        var tokens = words.filter(function (word) { return !_this.stopWords.has(word); });
        return tokens;
    };
    return Preprocessor;
}());
var LiwcTrieNode = /** @class */ (function () {
    function LiwcTrieNode() {
        this.character = '*';
        this.children = [];
        this.categories = new Set();
    }
    return LiwcTrieNode;
}());
function counter(inputList) {
    var counts = {};
    for (var _i = 0, inputList_1 = inputList; _i < inputList_1.length; _i++) {
        var item = inputList_1[_i];
        counts[item] = (counts[item] || 0) + 1;
    }
    return counts;
}
function createTrie(liwcDict) {
    var T = new LiwcTrieNode();
    for (var _i = 0, _a = Object.entries(liwcDict); _i < _a.length; _i++) {
        var _b = _a[_i], category = _b[0], words = _b[1];
        for (var _c = 0, words_1 = words; _c < words_1.length; _c++) {
            var word = words_1[_c];
            insertWord(T, word, category);
        }
    }
    return T;
}
function insertWord(T, word, category) {
    if (word[word.length - 1] !== '*') {
        word = word + '$';
    }
    var t = T;
    var i = 0;
    while (i < word.length) {
        var match = false;
        for (var _i = 0, _a = t.children; _i < _a.length; _i++) {
            var child = _a[_i];
            if (child.character === word[i]) {
                match = true;
                t = child;
                break;
            }
        }
        if (!match) {
            break;
        }
        else {
            i += 1;
        }
    }
    while (i < word.length) {
        var child = new LiwcTrieNode();
        child.character = word[i];
        t.children.push(child);
        t = child;
        i += 1;
    }
    t.categories.add(category);
}
function getLiwcCategories(T, word) {
    var t = T;
    var categories = new Set();
    var i = 0;
    word = word + '$';
    while (i < word.length) {
        var match = false;
        for (var _i = 0, _a = t.children; _i < _a.length; _i++) {
            var child = _a[_i];
            if (child.character === '*') {
                child.categories.forEach(function (cat) { return categories.add(cat); });
            }
            else if (child.character === word[i]) {
                match = true;
                t = child;
                break;
            }
        }
        if (!match) {
            break;
        }
        else {
            i += 1;
        }
    }
    if (i === word.length) {
        t.categories.forEach(function (cat) { return categories.add(cat); });
    }
    return categories;
}
function extractLiwcFeature(text, liwcCat, T) {
    var f = [];
    var preprocessor = new Preprocessor();
    var processed_text = preprocessor.preprocess(text);
    var k = counter(processed_text);
    for (var _i = 0, liwcCat_1 = liwcCat; _i < liwcCat_1.length; _i++) {
        var cat = liwcCat_1[_i];
        var cat1 = 0;
        for (var key in Object.keys(k)) {
            if (getLiwcCategories(T, key).has(cat)) {
                cat1 += 1;
            }
        }
        f.push(cat1);
    }
    return f;
}
//$% LIWC
