"use strict";
// required npm install blind-signatures
const blindSignatures = require('blind-signatures');

const { Coin, COIN_RIS_LENGTH, IDENT_STR, BANK_STR } = require('./coin.js');
const utils = require('./utils.js');

// Details about the bank's key.
const BANK_KEY = blindSignatures.keyGeneration({ b: 2048 });
const N = BANK_KEY.keyPair.n.toString();
const E = BANK_KEY.keyPair.e.toString();

/**
 * Function signing the coin on behalf of the bank.
 * 
 * @param blindedCoinHash - the blinded hash of the coin.
 * 
 * @returns the signature of the bank for this coin.
 */
function signCoin(blindedCoinHash) {
  return blindSignatures.sign({
      blinded: blindedCoinHash,
      key: BANK_KEY,
  });
}

/**
 * Parses a string representing a coin, and returns the left/right identity string hashes.
 *
 * @param {string} s - string representation of a coin.
 * 
 * @returns {[[string]]} - two arrays of strings of hashes, committing the owner's identity.
 */
function parseCoin(s) {
  let [cnst, amt, guid, leftHashes, rightHashes] = s.split('-');
  if (cnst !== BANK_STR) {
    throw new Error(`Invalid identity string: ${cnst} received, but ${BANK_STR} expected`);
  }
  let lh = leftHashes.split(',');
  let rh = rightHashes.split(',');
  return [lh, rh];
}

/**
 * Procedure for a merchant accepting a token. The merchant randomly selects
 * the left or right halves of the identity string.
 * 
 * @param {Coin} - the coin that a purchaser wants to use.
 * 
 * @returns {[String]} - an array of strings, each holding half of the user's identity.
 */
function acceptCoin(coin) {
  // 1) Verify that the signature is valid.
  let valid = blindSignatures.verify({
    unblinded: coin.signature,
    N: coin.n,
    E: coin.e,
    message: coin.toString()
  });

  if (!valid) {
    throw new Error("Invalid coin signature.");
  }

  // 2) Gather the RIS by randomly choosing left or right and verify hashes
  let [leftHashes, rightHashes] = parseCoin(coin.toString());

  let ris = [];

  for (let i = 0; i < COIN_RIS_LENGTH; i++) {
    let chooseLeft = utils.randInt(2) === 0;
    let part = coin.getRis(chooseLeft, i);
    let hashed = utils.hash(part);
    let expected = chooseLeft ? leftHashes[i] : rightHashes[i];

    if (hashed !== expected) {
      throw new Error(`RIS hash mismatch at index ${i}`);
    }

    ris.push(part.toString('hex'));
  }

  return ris;
}

/**
 * If a token has been double-spent, determine who is the cheater
 * and print the result to the screen.
 * 
 * If the coin purchaser double-spent their coin, their anonymity
 * will be broken, and their identity will be revealed.
 * 
 * @param guid - Globally unique identifier for coin.
 * @param ris1 - Identity string reported by first merchant.
 * @param ris2 - Identity string reported by second merchant.
 */
function determineCheater(guid, ris1, ris2) {
  for (let i = 0; i < COIN_RIS_LENGTH; i++) {
    let buf1 = Buffer.from(ris1[i], 'hex');
    let buf2 = Buffer.from(ris2[i], 'hex');

    let xor = Buffer.alloc(buf1.length);
    for (let j = 0; j < buf1.length; j++) {
      xor[j] = buf1[j] ^ buf2[j];
    }

    let xorStr = xor.toString();

    if (xorStr.startsWith(IDENT_STR)) {
      console.log(`Double-spending detected! Cheater is the buyer. ID: ${xorStr}`);
      return;
    }
  }

  console.log("Double-spending detected! Cheater is the merchant.");
}

// ==== DEMO ====

let coin = new Coin('alice', 20, N, E);

coin.signature = signCoin(coin.blinded);

coin.unblind();

// Merchant 1 accepts the coin.
let ris1 = acceptCoin(coin);

// Merchant 2 accepts the same coin.
let ris2 = acceptCoin(coin);

// The bank realizes that there is an issue and identifies Alice as the cheater.
determineCheater(coin.guid, ris1, ris2);

console.log();

// On the other hand, if the RIS strings are the same, the merchant is marked as the cheater.
determineCheater(coin.guid, ris1, ris1);
