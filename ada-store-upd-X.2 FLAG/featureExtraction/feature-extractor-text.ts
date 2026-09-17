/* global chrome */
import { SWEAR_WORDS } from "./lexicons";
import { REGRET_WORDS_CURSING, REGRET_WORDS_DRUG, REGRET_WORDS_HEALTH, REGRET_WORDS_RACE_RELIGION, REGRET_WORDS_RELATIONSHIP, REGRET_WORDS_SEX, REGRET_WORDS_VIOLENCE, REGRET_WORDS_WORK, EMOTION_WORDS_ANGER, EMOTION_WORDS_ANTICIPATION, EMOTION_WORDS_DISGUST, EMOTION_WORDS_FEAR, EMOTION_WORDS_JOY, EMOTION_WORDS_SADNESS, EMOTION_WORDS_SURPRISE, EMOTION_WORDS_TRUST, NRC_SENTIMENT_WORDS_NEGATIVE, NRC_SENTIMENT_WORDS_POSITIVE, MPQA_WORDS_SENTIMENTAL, MPQA_WORDS_SUBJECTIVE } from "./lexicons";

//$% imported following libraries
// import axios, { AxiosResponse } from 'axios';

 import * as fs from 'fs';
import { eng } from './stopwords_eng';
import {liwc_dictionary} from './LIWC_dictionary';
//$%
//$% spacy using tensorflow.js
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as use from '@tensorflow-models/universal-sentence-encoder';


class Preprocessor {
  private stopWords: Set<string>;

  constructor() {
    this.stopWords = new Set(eng);
  }

  decontracted(phrase: string): string {
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
  }

  preprocess(text: string): string[] {
    text = this.decontracted(text);
    text = text.toLowerCase().replace(/\s+/g, ' ').trim(); // Replace consecutive whitespace with a single space and trim
    text = text.replace(/\n\r/g, ''); // Remove newline and carriage return
    const words = text.split(/\s+/).filter((word) => word !== ''); // Split based on whitespace
    const tokens = words.filter((word) => !this.stopWords.has(word));
    return tokens;
  }
}

class LiwcTrieNode {
  character: string ;
  parent: LiwcTrieNode | null;
  children: {[key:string]:LiwcTrieNode};
  categories: Set<string>;

  constructor() {
    this.character = '*';
    this.parent = null;
    this.children = {};
    this.categories = new Set();
  }
}

class LiwcTrie{
  root: LiwcTrieNode;
  constructor(){
    this.root = new LiwcTrieNode();
  }
  insertWord(word: string, category: string): void {
    if (word[word.length - 1] !== '*') {
      word = word + '$';
    }
    let t: LiwcTrieNode = this.root;
    for(let i=0; i<word.length; i++){
      if(!t.children[word[i]]){
        t.children[word[i]] = new LiwcTrieNode();
        t.children[word[i]].character=word[i];
        t.children[word[i]].parent=t;
      }
      t = t.children[word[i]];
      if(i===word.length-1){
        t.categories.add(category);
      }
    }
  }
    
  getLiwcCategories(word: string): Set<string> {
    let t = this.root;
    const categories = new Set<string>();
    word = word + '$';
    let i=0;
    for(i=0; i<word.length; i++){
      if(t.children['*']){
        t.children['*'].categories.forEach((cat) => categories.add(cat));
      }
      if(t.children[word[i]]){
        t = t.children[word[i]];
      }
      else{
        break;
      }
    }
    if(i===word.length){
      t.categories.forEach((cat) => categories.add(cat));
    }
    return categories;
  }
  
  printFormattedTrie(): void {
    this.printNodeFormatted(this.root, 0);
  }

  private printNodeFormatted(node: LiwcTrieNode, level: number): void {
    const indent = '  '.repeat(level);

    const categoriesArray = Array.from(node.categories); // Convert set to array

    console.log(`${indent}${node.character} (${categoriesArray.length > 0 ? categoriesArray.join(', ') : 'No Categories'})`);

    for (const childKey in node.children) {
      this.printNodeFormatted(node.children[childKey], level + 1);
    }
  }
}

