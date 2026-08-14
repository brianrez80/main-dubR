// Android Web Share Target handoff. The PWA launches this page with GET params.
function getSharedRecipeTarget(search) {
  const params = new URLSearchParams(search || '');
  const url = String(params.get('share-url') || '').trim();
  const text = String(params.get('share-text') || '').trim();
  const title = String(params.get('share-title') || '').trim();
  const textUrl = (text.match(/https?:\/\/[^\s<>"']+/i) || [])[0]?.replace(/[.,;:!?]+$/, '') || '';
  return { url: url || textUrl, title };
}

async function importSharedRecipeTarget() {
  const shared = getSharedRecipeTarget(window.location.search);
  if (!shared.url) return;

  try {
    const draftRecipe = await createRecipeLinkDraft(shared.url, shared.title);
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    hideAllPanels();
    showReviewComparison(draftRecipe);
  } catch (error) {
    hideAllPanels();
    showPanel(ui.nexusPanel);
    const form = ui.nexusPanel?.querySelector('[data-nexus-url-form]');
    openNexusRecipeLinkForm(form);
    const status = form?.querySelector('[data-nexus-url-status]');
    if (status) status.textContent = error?.message || 'That shared link could not be imported.';
  }
}

window.addEventListener('recipe-box-ready', () => { void importSharedRecipeTarget(); }, { once: true });
