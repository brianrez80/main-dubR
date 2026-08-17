#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'ui.js'), 'utf8');

function section(id) {
  const match = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`));
  assert(match, `${id} section should exist`);
  return match[0];
}

const home = section('homeView');
const memberBox = section('memberRecipeBoxPanel');

['new', 'ocr-upload', 'review-queue'].forEach(action => {
  assert.doesNotMatch(home, new RegExp(`data-action="${action}"`));
  assert.doesNotMatch(memberBox, new RegExp(`data-member-action="${action}"`));
});

assert.match(home, /data-action="nexus"/);
assert.match(memberBox, /data-member-action="nexus"/);
assert.match(home, /<button class="home-button nexus-home-button" data-action="nexus">📥 Import Center<\/button>/);
assert.match(memberBox, /<button class="home-button nexus-home-button" data-member-action="nexus">📥 Import Center<\/button>/);

// The primary controls are hidden from these navigation surfaces, not removed.
assert.match(app, /case 'new'/);
assert.match(app, /case 'ocr-upload'/);
assert.match(app, /case 'review-queue'/);

const initializedButtons = [
  { dataset: { action: 'nexus' }, textContent: '📥' },
  { dataset: { memberAction: 'nexus' }, textContent: '📥' }
];
const runtimeContext = {
  document: {
    querySelectorAll: selector => {
      assert.equal(selector, 'button[data-action="nexus"], button[data-member-action="nexus"]');
      return initializedButtons;
    },
    getElementById: () => null
  }
};
vm.createContext(runtimeContext);
vm.runInContext(`${ui}\nthis.ensureImportCenterButtonLabels = ensureImportCenterButtonLabels;`, runtimeContext);
runtimeContext.ensureImportCenterButtonLabels();
assert.deepEqual(initializedButtons.map(button => button.textContent), ['📥 Import Center', '📥 Import Center']);

console.log('Simplified home controls tests passed.');
