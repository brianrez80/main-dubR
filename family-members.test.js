#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const configSource = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const dbSource = fs.readFileSync(path.join(root, 'db.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const ocrSource = fs.readFileSync(path.join(root, 'ocr.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function createAppContext() {
  const context = {
    window: { addEventListener() {}, crypto: { randomUUID: () => 'generated-id' } },
    console: { log() {}, warn() {}, error() {} },
    Event: function Event() {},
    document: {
      readyState: 'loading',
      addEventListener() {},
      querySelectorAll: () => [],
      getElementById: () => null,
      body: { addEventListener() {} }
    }
  };
  vm.createContext(context);
  vm.runInContext(configSource, context);
  vm.runInContext(appSource, context);
  return context;
}

function test(name, callback) {
  try {
    callback();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

async function asyncTest(name, callback) {
  try {
    await callback();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

const app = createAppContext();

test("Cheryl's recipes filter correctly, including a legacy recipe with no owner", () => {
  vm.runInContext(`
    familyMembers = getDefaultFamilyMembers();
    recipes = hydrateRecipeMembers([
      { id: 'legacy', name: 'Legacy Soup', status: 'approved' },
      { id: 'cheryl', name: 'Cheryl Pie', memberId: getDefaultMemberId(), status: 'approved' },
      { id: 'tiffany', name: 'Tiffany Tacos', memberId: '00000000-0000-4000-8000-000000000002', status: 'approved' }
    ]);
  `, app);
  const names = vm.runInContext("getPublishedRecipesForMember(getDefaultMemberId()).map(recipe => recipe.name)", app);
  assert.deepEqual(Array.from(names), ['Legacy Soup', 'Cheryl Pie']);
});

test("Tiffany's recipes filter correctly", () => {
  const names = vm.runInContext("getPublishedRecipesForMember('00000000-0000-4000-8000-000000000002').map(recipe => recipe.name)", app);
  assert.deepEqual(Array.from(names), ['Tiffany Tacos']);
});

test('All Recipes includes recipes belonging to both active members', () => {
  const names = vm.runInContext('getAllPublishedRecipes().map(recipe => recipe.name)', app);
  assert.deepEqual(Array.from(names), ['Legacy Soup', 'Cheryl Pie', 'Tiffany Tacos']);
});

test('recipe ownership maps to member_id when saving', () => {
  const dbContext = { window: {}, console: { error() {} }, getDefaultMemberId: () => 'cheryl-id' };
  vm.createContext(dbContext);
  vm.runInContext(dbSource, dbContext);
  const mapped = dbContext.mapRecipeToDb({ id: 'recipe-1', name: 'Cake', memberId: 'tiffany-id' });
  assert.equal(mapped.member_id, 'tiffany-id');
  assert.equal(dbContext.mapDbRecipe({ id: 'legacy', name: 'Old Recipe' }).memberId, null);
});

test('member selectors derive their options from member records, not named UI buttons', () => {
  vm.runInContext("familyMembers = [{ id: 'new-member', displayName: 'Brian', active: true }];", app);
  const options = vm.runInContext("getFamilyMemberOptionsHtml('new-member')", app);
  assert.match(options, /Brian/);
  assert.doesNotMatch(options, /Tiffany/);
  assert.match(indexSource, /id="memberSpaces"/);
  assert.doesNotMatch(indexSource, /data-member-id="[^\"]+"/);
});

test('member-specific category and cuisine filters stay inside the active recipe space', () => {
  vm.runInContext(`
    familyMembers = getDefaultFamilyMembers();
    activeMemberId = getDefaultMemberId();
    recipes = hydrateRecipeMembers([
      { id: 'chicken', name: 'Cheryl Chicken', memberId: getDefaultMemberId(), status: 'approved', mainCategory: 'Chicken', ethnicity: 'American' },
      { id: 'pasta', name: 'Cheryl Pasta', memberId: getDefaultMemberId(), status: 'approved', mainCategory: 'Vegetarian', ethnicity: 'Italian' },
      { id: 'tiffany-chicken', name: 'Tiffany Chicken', memberId: '00000000-0000-4000-8000-000000000002', status: 'approved', mainCategory: 'Chicken', ethnicity: 'Italian' }
    ]);
  `, app);
  const chicken = vm.runInContext("getScopedRecipesByFilter('mainCategory', 'Chicken').map(recipe => recipe.name)", app);
  const italian = vm.runInContext("getScopedRecipesByFilter('ethnicity', 'Italian').map(recipe => recipe.name)", app);
  assert.deepEqual(Array.from(chicken), ['Cheryl Chicken']);
  assert.deepEqual(Array.from(italian), ['Cheryl Pasta']);
});

test('new recipes inherit the active member instead of the form selection', () => {
  vm.runInContext("activeMemberId = '00000000-0000-4000-8000-000000000002';", app);
  assert.equal(vm.runInContext('getCurrentRecipeOwnerId()', app), '00000000-0000-4000-8000-000000000002');
});

test('shared manual recipe creation honors the selected member', () => {
  vm.runInContext('activeMemberId = null;', app);
  assert.equal(
    vm.runInContext("getRecipeOwnerForCurrentSpace('00000000-0000-4000-8000-000000000002')", app),
    '00000000-0000-4000-8000-000000000002'
  );
});

test('duplicate member names are prevented and Cheryl stays pinned first in the dynamic member spaces', () => {
  vm.runInContext(`
    familyMembers = getDefaultFamilyMembers();
    let renderedNames = [];
    renderMemberSpaces = members => { renderedNames = members.map(member => member.displayName); };
    populateStaticMemberSelects = () => {};
    addFamilyMemberToState({ id: 'brian-id', displayName: 'Brian', active: true });
    this.__renderedNames = renderedNames;
  `, app);
  assert.equal(vm.runInContext("isDuplicateFamilyMemberName('  brian ')", app), true);
  assert.deepEqual(Array.from(vm.runInContext('__renderedNames', app)), ['Cheryl', 'Tiffany', 'Brian']);
});

async function runAsyncChecks() {
  await asyncTest('OCR imports inherit the active member', async () => {
    vm.runInContext(ocrSource, app);
    vm.runInContext("activeMemberId = '00000000-0000-4000-8000-000000000002';", app);
    const draft = await app.createDraftFromOCR([], {
      title: 'Imported Taco Soup', categories: {}, rawText: 'Recipe text'
    }, 'Tiffany');
    assert.equal(draft.memberId, '00000000-0000-4000-8000-000000000002');
  });

  await asyncTest('review and publish retain the active member ownership', async () => {
    vm.runInContext(`
      recipes = hydrateRecipeMembers([{
        id: 'draft-for-tiffany', status: 'draft', memberId: getDefaultMemberId(),
        name: 'Imported Recipe', time: '', mainCategory: 'Soup', ethnicity: 'American', notes: 'Notes'
      }]);
      activeMemberId = '00000000-0000-4000-8000-000000000002';
    `, app);
    app.normalizeRecipeUrl = value => ({ url: value || '', error: null });
    app.approveDraftRecipe = async (_id, _editor, updates) => ({ ...updates, status: 'approved' });
    const formData = { get: name => ({
      name: 'Published Recipe', time: '20 min', mainCategory: 'Soup', ethnicity: 'American', notes: 'Notes',
      videoUrl: '', sourceUrl: '', memberId: '00000000-0000-4000-8000-000000000001'
    })[name] };
    const published = await app.handleApproveRecipe('draft-for-tiffany', formData);
    assert.equal(published.memberId, '00000000-0000-4000-8000-000000000002');
  });

  await asyncTest('creating a family member inserts a database-driven active record', async () => {
    const calls = [];
    const dbContext = {
      window: { supabase: true },
      supabase: { createClient: () => ({
        from: table => ({
          insert: payload => {
            calls.push({ table, payload });
            return { select: () => ({ single: async () => ({ data: { id: 'brian-id', display_name: 'Brian', active: true }, error: null }) }) };
          }
        })
      }) },
      SUPABASE_CONFIG: { URL: 'url', KEY: 'key' },
      console: { error() {} },
      getDefaultMemberId: () => 'cheryl-id'
    };
    vm.createContext(dbContext);
    vm.runInContext(dbSource, dbContext);
    const member = await dbContext.createFamilyMember('Brian');
    assert.deepEqual({ ...member }, { id: 'brian-id', displayName: 'Brian', active: true });
    assert.deepEqual(calls, [{ table: 'family_members', payload: [{ display_name: 'Brian', active: true }] }]);
  });

  console.log('\n11 focused family-member tests passed.');
}

runAsyncChecks().catch(error => {
  console.error(error);
  process.exit(1);
});