const TOP_UNIGRAMS_COUNT: number = 100;
const TOP_BIGRAMS_COUNT: number = 100;

//$% trigram 
const TOP_TRIGRAMS_COUNT: number = 100;
//$% trigram

//$% LIWC stuff
// Loading LIWC dictionary from JSON file
let Trie = new LiwcTrie();
Trie = createTrie(liwc_dictionary);
// console.log("LIWC Trie:/n");
// Trie.printFormattedTrie();
// console.log("kia-*", Trie.getLiwcCategories("kia-*"));
// console.log("kia-tiger", Trie.getLiwcCategories("kia-tiger"));
// console.log("kia-sonet", Trie.getLiwcCategories("kia-sonet"));
// console.log("kia-carens", Trie.getLiwcCategories("kia-carens"));
// console.log("/n");

//$% LIWC stuff

export async function extractSoundFeatures(text: string[]): Promise<{ [key: string]: number[]; }[]> {
  const sound_features: { [key: string]: number[] }[] = [];

  for (const sentence of text) {
    const sound_embedding: { [key: string]: number[] } = {};
    

    sound_embedding["SOUNDNET"] = extractSoundNetFeatures(); 
    sound_embedding["MFCC"] = extractMFCCFeatures(); 
    sound_embedding["Scontrast"] = extractScontrastFeatures(); 
    sound_embedding["Tempo"] = extractTempoFeatures(); 

    sound_features.push(sound_embedding);
  }
  return sound_features;

}

function extractSoundNetFeatures(): number[] {
  var length = 1024;
  return new Array(length).fill(0);
}

function extractMFCCFeatures(): number[] {
  var length = 26;
  return new Array(length).fill(0);
}

function extractScontrastFeatures(): number[] {
  var length = 8;
  return new Array(length).fill(0);
}

function extractTempoFeatures(): number[] {
  var length = 1;
  return new Array(length).fill(0);
}

