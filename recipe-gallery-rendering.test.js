#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const imagesSource = fs.readFileSync(path.join(root, 'images.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'ui.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const recipeList = { innerHTML: '' };
const resultsTitle = { textContent: '' };

const context = {
  document: {
    getElementById(id) {
      return { recipeResults: {}, recipeList, resultsTitle }[id] || null;
    }
  }
};

vm.runInNewContext(
  `${imagesSource}\n${uiSource}\ninitializeUI();\nshowPanel = () => {};\nescapeHtml = value => String(value || '');\nthis.__galleryTests = { renderRecipes };`,
  context
);

const { renderRecipes } = context.__galleryTests;
const oneImage = 'https://example.test/recipes/single.jpg';
renderRecipes([{ id: 'single', name: 'Single Image', images: [oneImage], notes: '' }]);
assert.match(recipeList.innerHTML, /recipe-image-gallery recipe-image-gallery--1/);
assert.strictEqual((recipeList.innerHTML.match(/<img\b/g) || []).length, 1);
assert.match(recipeList.innerHTML, new RegExp(`src="${oneImage}"`));

const fourImages = [
  'https://example.test/recipes/four-1.jpg',
  'https://example.test/recipes/four-2.jpg',
  'https://example.test/recipes/four-3.jpg',
  'https://example.test/recipes/four-4.jpg'
];
renderRecipes([{ id: 'four', name: 'Four Images', images: fourImages, notes: '' }]);
assert.strictEqual((recipeList.innerHTML.match(/<article class="recipe-item">/g) || []).length, 1);
assert.strictEqual((recipeList.innerHTML.match(/<div class="recipe-image-gallery recipe-image-gallery--4">/g) || []).length, 1);
assert.strictEqual((recipeList.innerHTML.match(/<img\b/g) || []).length, 4);
fourImages.forEach(url => {
  assert.match(recipeList.innerHTML, new RegExp(`href="${url}"`));
  assert.match(recipeList.innerHTML, new RegExp(`src="${url}"`));
});

assert.match(styles, /\.recipe-image-gallery\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
assert.match(styles, /\.recipe-image-gallery--1\s*\{[\s\S]*?display:\s*block;/);
assert.match(styles, /@media \(max-width: 400px\)[\s\S]*?\.recipe-image-gallery:not\(\.recipe-image-gallery--1\)[\s\S]*?grid-template-columns:\s*1fr;/);

console.log('Approved recipe gallery rendering tests passed.');
