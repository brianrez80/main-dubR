// OCR Recipe Upload and Processing Workflow

// Initialize OCR module
let ocrState = {
  contributorName: '',
  uploadedFiles: [],
  processingRecipes: []
};

const OCR_SECTION_HEADINGS = {
  ingredients: /^(?:ingredients?|what you(?:'|’)ll need)\s*:?\s*$/i,
  instructions: /^(?:directions?|instructions?|method|preparation)\s*:?\s*$/i
};

const OCR_METADATA_LABELS = [
  'main category',
  'category',
  'cuisine',
  'ethnicity',
  'prep time',
  'preparation time',
  'cook time',
  'cooking time',
  'total time',
  'serving size',
  'servings',
  'yield'
];

const OCR_SOCIAL_PROMPT_PATTERNS = [
  /\b(?:full|complete)\s+recipe\s+(?:is\s+)?(?:in|on)\s+(?:the\s+)?comments?\b/i,
  /\brecipe\s+(?:is\s+)?(?:in|on)\s+(?:the\s+)?comments?\b/i,
  /\b(?:see|check)\s+(?:the\s+)?comments?\s+for\s+(?:the\s+)?(?:full\s+)?recipe\b/i,
  /\bcomment\s+['"]?(?:recipe|yes)['"]?\s+(?:below\s+)?(?:for|to get)\b/i,
  /\blink\s+in\s+(?:my\s+|the\s+)?bio\b/i,
  /\b(?:follow|like|share|save)\b.{0,40}\b(?:more|recipe|recipes)\b/i
];

function normalizeOCRText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanOCRLine(line) {
  return String(line || '')
    .replace(/^[•·▪◦*-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSocialPromptLine(line) {
  const cleaned = cleanOCRLine(line);
  return OCR_SOCIAL_PROMPT_PATTERNS.some(pattern => pattern.test(cleaned));
}

function isLikelyOCRNoise(line) {
  const cleaned = cleanOCRLine(line);
  if (!cleaned || isSocialPromptLine(cleaned)) return true;

  const compact = cleaned.replace(/\s/g, '');
  const readableCharacters = compact.match(/[\p{L}\p{N}]/gu) || [];
  const letters = compact.match(/\p{L}/gu) || [];
  const digits = compact.match(/\p{N}/gu) || [];

  if (readableCharacters.length < 2) return true;
  if (compact.length >= 6 && readableCharacters.length / compact.length < 0.35) return true;
  if (readableCharacters.length >= 5 && letters.length < 2) return true;
  if (digits.length >= letters.length && letters.length < 6) return true;

  const letterRuns = cleaned.toLowerCase().match(/[a-z]{7,}/g) || [];
  if (letterRuns.some(run => !/[aeiouy]/.test(run))) return true;

  return false;
}

function looksLikeIngredientLine(line) {
  return /^(?:\d+(?:[ /.]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(?:cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lb|grams?|g|kilograms?|kg|cloves?|cans?|packages?|large|medium|small)\b/i.test(cleanOCRLine(line));
}

function isPlausibleRecipeTitle(line) {
  const cleaned = cleanOCRLine(line);
  if (isLikelyOCRNoise(cleaned) || looksLikeIngredientLine(cleaned)) return false;
  if (cleaned.length < 3 || cleaned.length > 90) return false;

  const letters = cleaned.match(/[a-z]/gi) || [];
  const digits = cleaned.match(/\d/g) || [];
  const words = cleaned.match(/[a-z][a-z'-]*/gi) || [];
  const compact = cleaned.replace(/\s/g, '');

  if (letters.length < 3 || words.length === 0 || words.length > 12) return false;
  if (digits.length > letters.length / 2) return false;
  if (letters.length / Math.max(1, compact.length) < 0.45) return false;

  return !/^(?:ingredients?|directions?|instructions?|method|preparation)$/i.test(cleaned);
}

function extractLabeledValue(text, labels) {
  const labelPattern = labels
    .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const match = text.match(
    new RegExp(`(?:^|\\n|\\|)\\s*(?:${labelPattern})\\s*[:\\-]\\s*([^\\n|]+)`, 'i')
  );

  if (!match) return '';

  const nextLabelPattern = OCR_METADATA_LABELS
    .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  return match[1]
    .split(new RegExp(`\\s+(?=(?:${nextLabelPattern})\\s*[:\\-])`, 'i'))[0]
    .trim();
}

function getRecipeMetadata(text) {
  return {
    prepTime: extractLabeledValue(text, ['prep time', 'preparation time']),
    cookTime: extractLabeledValue(text, ['cook time', 'cooking time']),
    totalTime: extractLabeledValue(text, ['total time']),
    servings: extractLabeledValue(text, ['servings', 'serving size', 'yield'])
  };
}

function isOCRMetadataLine(line) {
  const cleaned = cleanOCRLine(line);
  return /^(?:prep(?:aration)? time|cook(?:ing)? time|total time|servings?|serving size|yield|main category|category|cuisine|ethnicity)\s*[:\-]/i.test(cleaned);
}

function findSectionIndex(lines, section) {
  return lines.findIndex(line => OCR_SECTION_HEADINGS[section].test(line));
}

function getSectionLines(lines, startIndex, endIndex) {
  if (startIndex < 0) return [];
  const end = endIndex > startIndex ? endIndex : lines.length;
  const sectionLines = [];

  for (const line of lines.slice(startIndex + 1, end)) {
    const cleaned = cleanOCRLine(line);
    if (isSocialPromptLine(cleaned)) break;
    if (isOCRMetadataLine(cleaned)) continue;
    if (!isLikelyOCRNoise(cleaned)) sectionLines.push(cleaned);
  }

  return sectionLines;
}

function formatInstructionLines(lines) {
  const steps = [];
  let numberedStep = '';

  lines.forEach(line => {
    const cleaned = cleanOCRLine(line);
    if (!cleaned) return;

    const numbered = cleaned.match(/^\d{1,2}[.)]\s*(.+)$/);
    if (numbered) {
      if (numberedStep) steps.push(numberedStep);
      numberedStep = numbered[1].trim();
      return;
    }

    if (numberedStep) {
      numberedStep += ` ${cleaned}`;
    } else {
      steps.push(cleaned);
    }
  });

  if (numberedStep) steps.push(numberedStep);

  return steps
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');
}

function getTitleCandidates(lines, text) {
  const firstSectionIndex = [findSectionIndex(lines, 'ingredients'), findSectionIndex(lines, 'instructions')]
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];
  const searchEnd = Number.isInteger(firstSectionIndex) ? firstSectionIndex : Math.min(lines.length, 6);

  return lines.slice(0, searchEnd).reduce((candidates, line, index) => {
    if (isOCRMetadataLine(line) || !isPlausibleRecipeTitle(line)) return candidates;
    if (/^(?:test kitchen recipe|recipe card|family recipe|recipe)$/i.test(line)) return candidates;
    if (/\brecipe\b/i.test(line) && /\b(?:test|verification|kitchen|family|cookbook|collection|card)\b/i.test(line)) return candidates;

    const words = line.match(/[a-z][a-z'-]*/gi) || [];
    const titleCaseWords = words.filter(word => /^[A-Z][a-z'-]*$/.test(word)).length;
    const score = (Number.isInteger(firstSectionIndex) ? 30 : 0)
      + Math.min(words.length, 7)
      + (titleCaseWords / Math.max(words.length, 1))
      - (index * 0.5);

    candidates.push({ title: cleanOCRLine(line), score });
    return candidates;
  }, []);
}

function findRecipeTitle(lines, text) {
  const explicitTitle = extractLabeledValue(text, ['recipe title', 'title']);
  if (explicitTitle && isPlausibleRecipeTitle(explicitTitle)) return explicitTitle;

  const candidates = getTitleCandidates(lines, text);
  return candidates.sort((a, b) => b.score - a.score)[0]?.title || 'Untitled Recipe';
}

function findBestRecipeTitle(pages) {
  const candidates = [];

  pages.forEach((page, pageIndex) => {
    const lines = String(page.rawText || '').split('\n').map(cleanOCRLine).filter(Boolean);
    getTitleCandidates(lines, page.rawText).forEach(candidate => {
      candidates.push({ ...candidate, pageIndex });
    });
  });

  return candidates
    .sort((a, b) => b.score - a.score || a.pageIndex - b.pageIndex)[0]
    ?.title || 'Untitled Recipe';
}

function normalizeMainCategory(explicitValue, text) {
  const direct = MAIN_CATEGORIES.find(
    category => category.toLowerCase() === String(explicitValue || '').toLowerCase()
  );
  if (direct) return direct;

  const haystack = `${explicitValue || ''}\n${text}`.toLowerCase();
  const categoryRules = [
    ['Chicken', /\b(?:chicken|turkey)\b/],
    ['Beef', /\b(?:beef|steak|hamburger|ground beef)\b/],
    ['Pork', /\b(?:pork|ham|bacon|sausage)\b/],
    ['Seafood', /\b(?:shrimp|prawn|crab|lobster|scallop|seafood)\b/],
    ['Fish', /\b(?:fish|salmon|tuna|cod|tilapia|trout)\b/],
    ['Salad', /\bsalad\b/],
    ['Soup', /\b(?:soup|stew|chowder|bisque)\b/],
    ['Breakfast', /\b(?:breakfast|pancake|waffle|omelet|omelette|french toast)\b/],
    ['Vegetarian', /\b(?:vegetarian|vegan|meatless)\b/],
    ['Dessert', /\b(?:dessert|cake|pie|tart|pudding|brownie|cheesecake)\b/],
    ['Sweets', /\b(?:cookie|candy|fudge|sweet)\b/],
    ['Appetizers', /\b(?:appetizer|starter|dip|canape|hors d'oeuvre)\b/],
    ['Side Dish', /\b(?:side dish|side|potatoes|rice|vegetables)\b/]
  ];

  return categoryRules.find(([, pattern]) => pattern.test(haystack))?.[0] || 'Other';
}

function normalizeEthnicity(explicitValue, text) {
  const direct = ETHNICITIES.find(
    ethnicity => ethnicity.toLowerCase() === String(explicitValue || '').toLowerCase()
  );
  if (direct) return direct;

  const haystack = `${explicitValue || ''}\n${text}`.toLowerCase();
  const explicitRules = [
    ['Mexican', /\b(?:mexican|mexico|tex-mex)\b/],
    ['Italian', /\b(?:italian|tuscan)\b/],
    ['Mediterranean', /\b(?:mediterranean|greek|middle eastern)\b/],
    ['Asian', /\b(?:asian|chinese|japanese|korean|thai|vietnamese|indian)\b/],
    ['American', /\b(?:american|southern|cajun|creole)\b/]
  ];

  const explicitMatch = explicitRules.find(([, pattern]) => pattern.test(haystack));
  if (explicitMatch) return explicitMatch[0];

  const pairedEvidence = [
    ['Mexican', [/\b(?:taco|enchilada|burrito|quesadilla)\b/, /\b(?:salsa|tortilla|cilantro|jalape[nñ]o)\b/]],
    ['Italian', [/\b(?:pasta|risotto|lasagna|marinara)\b/, /\b(?:parmesan|mozzarella|ricotta|basil)\b/]],
    ['Mediterranean', [/\b(?:feta|hummus|falafel|tzatziki)\b/, /\b(?:olive|lemon|chickpea|cucumber)\b/]],
    ['Asian', [/\b(?:soy sauce|sesame oil|teriyaki|miso)\b/, /\b(?:ginger|scallion|bok choy|rice vinegar)\b/]]
  ];

  return pairedEvidence.find(([, patterns]) => patterns.every(pattern => pattern.test(haystack)))?.[0] || 'Other';
}

function getOCRQualityWarning(recipe) {
  const detectedLines = [
    ...String(recipe.ingredients || '').split('\n').filter(Boolean),
    ...String(recipe.instructions || '').split('\n').filter(Boolean)
  ];
  const reasons = [];

  if (recipe.confidence < 60) reasons.push('low recognition confidence');
  if (recipe.title === 'Untitled Recipe') reasons.push('no reliable title');
  if (detectedLines.length < 2) reasons.push('too little recipe content');

  return reasons.length
    ? 'OCR may be inaccurate (' + reasons.join(', ') + '). Please review every field before saving.'
    : '';
}

function parseRecipeText(rawText, confidence = 0) {
  const text = normalizeOCRText(rawText);
  if (!text) {
    throw new Error('No readable text was found in the selected image.');
  }

  const lines = text.split('\n').map(cleanOCRLine).filter(Boolean);
  const ingredientsIndex = findSectionIndex(lines, 'ingredients');
  const instructionsIndex = findSectionIndex(lines, 'instructions');

  let ingredientLines = getSectionLines(lines, ingredientsIndex, instructionsIndex);
  let instructionLines = getSectionLines(lines, instructionsIndex, -1);

  if (ingredientLines.length === 0) ingredientLines = lines.filter(looksLikeIngredientLine);
  if (instructionLines.length === 0) {
    const instructionPattern = /^(?:\d{1,2}[.)]\s*)?(?:add|bake|beat|blend|boil|combine|cook|fold|heat|mix|place|pour|preheat|serve|stir|whisk)\b/i;
    instructionLines = lines.filter(line => instructionPattern.test(line));
  }

  const metadata = getRecipeMetadata(text);
  const categoryValue = extractLabeledValue(text, ['main category', 'category']);
  const ethnicityValue = extractLabeledValue(text, ['cuisine', 'ethnicity']);

  const recipe = {
    title: findRecipeTitle(lines, text),
    ingredients: ingredientLines.join('\n'),
    instructions: formatInstructionLines(instructionLines),
    cookTime: metadata.cookTime || metadata.totalTime || metadata.prepTime,
    metadata,
    categories: {
      main: normalizeMainCategory(categoryValue, text),
      ethnicity: normalizeEthnicity(ethnicityValue, text)
    },
    confidence: Number.isFinite(confidence) ? Math.round(confidence) : 0,
    rawText: text
  };

  recipe.qualityWarning = getOCRQualityWarning(recipe);
  return recipe;
}

function mergeParsedRecipePages(pages) {
  const uniqueIngredients = [];
  const instructionLines = [];
  let activeSection = '';
  let foundSectionContent = false;

  pages.forEach(page => {
    const lines = String(page.rawText || '').split('\n').map(cleanOCRLine).filter(Boolean);
    const firstSectionIndex = [findSectionIndex(lines, 'ingredients'), findSectionIndex(lines, 'instructions')]
      .filter(index => index >= 0)
      .sort((a, b) => a - b)[0];

    lines.forEach((line, index) => {
      if (Number.isInteger(firstSectionIndex) && index < firstSectionIndex) return;
      if (OCR_SECTION_HEADINGS.ingredients.test(line)) {
        activeSection = 'ingredients';
        foundSectionContent = true;
        return;
      }
      if (OCR_SECTION_HEADINGS.instructions.test(line)) {
        activeSection = 'instructions';
        foundSectionContent = true;
        return;
      }
      if (!activeSection || isOCRMetadataLine(line) || isLikelyOCRNoise(line)) return;

      if (activeSection === 'ingredients') {
        if (!uniqueIngredients.some(ingredient => ingredient.toLowerCase() === line.toLowerCase())) {
          uniqueIngredients.push(line);
        }
      } else {
        instructionLines.push(line);
      }
    });
  });

  if (!foundSectionContent) {
    pages.forEach(page => {
      String(page.ingredients || '').split('\n').filter(Boolean).forEach(ingredient => {
        if (!uniqueIngredients.some(existing => existing.toLowerCase() === ingredient.toLowerCase())) uniqueIngredients.push(ingredient);
      });
      String(page.instructions || '').split('\n').filter(Boolean).forEach(instruction => {
        instructionLines.push(instruction.replace(/^\d{1,2}[.)]\s*/, '').trim());
      });
    });
  }

  const metadata = pages.reduce((result, page) => ({
    prepTime: result.prepTime || page.metadata?.prepTime || '',
    cookTime: result.cookTime || page.metadata?.cookTime || '',
    totalTime: result.totalTime || page.metadata?.totalTime || '',
    servings: result.servings || page.metadata?.servings || ''
  }), { prepTime: '', cookTime: '', totalTime: '', servings: '' });
  const confidenceValues = pages.map(page => page.confidence).filter(Number.isFinite);
  const mergedText = pages.map(page => page.rawText).filter(Boolean).join('\n\n');
  const mergedRecipe = {
    title: findBestRecipeTitle(pages),
    ingredients: uniqueIngredients.join('\n'),
    instructions: formatInstructionLines(instructionLines),
    cookTime: metadata.cookTime || metadata.totalTime || metadata.prepTime,
    metadata,
    categories: {
      main: normalizeMainCategory('', mergedText),
      ethnicity: normalizeEthnicity('', mergedText)
    },
    confidence: confidenceValues.length
      ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
      : 0,
    rawText: mergedText
  };

  mergedRecipe.qualityWarning = getOCRQualityWarning(mergedRecipe);
  return mergedRecipe;
}

async function loadImageForOCR(file) {
  if (typeof window.createImageBitmap === 'function') {
    try {
      return await window.createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (error) {
      return await window.createImageBitmap(file);
    }
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The selected image could not be opened.'));
    };
    image.src = objectUrl;
  });
}

async function preprocessImageForOCR(file) {
  const source = await loadImageForOCR(file);
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error('The selected image has no readable dimensions.');

  const longestSide = Math.max(sourceWidth, sourceHeight);
  const scale = longestSide < 1800
    ? Math.min(2, 1800 / longestSide)
    : Math.min(1, 2600 / longestSide);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Your browser could not prepare this image for OCR.');

  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (typeof source.close === 'function') source.close();

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const grayscale = (pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114);
    const contrastAdjusted = Math.max(0, Math.min(255, ((grayscale - 128) * 1.35) + 136));
    pixels[index] = contrastAdjusted;
    pixels[index + 1] = contrastAdjusted;
    pixels[index + 2] = contrastAdjusted;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

async function performOCR(imageFiles, onProgress) {
  const files = Array.from(
    Array.isArray(imageFiles) ? imageFiles : [imageFiles]
  ).filter(Boolean);

  if (files.length === 0) {
    throw new Error('Please select at least one image.');
  }

  if (!window.Tesseract?.createWorker) {
    throw new Error('The OCR engine did not load. Check your connection and refresh the page.');
  }

  let currentImageIndex = 1;
  const reportProgress = typeof onProgress === 'function' ? onProgress : () => {};
  const oem = window.Tesseract.OEM?.LSTM_ONLY ?? 1;
  const worker = await window.Tesseract.createWorker('eng', oem, {
    logger(message) {
      reportProgress({
        status: message.status || 'Loading OCR engine',
        progress: Number.isFinite(message.progress) ? message.progress : 0,
        imageIndex: currentImageIndex,
        imageCount: files.length
      });
    }
  });

  const recognizedPages = [];

  try {
    if (typeof worker.setParameters === 'function') {
      await worker.setParameters({
        tessedit_pageseg_mode: window.Tesseract.PSM?.AUTO ?? 3,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300'
      });
    }

    for (let index = 0; index < files.length; index += 1) {
      currentImageIndex = index + 1;
      reportProgress({
        status: 'Preparing image for OCR',
        progress: 0,
        imageIndex: currentImageIndex,
        imageCount: files.length
      });

      let ocrImage = files[index];
      try {
        ocrImage = await preprocessImageForOCR(files[index]);
      } catch (error) {
        console.warn('Image preprocessing failed; using the original image.', error);
      }

      console.log(`Performing OCR on ${files[index].name}`);
      const { data } = await worker.recognize(ocrImage, { rotateAuto: true });
      if (data?.text?.trim()) {
        recognizedPages.push(parseRecipeText(data.text, data.confidence));
      }
    }
  } finally {
    await worker.terminate();
  }

  if (recognizedPages.length === 0) {
    throw new Error('No readable text was found in the selected image.');
  }

  return mergeParsedRecipePages(recognizedPages);
}

// Create draft recipe from OCR data
async function createDraftFromOCR(images, ocrData, contributorName) {
  const noteSections = [];
  if (ocrData.ingredients) {
    noteSections.push(`Ingredients\n${ocrData.ingredients}`);
  }
  if (ocrData.instructions) {
    noteSections.push(`Instructions\n${ocrData.instructions}`);
  }
  if (noteSections.length === 0 && ocrData.rawText) {
    noteSections.push(ocrData.rawText);
  }

  const recipe = {
    id: generateId(),
    name: ocrData.title || 'Untitled Recipe',
    time: ocrData.cookTime || '',
    mainCategory: ocrData.categories?.main || '',
    ethnicity: ocrData.categories?.ethnicity || '',
    notes: noteSections.join('\n\n'),
    status: 'draft',
    ocrText: JSON.stringify(ocrData),
    contributorName: contributorName || 'Anonymous',
    reviewedBy: null,
    reviewedAt: null,
    images: images
  };

  return recipe;
}

// Submit OCR recipe for review
async function submitOCRRecipe(recipe) {
  try {
    await saveNewRecipe(recipe);
    console.log('Recipe submitted for review:', recipe.id);
    return recipe.id;
  } catch (error) {
    console.error('Error submitting OCR recipe:', error);
    throw error;
  }
}

// Approve and publish draft recipe
async function approveDraftRecipe(recipeId, editorName, updates) {
  try {
    const now = new Date().toISOString();
    const updatedRecipe = {
      ...updates,
      status: 'approved',
      reviewedBy: editorName,
      reviewedAt: now
    };

    await updateRecipe(recipeId, updatedRecipe);
    console.log('Recipe approved and published:', recipeId);
    return true;
  } catch (error) {
    console.error('Error approving recipe:', error);
    throw error;
  }
}

// Render OCR upload form
function renderOCRUploadForm() {
  if (!ui.ocrUploadPanel) return;

  const form = ui.ocrUploadPanel.querySelector('[data-ocr-form]');
  if (!form) return;

  form.innerHTML = `
    <form id="ocrUploadForm" class="form">
      <div class="form-section full">
        <label for="contributorName">Your Name (for credit)</label>
        <input type="text" id="contributorName" name="contributorName" 
               placeholder="Optional" maxlength="100">
      </div>

      <div class="form-section full">
        <label for="ocrImages">Upload Recipe Images (JPG, PNG, WebP)</label>
        <input type="file" id="ocrImages" name="ocrImages"
               accept="image/jpeg,image/png,image/webp" multiple required>
        <small>Upload up to 4 clear JPG, PNG, or WebP images. OCR runs privately in your browser.</small>
      </div>

      <div class="form-actions full">
        <button type="button" class="btn secondary" data-cancel-ocr>Cancel</button>
        <button type="submit" class="btn save">Upload & Process with OCR</button>
      </div>
    </form>

    <div id="ocrProgress" class="hidden">
      <div class="progress-bar">
        <div class="progress-fill" style="width: 0%"></div>
      </div>
      <p id="ocrStatus">Processing images...</p>
    </div>
  `;

  const ocrForm = document.getElementById('ocrUploadForm');
  if (ocrForm) {
    ocrForm.addEventListener('submit', handleOCRUpload);
  }

  const cancelBtn = form.querySelector('[data-cancel-ocr]');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      hideAllPanels();
      showPanel(ui.homeView);
    });
  }
}

// Handle OCR upload
async function handleOCRUpload(event) {
  event.preventDefault();

  const contributorNameInput = document.getElementById('contributorName');
  const ocrImagesInput = document.getElementById('ocrImages');
  
  if (!contributorNameInput || !ocrImagesInput) return;

  const contributorName = contributorNameInput.value.trim() || 'Anonymous';
  const files = Array.from(ocrImagesInput.files);
  const submitButton = event.submitter;

  if (files.length === 0) {
    alert('Please select at least one image.');
    return;
  }

  if (files.length > 4) {
    alert('Please upload no more than 4 recipe images at a time.');
    return;
  }

  const supportedImage = file => (
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    /\.(?:jpe?g|png|webp)$/i.test(file.name)
  );
  const unsupportedFile = files.find(file => !supportedImage(file));
  if (unsupportedFile) {
    alert(`${unsupportedFile.name} is not a supported image. Please use JPG, PNG, or WebP.`);
    return;
  }

  const oversizedFile = files.find(file => file.size > 12 * 1024 * 1024);
  if (oversizedFile) {
    alert(`${oversizedFile.name} is larger than 12 MB. Please use a smaller image.`);
    return;
  }

  // Show progress
  const progressDiv = document.getElementById('ocrProgress');
  const statusText = document.getElementById('ocrStatus');
  const progressFill = progressDiv?.querySelector('.progress-fill');
  if (progressDiv) {
    progressDiv.classList.remove('hidden');
  }
  if (progressFill) {
    progressFill.style.width = '0%';
  }
  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const recipeId = generateId();

    // Extract text locally before uploading, so failed OCR does not leave orphaned images.
    if (statusText) statusText.textContent = 'Loading OCR engine...';
    const ocrResults = await performOCR(files, progress => {
      const overallProgress = (
        (progress.imageIndex - 1 + progress.progress) / progress.imageCount
      );
      const percent = Math.max(0, Math.min(100, Math.round(overallProgress * 100)));
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (statusText) {
        statusText.textContent = `${progress.status} — image ${progress.imageIndex} of ${progress.imageCount} (${percent}%)`;
      }
    });

    // Store the original images after OCR succeeds.
    if (statusText) statusText.textContent = 'Uploading original images...';
    const imageUrls = await uploadSelectedImages(recipeId, files);

    if (!imageUrls) {
      throw new Error('Failed to upload images.');
    }

    // Create draft recipe
    if (statusText) statusText.textContent = 'Creating recipe...';
    const draftRecipe = await createDraftFromOCR(imageUrls, ocrResults, contributorName);

    // Submit for review
    await submitOCRRecipe(draftRecipe);
    if (Array.isArray(recipes)) {
      recipes.push(draftRecipe);
    }

    if (statusText) statusText.textContent = 'Recipe submitted for review!';
    if (progressFill) progressFill.style.width = '100%';
    
    alert('Recipe submitted for review! An editor will review and approve it shortly.');

    // Reset and go back to home
    setTimeout(() => {
      if (progressDiv) progressDiv.classList.add('hidden');
      hideAllPanels();
      showPanel(ui.homeView);
      ocrImagesInput.value = '';
      if (contributorNameInput) contributorNameInput.value = '';
    }, 2000);

  } catch (error) {
    console.error('OCR upload error:', error);
    if (statusText) {
      statusText.textContent = `Error: ${error.message}`;
    }
    alert(`Error processing recipe: ${error.message}`);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}