export async function extractTextFeatures(text: string[]): Promise<{ [key: string]: number[]; }[]> {
  const text_features: { [key: string]: number[] }[] = [];
  //$% now calculateTopUnigrams returns two values [string[], Record<string, number>], earlier it was only string[]
  var result_calculateTopUnigrams = calculateTopUnigrams(text, TOP_UNIGRAMS_COUNT);
  var TOP_UNIGRAMS: string[] = result_calculateTopUnigrams[0];
  var unigramCounts: Record<string, number> = result_calculateTopUnigrams[1];
  //$%
  var TOP_BIGRAMS: string[] = calculateTopBigrams(text, TOP_BIGRAMS_COUNT);
  //$% trigram
  var TOP_TRIGRAMS: string[] = calculateTopTrigrams(text, TOP_TRIGRAMS_COUNT);
  //$% trigram

  //$% LIWC stuff
  const liwcCat: string[] = [];
  // console.log("TOP_UNIGRAMS:", TOP_UNIGRAMS);
  // console.log("unigram_counts:", unigramCounts);

  //$% changing following code as this adds only categories related to words of unigrmCounts, but we want all categories
  // for (const uni of Object.keys(unigramCounts)) {
  //   for (const cat of Array.from(Trie.getLiwcCategories(uni))) {
  //     if (!liwcCat.includes(cat)) {
  //       liwcCat.push(cat);
  //     }
  //   }
  // }
  // console.log("LIWC Categories:", liwcCat);
  // console.log(liwcCat.length);
  //$% changing following code as this adds only categories related to words of unigrmCounts, but we want all categories

  for(const cat of Object.keys(liwc_dictionary)){
    liwcCat.push(cat);
  }
  // console.log("LIWC Categories:", liwcCat);
  // console.log(liwcCat.length);


  
  //$%

  for (const sentence of text) {
    const text_embedding: { [key: string]: number[] } = {};
    
    const lowercaseSentence = sentence.toLowerCase();

    text_embedding["SWEAR_WORD_FEAT"] = extractSwearWordFeature(lowercaseSentence); 
    text_embedding["REGRET_WORD_FEAT"] = extractRegretWordFeature(lowercaseSentence);
    text_embedding["EMOTION_WORD_FEAT"] = extractEmotionWordFeature(lowercaseSentence);
    text_embedding["TOP_UNIGRAM_FEAT"] = extractTopUnigramFeature(lowercaseSentence, TOP_UNIGRAMS, TOP_UNIGRAMS_COUNT);
    text_embedding["TOP_BIGRAM_FEAT"] = extractTopBigramFeature(lowercaseSentence, TOP_BIGRAMS, TOP_BIGRAMS_COUNT);
    //$% trigram, LIWC, NRC(positive, negative) & MPQA
    text_embedding["TOP_TRIGRAM_FEAT"] = extractTopTrigramFeature(lowercaseSentence, TOP_TRIGRAMS, TOP_TRIGRAMS_COUNT);
    text_embedding["LIWC_FEAT"] = extractLiwcFeature(lowercaseSentence, liwcCat, Trie);
    text_embedding["SENTIMENT_FEAT"] = extractSentimentFeature(lowercaseSentence);
    const vector = await getVectorFromUSE(lowercaseSentence);
    if (vector) {
      text_embedding["SENT_2_VEC_FEAT"] = vector.slice(0, 300);
      // console.log("Sent2Vec vector:", vector);
    }
    else{
      console.log("Error in getting sent2vec vector from API");
    }
    //$% trigram, LIWC, NRC(positive, negative) & MPQA
    // console.log("swear word feat size:", text_embedding["SWEAR_WORD_FEAT"].length);
    // console.log("regret word feat size:", text_embedding["REGRET_WORD_FEAT"].length);
    // console.log("emotion word feat size:", text_embedding["EMOTION_WORD_FEAT"].length);
    // console.log("top unigram feat size:", text_embedding["TOP_UNIGRAM_FEAT"].length);
    // console.log("top bigram feat size:", text_embedding["TOP_BIGRAM_FEAT"].length);
    // console.log("top trigram feat size:", text_embedding["TOP_TRIGRAM_FEAT"].length);
    // console.log("LIWC feat size:", text_embedding["LIWC_FEAT"].length);
    // console.log("Sentiment feat size:", text_embedding["SENTIMENT_FEAT"].length);
    // console.log("Sent2Vec feat size:", text_embedding["SENT_2_VEC_FEAT"].length);
    text_features.push(text_embedding);

    
  }
 
  return text_features;
}

//$% spacy
interface VectorResponse {
  vector: number[]; // Assuming the API returns an array of floats
}

// spacy using BeServer
// async function getVectorFromApi(text: string): Promise<number[] | null> {
//   const apiUrl = 'http://127.0.0.1:8000/get_vector';

//   try {
//     const response: AxiosResponse<VectorResponse> = await axios.post(apiUrl, { text });

//     if (response.status === 200) {
//       return response.data.vector;
//     } else {
//       console.error(`Error: ${response.status}`);
//       return null;
//     }
//   } catch (error: any) {
//     if (axios.isAxiosError(error)) {
//       console.error('Failed to retrieve vector:', error.message);
//     } else {
//       console.error('Unexpected error:', error);
//     }
//     return null;
//   }
// }
//$% spacy


// Spacy using tensorflow.js
// Declare a variable to hold the model

export let creating: Promise<void> | null = null;
let offscreenCreated = false;

export async function setupOffscreenDocument(path: string): Promise<void> {
  // If the offscreen document is already created, simply return.
  if (offscreenCreated) return;

  // If a creation is already in progress, wait for it.
  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: ['WORKERS', 'BLOBS', ], 
      justification: 'For tensorflow.js and pyodide'
    }) as Promise<void>;
    await creating;
    creating = null;
    offscreenCreated = true;
  }

  console.log("Offscreen document is created");
}






async function getVectorFromUSE(text: string): Promise<number[]> {
  // Ensure the offscreen document is created.
  await setupOffscreenDocument("offscreen.html");

  console.log("Generating embeddings");

  // Sending the prediction request to the offscreen document.
  return new Promise<number[]>((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'getData', target: 'offscreen', text },
      (response) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        if (response && response.status === 'success' && Array.isArray(response.data)) {
          resolve(response.data);
        } else {
          reject(response?.error || 'Error generating embeddings');
        }
      }
    );
  });
}
/* Tensorflow.js is done */

