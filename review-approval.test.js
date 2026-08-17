#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
let passed = 0;

function test(name, callback) {
  return Promise.resolve()
    .then(callback)
    .then(() => {
      passed += 1;
      console.log(`PASS: ${name}`);
    });
}

function makeForm(recipeId, values) {
  const approveButton = { disabled: false, textContent: 'Approve & Publish', dataset: {} };
  const status = { textContent: '', className: 'review-publish-status hidden' };
  return {
    dataset: { recipeId },
    values,
    matches: selector => selector === '.comparison-form',
    querySelector: selector => {
      if (selector === '[data-approve-review]') return approveButton;
      if (selector === '[data-review-publish-status]') return status;
      return null;
    },
    approveButton,
    status
  };
}

function createAppContext() {
  const listeners = { click: null, submit: null, domReady: null };
  class TestFormData {
    constructor(form) {
      this.values = form.values;
    }
    get(name) {
      return this.values[name];
    }
  }

  const context = {
    URL,
    FormData: TestFormData,
    console: { log() {}, error() {}, warn() {} },
    confirm: () => false,
    document: {
      readyState: 'loading',
      body: { addEventListener: (name, listener) => { listeners[name] = listener; } },
      addEventListener: (name, listener) => {
        if (name === 'submit') listeners.submit = listener;
        if (name === 'DOMContentLoaded') listeners.domReady = listener;
      },
      querySelectorAll: () => []
    },
    ui: { reviewQueuePanel: {}, homeView: {} },
    hideAllPanels() {},
    showPanel() {},
    renderRecipes() {},
    loadAndShowReviewQueue: async () => {},
    deleteRecipe: async () => {},
    setTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'recipe-links.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
  return { context, listeners };
}

async function run() {
  await test('approval performs an update of the existing draft ID without a database insert', async () => {
    const calls = { updates: [], inserts: 0 };
    const fakeDb = {
      from: () => ({
        update: payload => {
          calls.updates.push(payload);
          return { eq: async id => ({ error: id ? null : { message: 'missing id' } }) };
        },
        insert: () => {
          calls.inserts += 1;
          return Promise.resolve({ error: null });
        }
      })
    };
    const dbContext = {
      window: { supabase: true },
      supabase: { createClient: () => fakeDb },
      SUPABASE_CONFIG: { URL: 'url', KEY: 'key', TABLE_NAME: 'recipes' },
      console: { error() {} }
    };
    vm.createContext(dbContext);
    vm.runInContext(fs.readFileSync(path.join(root, 'db.js'), 'utf8'), dbContext);

    await dbContext.updateRecipe('draft-42', {
      name: 'Edited Pancakes',
      time: '18 minutes',
      mainCategory: 'Breakfast',
      ethnicity: 'American',
      notes: 'Edited notes',
      status: 'approved',
      reviewedBy: 'Cheryl',
      reviewedAt: '2026-08-09T19:00:00.000Z'
    });

    assert.equal(calls.inserts, 0);
    assert.equal(calls.updates.length, 1);
    assert.deepEqual(calls.updates[0], {
      name: 'Edited Pancakes',
      cook_time: '18 minutes',
      main_category: 'Breakfast',
      ethnicity: 'American',
      notes: 'Edited notes',
      status: 'approved',
      reviewed_by: 'Cheryl',
      reviewed_at: '2026-08-09T19:00:00.000Z'
    });
    assert.equal(Object.hasOwn(calls.updates[0], 'image_url'), false);
    assert.equal(Object.hasOwn(calls.updates[0], 'ocr_text'), false);
    assert.equal(Object.hasOwn(calls.updates[0], 'contributor_name'), false);
  });

  await test('approval clicks submit once and locks the dynamic form while publishing', async () => {
    const { context, listeners } = createAppContext();
    await context.setupReviewListeners();
    vm.runInContext("recipes = [{ id: 'draft-1', status: 'draft' }];", context);
    let publishCalls = 0;
    let resolvePublish;
    const pendingPublish = new Promise(resolve => { resolvePublish = resolve; });
    context.handleApproveRecipe = async () => {
      publishCalls += 1;
      await pendingPublish;
    };
    const form = makeForm('draft-1', { name: 'Recipe' });
    const event = { target: form, preventDefault() {} };
    const first = listeners.submit(event);
    const second = listeners.submit(event);
    assert.equal(publishCalls, 1);
    assert.equal(form.approveButton.disabled, true);
    assert.equal(form.approveButton.textContent, 'Publishing...');
    resolvePublish();
    await Promise.all([first, second]);
    assert.equal(form.approveButton.disabled, false);
  });

  await test('approval preserves recipe data and saves the selected owner while publishing', async () => {
    const { context } = createAppContext();
    vm.runInContext(`recipes = [{
      id: 'draft-2', status: 'draft', images: ['one.jpg', 'two.jpg'],
      ocrText: '{"source":"ocr"}', contributorName: 'Brian', imageUrl: '["one.jpg","two.jpg"]',
      videoUrl: 'https://youtu.be/abcDEF12345', sourceUrl: 'https://example.com/original'
    }];`, context);
    context.approveDraftRecipe = async (id, editor, updates) => ({
      ...updates,
      status: 'approved',
      reviewedBy: editor,
      reviewedAt: '2026-08-09T19:00:00.000Z'
    });
    const form = makeForm('draft-2', {
      name: 'Edited Recipe', time: '30 min', mainCategory: 'Chicken', ethnicity: 'Italian', notes: 'Edited notes',
      videoUrl: 'https://youtu.be/abcDEF12345', sourceUrl: 'https://example.com/original',
      memberId: '00000000-0000-4000-8000-000000000002'
    });
    await context.handleApproveRecipe('draft-2', new context.FormData(form));
    const approved = vm.runInContext('recipes[0]', context);
    assert.equal(approved.status, 'approved');
    assert.equal(approved.name, 'Edited Recipe');
    assert.equal(approved.time, '30 min');
    assert.equal(approved.mainCategory, 'Chicken');
    assert.equal(approved.ethnicity, 'Italian');
    assert.equal(approved.notes, 'Edited notes');
    assert.deepEqual(approved.images, ['one.jpg', 'two.jpg']);
    assert.equal(approved.ocrText, '{"source":"ocr"}');
    assert.equal(approved.contributorName, 'Brian');
    assert.equal(approved.videoUrl, 'https://youtu.be/abcDEF12345');
    assert.equal(approved.sourceUrl, 'https://example.com/original');
    assert.equal(approved.memberId, '00000000-0000-4000-8000-000000000002');
  });

  await test('a publish failure shows useful inline feedback and restores the button', async () => {
    const { context, listeners } = createAppContext();
    await context.setupReviewListeners();
    vm.runInContext("recipes = [{ id: 'draft-3', status: 'draft' }];", context);
    context.handleApproveRecipe = async () => { throw new Error('RLS policy denied this update'); };
    const form = makeForm('draft-3', { name: 'Recipe' });
    await listeners.submit({ target: form, preventDefault() {} });
    assert.match(form.status.textContent, /RLS policy denied this update/);
    assert.match(form.status.className, /is-error/);
    assert.equal(form.approveButton.disabled, false);
  });

  await test('Cancel and Delete do not publish the draft', async () => {
    const { context, listeners } = createAppContext();
    await context.setupReviewListeners();
    let publishCalls = 0;
    context.handleApproveRecipe = async () => { publishCalls += 1; };
    const form = makeForm('draft-4', { name: 'Recipe' });
    const cancelTarget = {
      dataset: { cancelReview: '' },
      closest: selector => selector === '[data-cancel-review]' ? cancelTarget : null
    };
    await listeners.click({ target: cancelTarget });
    const deleteTarget = {
      dataset: { deleteReview: '' },
      closest: selector => {
        if (selector === '[data-delete-review]') return deleteTarget;
        if (selector === '.comparison-form') return form;
        return null;
      }
    };
    await listeners.click({ target: deleteTarget });
    assert.equal(publishCalls, 0);
  });

  console.log(`\n${passed} focused approval regression tests passed.`);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
