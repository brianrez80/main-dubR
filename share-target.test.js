#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {
  URLSearchParams,
  window: { addEventListener() {} },
  document: {},
  console
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('share-target.js', 'utf8'), context);
const target = context.getSharedRecipeTarget;

assert.equal(target('?share-url=https%3A%2F%2Fexample.com%2Fpasta&share-title=Pasta').url, 'https://example.com/pasta');
assert.equal(target('?share-url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ').url, 'https://youtu.be/dQw4w9WgXcQ');
assert.equal(target('?share-text=Try%20https%3A%2F%2Fexample.com%2Fsoup%20tonight').url, 'https://example.com/soup');
assert.equal(target('').url, '');
assert.equal(target('?share-text=not%20a%20link').url, '');
assert.equal(target('?share-url=https%3A%2F%2Fexample.com&share-text=https%3A%2F%2Fother.com').url, 'https://example.com');
console.log('Android share-target tests passed.');