//$% NRC(positive, negative) & MPQA
function extractSentimentFeature(text: string): number[] {
    const sentimentFeature: number[] = [];
    var positiveWordCount = 0;
    var negativeWordCount = 0;
    var sentimentalWordCount = 0;
    var subjectiveWordCount = 0;

    for (const positiveWord of NRC_SENTIMENT_WORDS_POSITIVE) {
        const cnt = countOccurrences(text, positiveWord);
        positiveWordCount += cnt;
    }
    for (const negativeWord of NRC_SENTIMENT_WORDS_NEGATIVE) {
        const cnt = countOccurrences(text, negativeWord);
        negativeWordCount += cnt;
    }
    
    for(const positiveWord of MPQA_WORDS_SENTIMENTAL){
        const cnt = countOccurrences(text, positiveWord);
        sentimentalWordCount += cnt;
    }
    for(const negativeWord of MPQA_WORDS_SUBJECTIVE){
        const cnt = countOccurrences(text, negativeWord);
        subjectiveWordCount += cnt;
    }
    sentimentFeature.push(positiveWordCount);
    sentimentFeature.push(negativeWordCount);
    sentimentFeature.push(sentimentalWordCount);
    sentimentFeature.push(subjectiveWordCount);
    return sentimentFeature;
}
//$% NRC(positive, negative) & MPQA
function extractEmotionWordFeature(text: string): number[] {
    const emotionWordFeature: number[] = [];

    var emotionWordCount = 0;
    // EMOTION_WORDS_ANGER
    for (const emotionWord of EMOTION_WORDS_ANGER){
        const cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);

    // EMOTION_WORDS_ANTICIPATION
    emotionWordCount = 0
    for (const emotionWord of EMOTION_WORDS_ANTICIPATION){
        const cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);

    // EMOTION_WORDS_DISGUST
    emotionWordCount = 0
    for (const emotionWord of EMOTION_WORDS_DISGUST){
        const cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);

    // EMOTION_WORDS_FEAR
    emotionWordCount = 0
    for (const emotionWord of EMOTION_WORDS_FEAR){
        const cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);

    // EMOTION_WORDS_JOY
    emotionWordCount = 0
    for (const emotionWord of EMOTION_WORDS_JOY){
        const cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);

    // EMOTION_WORDS_SADNESS
    emotionWordCount = 0
    for (const emotionWord of EMOTION_WORDS_SADNESS){
        const cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);

    // EMOTION_WORDS_SURPRISE
    emotionWordCount = 0
    for (const emotionWord of EMOTION_WORDS_SURPRISE){
        const cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);

    // EMOTION_WORDS_TRUST
    emotionWordCount = 0
    for (const emotionWord of EMOTION_WORDS_TRUST){
        const cnt = countOccurrences(text, emotionWord);
        emotionWordCount += cnt;
    }
    emotionWordFeature.push(emotionWordCount);

    return emotionWordFeature;
}

function extractRegretWordFeature(text: string): number[] {
    const regretWordFeature: number[] = [];
    var regretWordCount = 0;
    // REGRET_WORDS_CURSING
    for (const regretWord of REGRET_WORDS_CURSING) {
        const cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);

    // REGRET_WORDS_DRUG
    regretWordCount = 0;
    for (const regretWord of REGRET_WORDS_DRUG) {
        const cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);

    // REGRET_WORDS_HEALTH
    regretWordCount = 0;
    for (const regretWord of REGRET_WORDS_HEALTH) {
        const cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);

    // REGRET_WORDS_RACE_RELIGION
    regretWordCount = 0;
    for (const regretWord of REGRET_WORDS_RACE_RELIGION) {
        const cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);

    // REGRET_WORDS_RELATIONSHIP
    regretWordCount = 0;
    for (const regretWord of REGRET_WORDS_RELATIONSHIP) {
        const cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);

    // REGRET_WORDS_SEX
    regretWordCount = 0;
    for (const regretWord of REGRET_WORDS_SEX) {
        const cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);

    // REGRET_WORDS_VIOLENCE
    regretWordCount = 0;
    for (const regretWord of REGRET_WORDS_VIOLENCE) {
        const cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);

    // REGRET_WORDS_WORK
    regretWordCount = 0;
    for (const regretWord of REGRET_WORDS_WORK) {
        const cnt = countOccurrences(text, regretWord);
        regretWordCount += cnt;
    }
    regretWordFeature.push(regretWordCount);

    return regretWordFeature;
}

