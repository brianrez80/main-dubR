// Trixie Nexus Import Center — Phase 2 UI interactions only.
// Files are represented locally in the interface; no upload or AI processing occurs yet.

function initializeNexus() {
  const panel = document.getElementById('nexusPanel');
  if (!panel || panel.dataset.initialized === 'true') return;

  const dropzone = panel.querySelector('[data-nexus-dropzone]');
  const fileInput = panel.querySelector('#nexusFileInput');
  const browseButton = panel.querySelector('[data-nexus-browse]');
  const closeButton = panel.querySelector('[data-nexus-close]');

  panel.dataset.initialized = 'true';
  browseButton.addEventListener('click', (event) => {
    event.stopPropagation();
    fileInput.click();
  });
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
  }));
  dropzone.addEventListener('drop', event => addNexusSources(event.dataTransfer.files, panel));
  fileInput.addEventListener('change', () => {
    addNexusSources(fileInput.files, panel);
    fileInput.value = '';
  });
  closeButton.addEventListener('click', () => {
    hideAllPanels();
    showPanel(ui.homeView);
  });
}

function addNexusSources(fileList, panel) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const sourceList = panel.querySelector('[data-source-list]');
  files.forEach(file => sourceList.appendChild(createNexusSource(file)));
  panel.querySelector('[data-source-count]').textContent = sourceList.children.length;
  showNexusProgress(files[0], panel);
}

function createNexusSource(file) {
  const extension = (file.name.split('.').pop() || 'FILE').toUpperCase();
  const iconType = /PNG|JPG|JPEG|WEBP|GIF/.test(extension)
    ? 'img'
    : /DOC|DOCX/.test(extension) ? 'doc' : /TXT/.test(extension) ? 'txt' : extension.toLowerCase();
  const size = file.size > 1048576
    ? `${(file.size / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(file.size / 1024))} KB`;
  const item = document.createElement('article');
  item.className = 'source-item is-learning';

  const icon = document.createElement('span');
  icon.className = `source-icon source-icon-${iconType}`;
  icon.textContent = extension.slice(0, 4);
  const details = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = file.name;
  const meta = document.createElement('small');
  meta.textContent = `${extension} · ${size}`;
  details.append(name, meta);
  const status = document.createElement('span');
  status.className = 'source-status';
  status.title = 'Preparing';
  status.innerHTML = '<i></i>';
  item.append(icon, details, status);
  return item;
}

function showNexusProgress(file, panel) {
  const name = panel.querySelector('[data-progress-name]');
  const status = panel.querySelector('[data-progress-status]');
  const percent = panel.querySelector('[data-progress-percent]');
  const bar = panel.querySelector('[data-nexus-progress]');
  name.textContent = file.name;
  status.textContent = 'Preparing your source...';
  percent.textContent = '24%';
  bar.style.width = '24%';

  // A short visual preview of the future import journey; intentionally no processing.
  window.setTimeout(() => {
    if (!panel.isConnected) return;
    percent.textContent = '68%';
    bar.style.width = '68%';
    status.textContent = 'Organizing content preview...';
  }, 700);
}
