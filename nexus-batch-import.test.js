#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'nexus.js'), 'utf8');
const storedState = {};
let ocrFiles = null;
let uploadFiles = null;
let submittedRecipe = null;
let shownRecipe = null;

const context = {
  console,
  window: {
    sessionStorage: {
      setItem(key, value) { storedState[key] = value; },
      removeItem(key) { delete storedState[key]; }
    }
  },
  performOCR: async (files, onProgress) => {
    ocrFiles = Array.from(files);
    onProgress({ status: 'Recognizing text', progress: 1, imageIndex: 4, imageCount: 4 });
    return {
      title: 'Slow Cooker Tuscan Chicken',
      ingredients: '2 pounds chicken thighs\n1 cup heavy cream',
      instructions: '1. Cook on low for 7 hours.\n2. Serve warm.',
      cookTime: '7 hours',
      categories: { main: 'Chicken', ethnicity: 'Italian' }
    };
  },
  createDraftFromOCR: async (images, ocrData) => ({
    id: 'draft-1',
    images,
    notes: `Ingredients\n${ocrData.ingredients}\n\nInstructions\n${ocrData.instructions}`
  }),
  uploadSelectedImages: async (recipeId, files) => {
    uploadFiles = Array.from(files);
    return uploadFiles.map((file, index) => `https://example.test/${recipeId}/${index + 1}-${file.name}`);
  },
  submitOCRRecipe: async recipe => { submittedRecipe = recipe; },
  hideAllPanels: () => {},
  showReviewComparison: recipe => { shownRecipe = recipe; },
  recipes: []
};

vm.runInNewContext(
  `${source}
  renderNexusQueue = () => {};
  processNexusQueue = () => {};
  this.__nexusTests = {
    nexusImportState,
    addNexusSources,
    extractNexusRecipe,
    showRecipeReviewFromImport,
    getNexusEntryLabel
  };`,
  context
);

async function run() {
const api = context.__nexusTests;
const messageBox = { textContent: '' };
const panel = { querySelector: () => messageBox };
const makeFile = (name, size, lastModified) => ({ name, size, lastModified });
const pages = [
  makeFile('page-1.jpg', 1200, 1),
  makeFile('page-2.jpg', 1200, 2),
  makeFile('page-3.jpg', 1200, 3),
  makeFile('page-4.jpg', 1200, 4)
];

api.nexusImportState.queue = [];
api.addNexusSources(pages, panel);
assert.strictEqual(api.nexusImportState.queue.length, 1);
const batchEntry = api.nexusImportState.queue[0];
assert.strictEqual(batchEntry.files.length, 4);
assert.deepStrictEqual(Array.from(batchEntry.files).map(file => file.name), pages.map(file => file.name));
assert.match(api.getNexusEntryLabel(batchEntry), /4 images/);

api.addNexusSources([pages[0]], panel);
assert.strictEqual(api.nexusImportState.queue.length, 1);
assert.match(messageBox.textContent, /already in the import list/i);

await api.extractNexusRecipe(batchEntry.files);
assert.deepStrictEqual(ocrFiles.map(file => file.name), pages.map(file => file.name));

const parsedRecipe = await api.extractNexusRecipe(batchEntry.files);
batchEntry.status = 'ready';
batchEntry.ocrData = parsedRecipe;
api.nexusImportState.queue = [batchEntry];
await api.showRecipeReviewFromImport(batchEntry.id, panel);

assert.deepStrictEqual(uploadFiles.map(file => file.name), pages.map(file => file.name));
assert.deepStrictEqual(
  Array.from(shownRecipe.images),
  pages.map((file, index) => `https://example.test/draft-1/${index + 1}-${file.name}`)
);
assert.strictEqual(submittedRecipe, shownRecipe);
assert.match(shownRecipe.notes, /^Ingredients\n2 pounds chicken thighs/m);
assert.match(shownRecipe.notes, /\n\nInstructions\n1\. Cook on low for 7 hours\./);
assert.match(shownRecipe.notes, /2\. Serve warm\./);

api.nexusImportState.queue = [];
api.addNexusSources([makeFile('single-page.png', 1200, 5)], panel);
assert.strictEqual(api.nexusImportState.queue.length, 1);
assert.strictEqual(api.nexusImportState.queue[0].files.length, 1);
assert.strictEqual(api.getNexusEntryLabel(api.nexusImportState.queue[0]), 'single-page.png');

console.log('Nexus batch import tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
