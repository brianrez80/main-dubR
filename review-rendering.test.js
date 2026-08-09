#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const imagesSource = fs.readFileSync(path.join(root, 'images.js'), 'utf8');
const reviewSource = fs.readFileSync(path.join(root, 'ui.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

const context = {};
vm.runInNewContext(
  `${imagesSource}\nthis.__reviewImages = { getRecipeImages, renderImageHtml };`,
  context
);

const imageUrl = 'https://example.test/recipes/draft-1/original.jpg';
const { getRecipeImages, renderImageHtml } = context.__reviewImages;
const renderedImages = renderImageHtml(
  getRecipeImages({ imageUrl }),
  'Original Recipe'
);

assert.match(renderedImages, new RegExp(`src="${imageUrl}"`));
assert.match(reviewSource, /const originalImages = getRecipeImages\(recipe\);/);
assert.match(reviewSource, /renderImageHtml\(originalImages, recipe\.name\)/);
assert.match(
  styles,
  /\.comparison-images \.image-grid img\s*\{[\s\S]*?object-fit:\s*contain;/
);
assert.match(
  styles,
  /\.comparison-images \.image-grid img\s*\{[\s\S]*?max-height:\s*[^;]+;/
);
assert.match(
  styles,
  /#review-notes\s*\{[\s\S]*?overflow-y:\s*auto;/
);

console.log('Review rendering tests passed.');
