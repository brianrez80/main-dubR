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
  `${source}\nthis.__ocrTests = { parseRecipeText, mergeParsedRecipePages, createDraftFromOCR, isLikelyOCRNoise, isPlausibleRecipeTitle, getOCRQualityWarning };`,
  context
);

const { parseRecipeText, mergeParsedRecipePages, createDraftFromOCR, isLikelyOCRNoise, isPlausibleRecipeTitle } = context.__ocrTests;

const pancakeText = `
LIVE OCR VERIFICATION RECIPE
°
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

const noisySocialPost = parseRecipeText(`
Garlic Butter Salmon and Shrimp
Ingredients
4 salmon fillets
1 pound large shrimp
2 tablespoons olive oil
%%%
3 cloves garlic, minced
1 cup heavy cream
Full recipe in the comments
@weeknightrecipes
XZQPVTR SKRRTT

Directions
1. Heat the olive oil in a skillet.
2. Add the salmon and shrimp.
<<< /// ===
3. Stir in the garlic and cream.
Full recipe in the comments
BLKQRTZZ
`);

assert.match(noisySocialPost.ingredients, /4 salmon fillets/);
assert.match(noisySocialPost.ingredients, /1 cup heavy cream/);
assert.doesNotMatch(noisySocialPost.ingredients, /full recipe|weeknightrecipes|XZQPVTR/i);
assert.match(noisySocialPost.instructions, /^3\. Stir in the garlic and cream\./m);
assert.doesNotMatch(noisySocialPost.instructions, /full recipe|BLKQRTZZ|<<<|===/i);

assert.strictEqual(isLikelyOCRNoise('406 MX @ ° 0 ® 5G. G'), true);
assert.strictEqual(isPlausibleRecipeTitle('406 MX @ ° 0 ® 5G. G'), false);

const lowQualityRecipe = parseRecipeText(`
406 MX @ ° 0 ® 5G. G
Ingredients
1 teaspoon dried oregano
Salt and pepper to taste
1 cup heavy cream
Directions
1. Stir the oregano into the cream.
`, 34);

assert.strictEqual(lowQualityRecipe.title, 'Untitled Recipe');
assert.match(lowQualityRecipe.ingredients, /1 teaspoon dried oregano/);
assert.match(lowQualityRecipe.ingredients, /Salt and pepper to taste/);
assert.match(lowQualityRecipe.ingredients, /1 cup heavy cream/);
assert.match(lowQualityRecipe.instructions, /Stir the oregano into the cream/);
assert.match(lowQualityRecipe.qualityWarning, /low recognition confidence|no reliable title/);

assert.throws(
  () => parseRecipeText(''),
  /No readable text/
);

const multiPageRecipe = mergeParsedRecipePages([
  parseRecipeText(`
406 MX @ ° 0 ® 5G. G
Preparation Time: 15 minutes | Cooking Time: 7 hours | Total Time: 7 hours 15 minutes
Ingredients
2 pounds chicken thighs
1 teaspoon dried oregano
`, 88),
  parseRecipeText(`
Slow Cooker Tuscan Chicken
Ingredients
1 cup heavy cream
Salt and pepper to taste
`, 91),
  parseRecipeText(`
Directions
1. Season the chicken with oregano.
2. Cook on low for 7 hours.
`, 90),
  parseRecipeText(`
3. Stir in the heavy cream before serving.
`, 89)
]);

assert.strictEqual(multiPageRecipe.title, 'Slow Cooker Tuscan Chicken');
assert.strictEqual(multiPageRecipe.cookTime, '7 hours');
assert.strictEqual(multiPageRecipe.metadata.prepTime, '15 minutes');
assert.strictEqual(multiPageRecipe.metadata.totalTime, '7 hours 15 minutes');
assert.strictEqual(multiPageRecipe.categories.main, 'Chicken');
assert.strictEqual(multiPageRecipe.categories.ethnicity, 'Italian');
assert.match(multiPageRecipe.ingredients, /1 teaspoon dried oregano/);
assert.match(multiPageRecipe.ingredients, /Salt and pepper to taste/);
assert.match(multiPageRecipe.ingredients, /1 cup heavy cream/);
assert.match(multiPageRecipe.instructions, /^3\. Stir in the heavy cream before serving\./m);
assert.doesNotMatch(
  `${multiPageRecipe.ingredients}\n${multiPageRecipe.instructions}`,
  /Preparation Time|Cooking Time|Total Time/
);

const reviewHandoffRecipe = mergeParsedRecipePages([
  parseRecipeText(`
Ingredients
2 pounds chicken thighs
Write a comment…
1 teaspoon dried oregano
Cooking Time 7 hours
Directions
1. Season the chicken.
Write a comment…
2. Cook on low for 7 hours.
`, 89),
  parseRecipeText(`
3. Stir in the heavy cream.
Like
4. Serve warm.
`, 90)
]);

assert.strictEqual(reviewHandoffRecipe.cookTime, '7 hours');
assert.match(reviewHandoffRecipe.ingredients, /2 pounds chicken thighs/);
assert.match(reviewHandoffRecipe.ingredients, /1 teaspoon dried oregano/);
assert.match(reviewHandoffRecipe.instructions, /^4\. Serve warm\./m);
assert.doesNotMatch(
  `${reviewHandoffRecipe.ingredients}\n${reviewHandoffRecipe.instructions}`,
  /Write a comment|^Like$|Cooking Time/im
);

createDraftFromOCR(['image.jpg'], pancakes, 'Test Cook').then(draft => {
  assert.strictEqual(draft.name, 'Sunrise Lemon Pancakes');
  assert.strictEqual(draft.mainCategory, 'Breakfast');
  assert.strictEqual(draft.status, 'draft');
  assert.match(draft.notes, /^Ingredients\n/);
  assert.match(draft.notes, /\n\nInstructions\n/);
  assert.match(draft.ocrText, /Sunrise Lemon Pancakes/);
  return createDraftFromOCR(
    ['https://example.test/recipe-original.jpg'],
    reviewHandoffRecipe,
    'Test Cook'
  );
}).then(reviewDraft => {
  assert.strictEqual(reviewDraft.time, '7 hours');
  assert.deepStrictEqual(reviewDraft.images, ['https://example.test/recipe-original.jpg']);
  assert.match(reviewDraft.notes, /^Ingredients\n/);
  assert.match(reviewDraft.notes, /4\. Serve warm\./);
  assert.doesNotMatch(reviewDraft.notes, /Write a comment|^Like$|Cooking Time/im);
  console.log('OCR parser tests passed.');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