function extractSwearWordFeature(text:string): number[] {
    const swearWordFeature: number[] = [];
    var swearWordCount = 0;
    for (const swearWord of SWEAR_WORDS) {
        const cnt = countOccurrences(text, swearWord);
        if (cnt) {
            // swearWordFeature.push(1);
            swearWordCount += cnt;
        } else {
            // swearWordFeature.push(0);
        }
    }
    swearWordFeature.push(swearWordCount);
    return swearWordFeature;
}

function extractTopUnigramFeature(text: string, topUnigrams: string[], topN: number): number[] {
    const topUnigramFeature: number[] = [];
    for (const unigram of topUnigrams) {
        const cnt = countOccurrences(text, unigram);
        topUnigramFeature.push(cnt);
    }
    if(topUnigramFeature.length < topN){
        for(let i = topUnigramFeature.length; i<topN; i++){
            topUnigramFeature.push(0);
        }
    }
    return topUnigramFeature;
}

function extractTopBigramFeature(text: string, topBigrams: string[], topN: number): number[] {
    const topBigramFeature: number[] = [];

    var bigrams: string[] = [];

    const tokens = text.split(/\s+/);//.map((token) => token.replace(/[.,!?;'"-]/g, ''));
    for (let i = 0; i < tokens.length - 1; i++) {
        const bigram = tokens[i] + ' ' + tokens[i + 1];
        bigrams.push(bigram);
    }

    for (const topBigram of topBigrams) {
        const cnt = bigrams.filter(bigram => bigram === topBigram).length;
        topBigramFeature.push(cnt);
    }
    if(topBigramFeature.length < topN){
      for(let i = topBigramFeature.length; i<topN; i++){
          topBigramFeature.push(0);
      }
  }
    return topBigramFeature;
}
//$% trigram
function extractTopTrigramFeature(text: string, topTrigrams: string[], topN: number): number[] {
    const topTrigramFeature: number[] = [];

    var trigrams: string[] = [];

    const tokens = text.split(/\s+/);
    for (let i = 0; i < tokens.length - 2; i++) {
        const trigram = tokens[i] + ' ' + tokens[i + 1] + ' ' + tokens[i + 2];
        trigrams.push(trigram);
    }

    for (const topTrigram of topTrigrams) {
        const cnt = trigrams.filter(trigram => trigram === topTrigram).length;
        topTrigramFeature.push(cnt);
    }
    if(topTrigramFeature.length < topN){
      for(let i = topTrigramFeature.length; i<topN; i++){
          topTrigramFeature.push(0);
      }
  }
    return topTrigramFeature;
}
//$% trigram

function countOccurrences(sentence: string, wordToCount: string): number {
    return sentence.split(/\s+/).filter(word => word === wordToCount).length;
}

function calculateTopUnigrams(corpus: string[], topN: number): [string[], Record<string, number>] {
    const text = corpus.join(" ").toLowerCase();
    const tokens = text.split(/\s+/);//.map((token) => token.replace(/[.,!?;'"-]/g, ''));

    const unigramCounts: Record<string, number> = {};

    for (const token of tokens) {
      if (token) {
        unigramCounts[token] = (unigramCounts[token] || 0) + 1;
      }
    }

    const sortedUnigrams = Object.keys(unigramCounts).sort((a, b) => unigramCounts[b] - unigramCounts[a]);

    const topUnigrams = sortedUnigrams.slice(0, topN);
    //$% now calculateTopUnigrams returns two values [string[], Record<string, number>], earlier it was only string[]
    return [topUnigrams, unigramCounts];
    //$%
  }

