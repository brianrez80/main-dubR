#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'nexus.js'), 'utf8');
const messages = [];
const calls = { create: null, upload: null, submit: null, comparison: null };
const recipes = [];

const context = {
  console,
  window: {
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    setTimeout: callback => callback()
  },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  hideAllPanels: () => {},
  showPanel: () => {},
  ui: {},
  recipes,
  performOCR: async (_files, onProgress) => {
    onProgress({ status: 'Recognizing text', progress: 0.5, imageIndex: 1, imageCount: 1 });
    return { title: 'Test Recipe', ingredients: '1 egg', instructions: 'Mix', categories: { main: 'Breakfast', ethnicity: 'American' }, cookTime: '10 min', rawText: 'Test' };
  },
  createDraftFromOCR: async (images, data, contributor) => {
    calls.create = { images, data, contributor };
    return { id: 'draft-1', name: data.title, notes: 'Ingredients\n1 egg', status: 'draft', images };
  },
  uploadSelectedImages: async (recipeId, files) => {
    calls.upload = { recipeId, files };
    return ['https://example.test/recipes/draft-1/card.jpg'];
  },
  submitOCRRecipe: async recipe => {
    calls.submit = recipe;
    return recipe.id;
  },
  showReviewComparison: recipe => { calls.comparison = recipe; }
};

vm.runInNewContext(
  source + '\nthis.__nexusTests = { getNexusDuplicateKey, isNexusDuplicate, getNextNexusPendingEntry, removeNexusEntry, markNexusEntryFailed, extractNexusRecipe, showRecipeReviewFromImport, getState: () => nexusImportState };',
  context
);

const api = context.__nexusTests;
const firstFile = { name: 'one.jpg', size: 100, lastModified: 10 };
const duplicateFile = { name: 'one.jpg', size: 100, lastModified: 10 };
const secondFile = { name: 'two.jpg', size: 200, lastModified: 11 };

assert.strictEqual(api.getNexusDuplicateKey(firstFile), 'one.jpg::100::10');
assert.strictEqual(api.isNexusDuplicate(firstFile, [{ key: api.getNexusDuplicateKey(firstFile) }]), true);
assert.strictEqual(api.isNexusDuplicate(secondFile, [{ key: api.getNexusDuplicateKey(firstFile) }]), false);
assert.strictEqual(api.getNextNexusPendingEntry([{ id: 'pending', status: 'pending' }], false).id, 'pending');
assert.strictEqual(api.getNextNexusPendingEntry([{ id: 'pending', status: 'pending' }], true), null);
assert.strictEqual(api.removeNexusEntry([{ id: 'a' }, { id: 'b' }], 'a').length, 1);

const failed = { status: 'processing' };
assert.strictEqual(api.markNexusEntryFailed(failed, 'bad image').status, 'error');
assert.strictEqual(failed.error, 'bad image');

(async () => {
  const progressUpdates = [];
  const parsed = await api.extractNexusRecipe(firstFile, update => progressUpdates.push(update));
  assert.strictEqual(parsed.title, 'Test Recipe');
  assert.strictEqual(progressUpdates[0].percent, 50);
  assert.strictEqual(progressUpdates[0].stage, 1);

  const state = api.getState();
  state.queue = [{
    id: 'ready-1',
    file: firstFile,
    status: 'ready',
    ocrData: parsed,
    openingReview: false
  }];

  const panel = {
    querySelector: selector => selector === '[data-nexus-message]'
      ? { set textContent(value) { messages.push(value); } }
      : null
  };

  await api.showRecipeReviewFromImport('ready-1', panel);
  assert.deepStrictEqual(calls.create.images, []);
  assert.strictEqual(calls.create.contributor, 'Cheryl');
  assert.strictEqual(calls.upload.recipeId, 'draft-1');
  assert.deepStrictEqual(calls.upload.files, [firstFile]);
  assert.strictEqual(calls.submit.images[0], 'https://example.test/recipes/draft-1/card.jpg');
  assert.strictEqual(recipes.length, 1);
  assert.strictEqual(calls.comparison.id, 'draft-1');
  assert.match(messages[0], /Saving the original image/);

  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /data-source-count>0</);
  assert.match(html, /data-source-list><\/div>/);
  assert.doesNotMatch(html, /Cheryl's Recipe Cards|Cheryl's Family Favorites|2 of 8 recipe sources added|68%/);

  console.log('Nexus queue tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
