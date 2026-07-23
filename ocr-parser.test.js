#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'ocr.js'), 'utf8');
const context = {
  console,
  generateId: () => 'test-recipe-id',
  MAIN_CATEGORIES: [
    'Chicken', 'Beef', 'Pork', 'Fish', 'Seafood', 'Salad', 'Soup',
    'Breakfast', 'Vegetarian', 'Dessert', 'Sweets', 'Appetizers',
    'Side Dish', 'Other'
  ],
  ETHNICITIES: ['American', 'Mexican', 'Italian', 'Asian', 'Mediterranean', 'Other']
};

vm.runInNewContext(
  `${source}\nthis.__ocrTests = { parseRecipeText, mergeParsedRecipePages, createDraftFromOCR };`,
  context
);

const { parseRecipeText, mergeParsedRecipePages, createDraftFromOCR } = context.__ocrTests;

const pancakeText = `
TEST KITCHEN RECIPE
Sunrise Lemon Pancakes
Category: Breakfast | Cuisine: American
Prep Time: 10 minutes | Cook Time: 15 minutes | Servings: 4

INGREDIENTS
2 cups all-purpose flour
2 tablespoons sugar
1 tablespoon baking powder
1/2 teaspoon salt
2 large eggs
1 3/4 cups whole milk
3 tablespoons melted butter
1 tablespoon lemon zest

DIRECTIONS
1. Whisk flour, sugar, baking powder, and salt.
2. Beat eggs with milk, melted butter, and lemon zest.
3. Stir wet ingredients into dry ingredients until just combined.
4. Cook 1/4-cup portions on a hot griddle for 2 minutes per side.
`;

const pancakes = parseRecipeText(pancakeText, 96.4);
assert.strictEqual(pancakes.title, 'Sunrise Lemon Pancakes');
assert.strictEqual(pancakes.cookTime, '15 minutes');
assert.strictEqual(pancakes.categories.main, 'Breakfast');
assert.strictEqual(pancakes.categories.ethnicity, 'American');
assert.match(pancakes.ingredients, /1 tablespoon lemon zest/);
assert.match(pancakes.instructions, /^1\. Whisk flour/m);
assert.match(pancakes.instructions, /^4\. Cook 1\/4-cup portions/m);
assert.strictEqual(pancakes.confidence, 96);

const stew = parseRecipeText(`
Grandma's Beef Stew
Cook Time: 2 hours
Ingredients
2 pounds beef chuck
3 cups potatoes
Directions
1. Brown the beef.
2. Add potatoes and cook until tender.
`);

assert.strictEqual(stew.title, "Grandma's Beef Stew");
assert.strictEqual(stew.cookTime, '2 hours');
assert.strictEqual(stew.categories.main, 'Beef');
assert.strictEqual(stew.categories.ethnicity, 'Other');

const merged = mergeParsedRecipePages([
  parseRecipeText(`
Two-Page Tomato Soup
Category: Soup
Ingredients
4 cups tomatoes
1 cup vegetable stock
`, 91),
  parseRecipeText(`
Directions
1. Combine the tomatoes and stock.
2. Cook for 20 minutes.
`, 89)
]);

assert.strictEqual(merged.title, 'Two-Page Tomato Soup');
assert.strictEqual(merged.categories.main, 'Soup');
assert.match(merged.ingredients, /4 cups tomatoes/);
assert.match(merged.instructions, /^2\. Cook for 20 minutes\./m);
assert.strictEqual(merged.confidence, 90);

assert.throws(
  () => parseRecipeText(''),
  /No readable text/
);

createDraftFromOCR(['image.jpg'], pancakes, 'Test Cook').then(draft => {
  assert.strictEqual(draft.name, 'Sunrise Lemon Pancakes');
  assert.strictEqual(draft.mainCategory, 'Breakfast');
  assert.strictEqual(draft.status, 'draft');
  assert.match(draft.notes, /^Ingredients\n/);
  assert.match(draft.notes, /\n\nInstructions\n/);
  assert.match(draft.ocrText, /Sunrise Lemon Pancakes/);
  console.log('OCR parser tests passed.');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
