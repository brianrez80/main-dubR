#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { URL };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, 'recipe-links.js'), 'utf8'),
  context
);

const { normalizeRecipeUrl, getYouTubeEmbedUrl, classifyRecipeLink } = context;

assert.equal(
  getYouTubeEmbedUrl(' https://www.youtube.com/watch?v=dQw4w9WgXcQ '),
  'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
);
assert.equal(
  getYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=12'),
  'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
);
assert.equal(
  getYouTubeEmbedUrl('https://youtube.com/shorts/dQw4w9WgXcQ'),
  'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
);
assert.equal(normalizeRecipeUrl('javascript:alert(1)').url, '');
assert.match(normalizeRecipeUrl('not a link').error, /http:\/\/ or https:\/\//);
const webpage = classifyRecipeLink('https://example.com/recipes/pasta');
assert.equal(webpage.url, 'https://example.com/recipes/pasta');
assert.equal(webpage.error, '');
assert.equal(webpage.kind, 'source');
assert.equal(classifyRecipeLink('https://www.tiktok.com/@cook/video/123').kind, 'video');
assert.equal(classifyRecipeLink('https://cdn.example.com/recipe.mp4').kind, 'video');
assert.equal(normalizeRecipeUrl('').url, '');

const dbContext = {
  window: {},
  console: { error() {} }
};
vm.createContext(dbContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8'), dbContext);
const legacyRecipe = vm.runInContext(
  "mapDbRecipe({ id: 'legacy-1', name: 'Existing recipe' })",
  dbContext
);
assert.equal(legacyRecipe.videoUrl, '');
assert.equal(legacyRecipe.sourceUrl, '');

console.log('Recipe link URL tests passed.');