function calculateTopBigrams(corpus: string[], topN: number): string[] {
    const text = corpus.join(" ").toLowerCase();
    const tokens = text.split(/\s+/);//.map((token) => token.replace(/[.,!?;'"-]/g, ''));

    const bigramCounts: Record<string, number> = {};

    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = tokens[i] + ' ' + tokens[i + 1];
      bigramCounts[bigram] = (bigramCounts[bigram] || 0) + 1;
    }

    const sortedBigrams = Object.keys(bigramCounts).sort((a, b) => bigramCounts[b] - bigramCounts[a]);

    const topBigrams = sortedBigrams.slice(0, topN);
    return topBigrams;
}

//$% trigram
function calculateTopTrigrams(corpus: string[], topN: number): string[] {
    const text = corpus.join(" ").toLowerCase();
    const tokens = text.split(/\s+/);

    const trigramCounts: Record<string, number> = {};

    for (let i = 0; i < tokens.length - 2; i++) {
        const trigram = tokens[i] + ' ' + tokens[i + 1] + ' ' + tokens[i + 2];
        trigramCounts[trigram] = (trigramCounts[trigram] || 0) + 1;
    }

    const sortedTrigrams = Object.keys(trigramCounts).sort((a, b) => trigramCounts[b] - trigramCounts[a]);

    const topTrigrams = sortedTrigrams.slice(0, topN);
    return topTrigrams;
}
//$% trigram




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




//%$ LIWC related classes and functions
  
function counter(inputList: string[]): { [key: string]: number } {
  const counts: { [key: string]: number } = {};
  for (const item of inputList) {
    counts[item] = (counts[item] || 0) + 1;
  }

  return counts;
}
function createTrie(liwcDict: {[key:string]:string[]}): LiwcTrie{
  const myTrie = new LiwcTrie();

  for (const [category, words] of Object.entries(liwcDict)) {
    for (const word of words) {
      myTrie.insertWord(word, category);
    }
  }
  return myTrie;
}
function extractLiwcFeature(text: string, liwcCat: string[], Trie: LiwcTrie): number[] {
  const f: number[] = [];
  const preprocessor = new Preprocessor();
  let processed_text: string[] = preprocessor.preprocess(text);
  const k: {[k:string]:number} = counter(processed_text);
  // console.log("k:", k);
  for (const cat of liwcCat) {
    let cat1 = 0;
    for (const key of Object.keys(k)) {
      if (Trie.getLiwcCategories(key).has(cat)) {
        cat1 += 1;
      }
    }

    f.push(cat1);
  }
  // console.log("LIWC Features:", f);
  return f;
}

//$% LIWC

//$%
// const textArray: string[] = [
//   "Searched for how to paste without formatting in mc",
//   "Visited https://auto.hindustantimes.com/web-stories/2024-mahindra-xuv700-is-here-with-upgrades-to-take-on-the-tata-safari-check-it-out-41705380157708",
//   "And this is the third one.",
//   "he always fight in the class, he is worse than what i thought"
// ];

// async function processTextArray() {
//   const result: { [key: string]: number[] }[] = await extractTextFeatures(textArray);
//   // console.log("hi saras");
//   // console.log(result);
// }

// processTextArray();
//$%

function getFeatureArray(key: string, value: string): number[]{
  if (key === "gender" || key === "major") {
    var feature: number[] = new Array(2).fill(0);
    var val: number = parseInt(value);
    feature[0] = Math.floor(val/2);
    feature[1] = val%2;
    return feature;
  }
  else {
    var feature: number[] = new Array(3).fill(0);
    var val: number = parseInt(value);
    feature[0] = Math.floor(val/4);
    val = val%4;
    feature[1] = Math.floor(val/2);
    val = val%2;
    feature[2] = val;
    return feature;
  }
}


export async function extractUserFeatures(user: any): Promise<{ [key: string]: number[]; }> {
  console.log("User:", user);
  const user_features: { [key: string]: number[] } = {};

  for (let key in user) {
    console.log("Key:", key);
    console.log("Value:", user[key]);
    user_features[key] = getFeatureArray(key, user[key]);
  }
  console.log("User Features:", user_features);
  return user_features;

}