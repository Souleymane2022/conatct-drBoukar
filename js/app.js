/**
 * Application Frontend - CardVault
 */

// URL de base de l'API
const API_URL = ''; // URL relative (le backend sert le frontend statiquement)

// État Global de l'Application
const state = {
  cards: [],
  tags: [],
  selectedTag: null,
  searchQuery: '',
  currentCard: null,
  uploadedFile: null,
  ocrCanvas: null
};

// Références DOM
const DOM = {
  // Navigation / Vues
  navAll: document.getElementById('nav-all'),
  btnOpenUpload: document.getElementById('btn-open-upload'),
  sidebarTags: document.getElementById('sidebar-tags'),
  cardsGrid: document.getElementById('cards-grid'),
  emptyState: document.getElementById('empty-state'),
  cardsCount: document.getElementById('cards-count'),
  viewTitle: document.getElementById('view-title'),
  activeTagIndicator: document.getElementById('active-tag-indicator'),
  activeTagName: document.getElementById('active-tag-name'),
  btnClearTag: document.getElementById('btn-clear-tag'),
  
  // Recherche
  searchInput: document.getElementById('search-input'),
  clearSearch: document.getElementById('clear-search'),
  
  // Modal Upload & OCR
  uploadModal: document.getElementById('upload-modal'),
  btnCloseUpload: document.getElementById('btn-close-upload'),
  stepUpload: document.getElementById('step-upload'),
  stepOcrProgress: document.getElementById('step-ocr-progress'),
  stepReview: document.getElementById('step-review'),
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  rawTextInput: document.getElementById('raw-text-input'),
  btnProcessText: document.getElementById('btn-process-text'),
  btnBackUpload: document.getElementById('btn-back-upload'),
  
  // OCR Progress
  ocrStatusText: document.getElementById('ocr-status-text'),
  ocrProgressFill: document.getElementById('ocr-progress-fill'),
  ocrProgressPercent: document.getElementById('ocr-progress-percent'),
  
  // Review Form
  documentPreviewContainer: document.getElementById('document-preview-container'),
  reviewRawText: document.getElementById('review-raw-text'),
  cardForm: document.getElementById('card-form'),
  formCardId: document.getElementById('form-card-id'),
  formName: document.getElementById('form-name'),
  formCompany: document.getElementById('form-company'),
  formJob: document.getElementById('form-job'),
  formPhone: document.getElementById('form-phone'),
  formEmail: document.getElementById('form-email'),
  formWebsite: document.getElementById('form-website'),
  formAddress: document.getElementById('form-address'),
  formTags: document.getElementById('form-tags'),
  btnSaveCard: document.getElementById('btn-save-card'),
  btnEmptyAdd: document.getElementById('btn-empty-add'),
  
  // Modal Détails
  detailModal: document.getElementById('detail-modal'),
  btnCloseDetail: document.getElementById('btn-close-detail'),
  btnEditCard: document.getElementById('btn-edit-card'),
  btnDeleteCard: document.getElementById('btn-delete-card'),
  detailAvatarInit: document.getElementById('detail-avatar-init'),
  detailName: document.getElementById('detail-name'),
  detailJobCompany: document.getElementById('detail-job-company'),
  detailPhone: document.getElementById('detail-phone'),
  detailPhoneRow: document.getElementById('detail-phone-row'),
  detailEmail: document.getElementById('detail-email'),
  detailEmailRow: document.getElementById('detail-email-row'),
  detailWebsite: document.getElementById('detail-website'),
  detailWebsiteRow: document.getElementById('detail-website-row'),
  detailAddress: document.getElementById('detail-address'),
  detailAddressRow: document.getElementById('detail-address-row'),
  detailTags: document.getElementById('detail-tags'),
  detailCreatedAt: document.getElementById('detail-created-at'),
  btnDownloadOriginal: document.getElementById('btn-download-original'),
  detailFileViewer: document.getElementById('detail-file-viewer'),
  // Toasts
  toastContainer: document.getElementById('toast-container'),

  // Login Overlay
  loginOverlay: document.getElementById('login-overlay'),
  loginForm: document.getElementById('login-form'),
  loginCode: document.getElementById('login-code')
};

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  checkAuthentication();
});

// Toast System
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-circle-exclamation';
  if (type === 'info') icon = 'fa-circle-info';
  
  toast.innerHTML = `
    <i class="fa-solid ${icon} toast-icon"></i>
    <span class="toast-message">${message}</span>
  `;
  
  DOM.toastContainer.appendChild(toast);
  
  // Retirer après 4 secondes
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s reverse forwards ease';
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4000);
}

// Vérifier l'état de l'authentification
function checkAuthentication() {
  const token = sessionStorage.getItem('cardvault_token');
  if (token) {
    DOM.loginOverlay.classList.remove('active');
    loadDashboardData();
  } else {
    DOM.loginOverlay.classList.add('active');
  }
}

// Récupérer les en-têtes d'authentification
function getAuthHeaders() {
  const token = sessionStorage.getItem('cardvault_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

let apiTested = false;

// Charger les cartes et tags depuis l'API ou LocalStorage
async function loadDashboardData() {
  if (!apiTested) {
    try {
      const response = await fetch(`${API_URL}/api/cards`);
      // Si la route répond 200 ou 401/403 (authentification requise), le serveur est bien présent
      if (response.ok || response.status === 401 || response.status === 403) {
        state.useLocalStorage = false;
      } else {
        state.useLocalStorage = true;
        showToast("Mode Statique détecté : Vos données seront sauvegardées dans votre navigateur.", "info");
      }
    } catch (e) {
      state.useLocalStorage = true;
      showToast("Mode Statique détecté : Vos données seront sauvegardées dans votre navigateur.", "info");
    }
    apiTested = true;
  }

  if (state.useLocalStorage) {
    loadDashboardFromLocalStorage();
    return;
  }

  try {
    let url = `${API_URL}/api/cards`;
    const params = [];
    if (state.searchQuery) params.push(`search=${encodeURIComponent(state.searchQuery)}`);
    if (state.selectedTag) params.push(`tag=${encodeURIComponent(state.selectedTag)}`);
    
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Impossible de charger les cartes.');
    state.cards = await response.json();
    
    // Charger aussi la liste complète des tags pour la sidebar
    const tagsResponse = await fetch(`${API_URL}/api/tags`, { headers: getAuthHeaders() });
    if (tagsResponse.ok) {
      state.tags = await tagsResponse.json();
    }
    
    renderDashboard();
    renderSidebarTags();
  } catch (error) {
    console.error(error);
    showToast("Erreur de chargement des données.", 'error');
  }
}

// Fonction de chargement locale (Fallback pour Vercel/hors-ligne)
function loadDashboardFromLocalStorage() {
  const storedCards = localStorage.getItem('cardvault_cards');
  let cards = storedCards ? JSON.parse(storedCards) : [];
  
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    cards = cards.filter(c => 
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.company && c.company.toLowerCase().includes(q)) ||
      (c.job_title && c.job_title.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.raw_text && c.raw_text.toLowerCase().includes(q))
    );
  }
  
  if (state.selectedTag) {
    cards = cards.filter(c => {
      if (!c.tags) return false;
      return c.tags.split(',').map(t => t.trim().toLowerCase()).includes(state.selectedTag.toLowerCase());
    });
  }
  
  state.cards = cards;
  
  const allCards = storedCards ? JSON.parse(storedCards) : [];
  const tagSet = new Set();
  allCards.forEach(c => {
    if (c.tags) {
      c.tags.split(',').forEach(tag => {
        const cleaned = tag.trim();
        if (cleaned) tagSet.add(cleaned);
      });
    }
  });
  state.tags = Array.from(tagSet);
  
  renderDashboard();
  renderSidebarTags();
}

// Rendu des cartes de visite sur le tableau de bord
function renderDashboard() {
  DOM.cardsCount.textContent = state.cards.length;
  DOM.cardsGrid.innerHTML = '';
  
  if (state.cards.length === 0) {
    DOM.cardsGrid.style.display = 'none';
    DOM.emptyState.style.display = 'flex';
    return;
  }
  
  DOM.cardsGrid.style.display = 'grid';
  DOM.emptyState.style.display = 'none';

  state.cards.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-item';
    cardEl.addEventListener('click', () => openDetailModal(card));

    // Initiales pour l'avatar
    const initials = card.name
      .split(' ')
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    // Rendre les badges
    const tagsHtml = card.tags
      ? card.tags.split(',').map(tag => `<span class="badge">${tag.trim()}</span>`).join('')
      : '';

    cardEl.innerHTML = `
      <div class="card-header">
        <div class="card-avatar">${initials || '??'}</div>
        <div class="card-title-block">
          <h4>${escapeHTML(card.name)}</h4>
          <p>${escapeHTML(card.company || 'Sans entreprise')}</p>
        </div>
      </div>
      <div class="card-body">
        ${card.job_title ? `<div class="info-line"><i class="fa-solid fa-briefcase"></i> <span>${escapeHTML(card.job_title)}</span></div>` : ''}
        ${card.phone ? `<div class="info-line"><i class="fa-solid fa-phone"></i> <span>${escapeHTML(card.phone)}</span></div>` : ''}
        ${card.email ? `<div class="info-line"><i class="fa-solid fa-envelope"></i> <span>${escapeHTML(card.email)}</span></div>` : ''}
      </div>
      ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
    `;

    DOM.cardsGrid.appendChild(cardEl);
  });
}

// Rendu de la liste des tags dans la sidebar
function renderSidebarTags() {
  DOM.sidebarTags.innerHTML = '';
  
  if (state.tags.length === 0) {
    DOM.sidebarTags.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-muted); padding: 8px;">Aucun tag créé</p>';
    return;
  }

  state.tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = `tag-btn ${state.selectedTag === tag ? 'active' : ''}`;
    btn.innerHTML = `
      <span># ${escapeHTML(tag)}</span>
    `;
    btn.addEventListener('click', () => selectTagFilter(tag));
    DOM.sidebarTags.appendChild(btn);
  });
}

// Sélectionner un filtre de tag
function selectTagFilter(tag) {
  if (state.selectedTag === tag) {
    state.selectedTag = null; // Désélectionner si déjà actif
    DOM.activeTagIndicator.style.display = 'none';
  } else {
    state.selectedTag = tag;
    DOM.activeTagName.textContent = tag;
    DOM.activeTagIndicator.style.display = 'flex';
  }
  loadDashboardData();
}

// Configurer les écouteurs d'événements DOM
function initEventListeners() {
  // Filtres sidebar
  DOM.navAll.addEventListener('click', () => {
    state.selectedTag = null;
    state.searchQuery = '';
    DOM.searchInput.value = '';
    DOM.clearSearch.style.display = 'none';
    DOM.activeTagIndicator.style.display = 'none';
    loadDashboardData();
  });
  
  DOM.btnClearTag.addEventListener('click', () => {
    state.selectedTag = null;
    DOM.activeTagIndicator.style.display = 'none';
    loadDashboardData();
  });

  // Barre de recherche
  let searchTimeout;
  DOM.searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    state.searchQuery = val;
    DOM.clearSearch.style.display = val ? 'block' : 'none';
    
    // Debounce recherche
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadDashboardData();
    }, 30000000 /* large pour éviter trop d'appels, mais en local 250ms suffit */);
    
    // En local, on peut le faire en temps réel à 250ms :
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadDashboardData, 250);
  });

  DOM.clearSearch.addEventListener('click', () => {
    DOM.searchInput.value = '';
    state.searchQuery = '';
    DOM.clearSearch.style.display = 'none';
    loadDashboardData();
  });

  // Modal Ajout / OCR
  DOM.btnOpenUpload.addEventListener('click', () => openUploadModal());
  DOM.btnEmptyAdd.addEventListener('click', () => openUploadModal());
  DOM.btnCloseUpload.addEventListener('click', () => closeUploadModal());
  
  // Drag & Drop
  ['dragenter', 'dragover'].forEach(eventName => {
    DOM.dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      DOM.dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    DOM.dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      DOM.dropZone.classList.remove('dragover');
    }, false);
  });

  DOM.dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFileInput(files[0]);
    }
  });

  DOM.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileInput(e.target.files[0]);
    }
  });

  // Coller texte brut
  DOM.btnProcessText.addEventListener('click', () => {
    const rawText = DOM.rawTextInput.value;
    if (!rawText.trim()) {
      showToast("Veuillez coller du texte avant de valider !", "error");
      return;
    }
    processRawText(rawText);
  });

  DOM.btnBackUpload.addEventListener('click', () => {
    resetUploadModalSteps();
  });

  // Soumission formulaire (Créer ou Modifier)
  DOM.cardForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCard();
  });

  // Modal Détails
  DOM.btnCloseDetail.addEventListener('click', () => {
    DOM.detailModal.classList.remove('active');
    state.currentCard = null;
  });

  DOM.btnEditCard.addEventListener('click', () => {
    if (state.currentCard) {
      openEditMode(state.currentCard);
    }
  });

  DOM.btnDeleteCard.addEventListener('click', async () => {
    if (state.currentCard && confirm(`Voulez-vous vraiment supprimer la carte de ${state.currentCard.name} ?`)) {
      await deleteCard(state.currentCard.id);
    }
  });

  // Soumission du code d'accès de connexion
  DOM.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = DOM.loginCode.value.trim();
    
    // Si on est en mode LocalStorage ou hors ligne (sans API fonctionnelle), on valide localement
    if (state.useLocalStorage) {
      if (code === 'Michel2026') {
        sessionStorage.setItem('cardvault_token', 'Michel2026');
        DOM.loginOverlay.classList.remove('active');
        showToast("Accès déverrouillé !");
        loadDashboardData();
      } else {
        showToast("Code d'accès incorrect.", "error");
      }
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      if (res.ok) {
        const data = await res.json();
        sessionStorage.setItem('cardvault_token', data.token);
        DOM.loginOverlay.classList.remove('active');
        showToast("Accès déverrouillé !");
        loadDashboardData();
      } else {
        showToast("Code d'accès incorrect.", "error");
      }
    } catch (err) {
      // Fallback local en cas d'erreur de connexion réseau sur l'API login
      if (code === 'Michel2026') {
        sessionStorage.setItem('cardvault_token', 'Michel2026');
        state.useLocalStorage = true;
        DOM.loginOverlay.classList.remove('active');
        showToast("Mode hors-ligne activé.", "info");
        loadDashboardData();
      } else {
        showToast("Erreur de connexion et code incorrect.", "error");
      }
    }
  });
}

// Gérer l'ouverture du modal de création
function openUploadModal() {
  resetUploadModalSteps();
  DOM.uploadModal.classList.add('active');
}

function closeUploadModal() {
  DOM.uploadModal.classList.remove('active');
}

function resetUploadModalSteps() {
  state.uploadedFile = null;
  state.ocrCanvas = null;
  DOM.fileInput.value = '';
  DOM.rawTextInput.value = '';
  DOM.formCardId.value = '';
  DOM.cardForm.reset();
  
  DOM.stepUpload.classList.add('active');
  DOM.stepOcrProgress.classList.remove('active');
  DOM.stepReview.classList.remove('active');
  DOM.documentPreviewContainer.innerHTML = '';
}

// Analyser un fichier téléversé (Image ou PDF)
// Analyser un fichier téléversé (Image ou PDF)
async function handleFileInput(file) {
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';
  
  if (!isImage && !isPdf) {
    showToast("Type de fichier non supporté. Sélectionnez une image ou un PDF.", "error");
    return;
  }

  // Activer l'étape de chargement/OCR
  DOM.stepUpload.classList.remove('active');
  DOM.stepOcrProgress.classList.add('active');

  let fileToProcess = file;

  if (isImage) {
    updateOcrProgress("Optimisation de l'image...", 0.05);
    try {
      // Compresser l'image à 1200px max de large pour éviter la limite Vercel de 4.5MB
      fileToProcess = await compressImage(file);
      console.log(`Image optimisée. Taille originale: ${(file.size / 1024 / 1024).toFixed(2)}MB, Nouvelle taille: ${(fileToProcess.size / 1024 / 1024).toFixed(2)}MB`);
    } catch (compressErr) {
      console.warn("Échec de compression, utilisation de l'original:", compressErr);
    }
  }

  state.uploadedFile = fileToProcess;
  
  // Préparer l'affichage de l'image locale immédiatement pour l'aperçu
  let canvas = null;
  if (isImage) {
    const imageUrl = URL.createObjectURL(fileToProcess);
    const img = document.createElement('img');
    img.src = imageUrl;
    DOM.documentPreviewContainer.innerHTML = '';
    DOM.documentPreviewContainer.appendChild(img);
  }

  // Tenter l'analyse intelligente avec l'API Gemini via le backend si on n'est pas en localStorage
  if (!state.useLocalStorage) {
    try {
      updateOcrProgress("Analyse de la mise en page (Gemini AI)...", 0.3);
      
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_URL}/api/cards/analyze`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result && !result.useFallback) {
          // Gemini a extrait avec succès les données structurées !
          updateOcrProgress("Analyse terminée avec succès !", 1.0);
          showReviewStepWithData(result.data);
          
          // Si c'est un PDF, faire quand même le rendu canvas pour l'aperçu
          if (isPdf) {
            try {
              const arrayBuffer = await file.arrayBuffer();
              const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
              const page = await pdf.getPage(1);
              const viewport = page.getViewport({ scale: 1.5 });
              canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              await page.render({ canvasContext: context, viewport: viewport }).promise;
              state.ocrCanvas = canvas;
              DOM.documentPreviewContainer.innerHTML = '';
              DOM.documentPreviewContainer.appendChild(canvas);
            } catch (pdfErr) {
              console.warn("Échec du rendu du PDF pour l'aperçu:", pdfErr);
              DOM.documentPreviewContainer.innerHTML = '<div style="font-size: 3rem; color: var(--text-muted);"><i class="fa-solid fa-file-pdf"></i></div>';
            }
          }
          return; // Succès Gemini, on s'arrête ici !
        }
      }
    } catch (err) {
      console.warn("L'analyse intelligente Gemini a échoué, passage au fallback local Tesseract:", err);
    }
  }

  // Fallback : OCR Tesseract classique (local)
  try {
    let extractedText = '';
    updateOcrProgress("Initialisation de l'OCR local...", 0.1);

    if (isImage) {
      extractedText = await OCR.extractTextFromImage(file, (status, progress) => {
        updateOcrProgress(status, progress);
      });
    } else if (isPdf) {
      // PDF Hybride
      const res = await OCR.extractTextFromPdf(file, (status, progress) => {
        updateOcrProgress(status, progress);
      });
      extractedText = res.text;
      canvas = res.canvas;
      state.ocrCanvas = canvas;

      DOM.documentPreviewContainer.innerHTML = '';
      if (canvas) {
        DOM.documentPreviewContainer.appendChild(canvas);
      } else {
        DOM.documentPreviewContainer.innerHTML = '<div style="font-size: 3rem; color: var(--text-muted);"><i class="fa-solid fa-file-pdf"></i></div>';
      }
    }

    // Passer à la phase révision
    showReviewStep(extractedText);

  } catch (error) {
    console.error("Erreur durant l'extraction OCR:", error);
    showToast("Reconnaissance automatique (OCR) indisponible. Saisie manuelle activée.", "error");
    
    // Passer quand même à l'étape de révision avec un texte vide
    showReviewStep("");
    
    // Afficher un message d'avertissement dans le conteneur de prévisualisation (sauf si image déjà visible)
    if (!isImage) {
      DOM.documentPreviewContainer.innerHTML = `
        <div style="text-align: center; color: var(--warning); padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem; color: var(--warning);"></i>
          <h4 style="margin: 0; color: var(--text-primary);">L'OCR n'a pas pu s'initialiser</h4>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0; max-width: 250px;">
            Vous êtes peut-être hors-ligne. Vous pouvez remplir le formulaire à droite et enregistrer le fichier original.
          </p>
        </div>
      `;
    }
  }
}

// Traiter le texte brut directement coller
function processRawText(rawText) {
  DOM.stepUpload.classList.remove('active');
  DOM.stepReview.classList.add('active');
  
  // Pas d'image
  DOM.documentPreviewContainer.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); padding: 20px;">
      <i class="fa-solid fa-align-left" style="font-size: 3rem; margin-bottom: 12px; display: block;"></i>
      <p>Texte brut fourni manuellement</p>
    </div>
  `;
  
  showReviewStep(rawText);
}

// Afficher l'étape de révision avec le texte extrait
function showReviewStep(extractedText) {
  DOM.stepOcrProgress.classList.remove('active');
  DOM.stepReview.classList.add('active');
  
  DOM.reviewRawText.value = extractedText;
  
  // Lancer l'analyse heuristique du texte
  const parsedData = OCR.parseContactInfo(extractedText);
  
  // Remplir le formulaire
  DOM.formName.value = parsedData.name;
  DOM.formCompany.value = parsedData.company;
  DOM.formJob.value = parsedData.job_title;
  DOM.formPhone.value = parsedData.phone;
  DOM.formEmail.value = parsedData.email;
  DOM.formWebsite.value = parsedData.website;
  DOM.formAddress.value = parsedData.address;
  DOM.formTags.value = parsedData.tags;
}

// Afficher l'étape de révision avec les données déjà structurées (Gemini)
function showReviewStepWithData(parsedData) {
  DOM.stepOcrProgress.classList.remove('active');
  DOM.stepReview.classList.add('active');
  
  DOM.reviewRawText.value = parsedData.raw_text || '';
  
  DOM.formName.value = parsedData.name || '';
  DOM.formCompany.value = parsedData.company || '';
  DOM.formJob.value = parsedData.job_title || '';
  DOM.formPhone.value = parsedData.phone || '';
  DOM.formEmail.value = parsedData.email || '';
  DOM.formWebsite.value = parsedData.website || '';
  DOM.formAddress.value = parsedData.address || '';
  DOM.formTags.value = parsedData.tags || 'Import IA';
}

// Mettre à jour l'indicateur visuel de progression de l'OCR
function updateOcrProgress(status, progress) {
  DOM.ocrStatusText.textContent = status;
  const percent = Math.round(progress * 100);
  DOM.ocrProgressFill.style.width = `${percent}%`;
  DOM.ocrProgressPercent.textContent = `${percent}%`;
}

// Enregistrer la carte (Appel POST / PUT de l'API)
async function saveCard() {
  if (state.useLocalStorage) {
    await saveCardToLocalStorage();
    return;
  }

  try {
    const isEdit = !!DOM.formCardId.value;
    const cardId = DOM.formCardId.value;
    
    const formData = new FormData();
    formData.append('name', DOM.formName.value.trim());
    formData.append('company', DOM.formCompany.value.trim());
    formData.append('job_title', DOM.formJob.value.trim());
    formData.append('phone', DOM.formPhone.value.trim());
    formData.append('email', DOM.formEmail.value.trim());
    formData.append('website', DOM.formWebsite.value.trim());
    formData.append('address', DOM.formAddress.value.trim());
    formData.append('tags', DOM.formTags.value.trim());
    formData.append('raw_text', DOM.reviewRawText.value);

    if (state.uploadedFile) {
      formData.append('file', state.uploadedFile);
    }

    let response;
    if (isEdit) {
      response = await fetch(`${API_URL}/api/cards/${cardId}`, {
        method: 'PUT',
        body: formData,
        headers: getAuthHeaders()
      });
    } else {
      response = await fetch(`${API_URL}/api/cards`, {
        method: 'POST',
        body: formData,
        headers: getAuthHeaders()
      });
    }

    if (!response.ok) throw new Error("Erreur de sauvegarde sur l'API.");
    
    const savedCard = await response.json();
    showToast(isEdit ? "Carte de visite modifiée avec succès." : "Carte de visite ajoutée avec succès !");
    
    closeUploadModal();
    await loadDashboardData();
    
    if (isEdit && state.currentCard && state.currentCard.id == cardId) {
      openDetailModal(savedCard);
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || "Échec de l'enregistrement de la carte.", "error");
  }
}

// Sauvegarde locale (Vercel / Hors-ligne)
async function saveCardToLocalStorage() {
  const isEdit = !!DOM.formCardId.value;
  const cardId = DOM.formCardId.value;
  
  const storedCards = localStorage.getItem('cardvault_cards');
  let cards = storedCards ? JSON.parse(storedCards) : [];
  
  let fileData = '';
  let fileType = '';
  
  if (state.uploadedFile) {
    fileType = state.uploadedFile.type;
    if (state.uploadedFile.type.startsWith('image/')) {
      try {
        fileData = await fileToBase64(state.uploadedFile);
      } catch (err) {
        console.error("Impossible de convertir le fichier en Base64:", err);
      }
    } else {
      showToast("Les fichiers PDF ne sont pas stockés dans le stockage local du navigateur.", "info");
    }
  } else if (isEdit) {
    // Garder l'ancien fichier s'il existait
    const oldCard = cards.find(c => c.id == cardId);
    if (oldCard) {
      fileData = oldCard.file_path;
      fileType = oldCard.file_type;
    }
  }

  const cardData = {
    id: isEdit ? parseInt(cardId) : Date.now(),
    name: DOM.formName.value.trim(),
    company: DOM.formCompany.value.trim(),
    job_title: DOM.formJob.value.trim(),
    phone: DOM.formPhone.value.trim(),
    email: DOM.formEmail.value.trim(),
    website: DOM.formWebsite.value.trim(),
    address: DOM.formAddress.value.trim(),
    tags: DOM.formTags.value.trim(),
    raw_text: DOM.reviewRawText.value,
    file_path: fileData,
    file_type: fileType,
    created_at: isEdit ? (cards.find(c => c.id == cardId)?.created_at || new Date().toISOString()) : new Date().toISOString()
  };

  if (isEdit) {
    cards = cards.map(c => c.id == cardId ? cardData : c);
  } else {
    cards.unshift(cardData);
  }
  
  localStorage.setItem('cardvault_cards', JSON.stringify(cards));
  showToast(isEdit ? "Carte de visite modifiée localement." : "Carte de visite ajoutée localement !");
  
  closeUploadModal();
  loadDashboardFromLocalStorage();
  
  if (isEdit && state.currentCard && state.currentCard.id == cardId) {
    openDetailModal(cardData);
  }
}

// Ouvrir les détails d'une carte dans le Drawer
function openDetailModal(card) {
  state.currentCard = card;
  DOM.detailModal.classList.add('active');
  
  // Avatar initials
  const initials = card.name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
    
  DOM.detailAvatarInit.textContent = initials || '??';
  DOM.detailName.textContent = card.name;
  DOM.detailJobCompany.textContent = [card.job_title, card.company].filter(Boolean).join(' @ ') || 'Sans profession / Entreprise';
  
  // phone
  if (card.phone) {
    DOM.detailPhoneRow.style.display = 'flex';
    DOM.detailPhone.textContent = card.phone;
    DOM.detailPhone.href = `tel:${card.phone}`;
  } else {
    DOM.detailPhoneRow.style.display = 'none';
  }

  // email
  if (card.email) {
    DOM.detailEmailRow.style.display = 'flex';
    DOM.detailEmail.textContent = card.email;
    DOM.detailEmail.href = `mailto:${card.email}`;
  } else {
    DOM.detailEmailRow.style.display = 'none';
  }

  // website
  if (card.website) {
    DOM.detailWebsiteRow.style.display = 'flex';
    DOM.detailWebsite.textContent = card.website;
    // S'assurer qu'il y a un protocole
    const url = card.website.startsWith('http') ? card.website : `https://${card.website}`;
    DOM.detailWebsite.href = url;
  } else {
    DOM.detailWebsiteRow.style.display = 'none';
  }

  // address
  if (card.address) {
    DOM.detailAddressRow.style.display = 'flex';
    DOM.detailAddress.textContent = card.address;
  } else {
    DOM.detailAddressRow.style.display = 'none';
  }

  // tags
  DOM.detailTags.innerHTML = '';
  if (card.tags) {
    card.tags.split(',').forEach(tag => {
      const span = document.createElement('span');
      span.className = 'badge';
      span.textContent = tag.trim();
      DOM.detailTags.appendChild(span);
    });
  }

  // created date
  const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  const formattedDate = new Date(card.created_at).toLocaleDateString('fr-FR', dateOptions);
  DOM.detailCreatedAt.textContent = formattedDate;

  // File preview rendering
  DOM.detailFileViewer.innerHTML = '';
  if (card.file_path) {
    DOM.btnDownloadOriginal.style.display = 'inline-flex';
    DOM.btnDownloadOriginal.href = card.file_path;
    DOM.btnDownloadOriginal.download = `${card.name.replace(/[^a-zA-Z0-9]/g, '_')}_carte${getFileExt(card.file_path)}`;

    const isPdf = card.file_type === 'application/pdf' || card.file_path.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      // Utiliser iframe pour visionner le PDF
      const iframe = document.createElement('iframe');
      iframe.src = card.file_path;
      DOM.detailFileViewer.appendChild(iframe);
    } else {
      // Image
      const img = document.createElement('img');
      img.src = card.file_path;
      img.alt = `Carte de visite originale de ${card.name}`;
      DOM.detailFileViewer.appendChild(img);
    }
  } else {
    DOM.btnDownloadOriginal.style.display = 'none';
    DOM.detailFileViewer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted);">
        <i class="fa-solid fa-file-excel" style="font-size: 3rem; margin-bottom: 12px; display: block;"></i>
        <p>Aucun fichier joint à cette carte</p>
      </div>
    `;
  }
}

// Ouvrir le formulaire en mode édition
function openEditMode(card) {
  DOM.detailModal.classList.remove('active');
  
  resetUploadModalSteps();
  
  // Configurer les champs
  DOM.formCardId.value = card.id;
  DOM.formName.value = card.name;
  DOM.formCompany.value = card.company;
  DOM.formJob.value = card.job_title;
  DOM.formPhone.value = card.phone;
  DOM.formEmail.value = card.email;
  DOM.formWebsite.value = card.website;
  DOM.formAddress.value = card.address;
  DOM.formTags.value = card.tags;
  DOM.reviewRawText.value = card.raw_text;

  // Affichage du document original s'il existe
  DOM.documentPreviewContainer.innerHTML = '';
  if (card.file_path) {
    const isPdf = card.file_type === 'application/pdf' || card.file_path.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      DOM.documentPreviewContainer.innerHTML = '<div style="font-size: 3rem; color: var(--text-muted);"><i class="fa-solid fa-file-pdf"></i></div>';
    } else {
      const img = document.createElement('img');
      img.src = card.file_path;
      DOM.documentPreviewContainer.appendChild(img);
    }
  } else {
    DOM.documentPreviewContainer.innerHTML = '<p style="color: var(--text-muted)">Aucun document d\'origine</p>';
  }

  // Ouvrir directement à l'étape révision
  DOM.stepUpload.classList.remove('active');
  DOM.stepReview.classList.add('active');
  DOM.uploadModal.classList.add('active');
}

// Supprimer une carte de visite
async function deleteCard(id) {
  if (state.useLocalStorage) {
    const storedCards = localStorage.getItem('cardvault_cards');
    if (storedCards) {
      let cards = JSON.parse(storedCards);
      cards = cards.filter(c => c.id != id);
      localStorage.setItem('cardvault_cards', JSON.stringify(cards));
    }
    showToast("La carte de visite a été supprimée localement.");
    DOM.detailModal.classList.remove('active');
    state.currentCard = null;
    loadDashboardFromLocalStorage();
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/cards/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    
    if (!response.ok) throw new Error("Erreur de suppression.");
    
    showToast("La carte de visite a été supprimée.");
    DOM.detailModal.classList.remove('active');
    state.currentCard = null;
    
    await loadDashboardData();
  } catch (error) {
    console.error(error);
    showToast("Impossible de supprimer la carte.", "error");
  }
}

// Utilitaires
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function getFileExt(filename) {
  if (filename.startsWith('data:')) {
    const mime = filename.split(';')[0].split(':')[1];
    return mime === 'application/pdf' ? '.pdf' : '.png';
  }
  return filename.substring(filename.lastIndexOf('.'));
}

// Convertir un fichier en chaine Base64 pour le LocalStorage
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// Compresser et optimiser l'image avant l'upload (évite la limite Vercel de 4.5 Mo)
function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          blob => {
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = err => reject(err);
    };
    reader.onerror = err => reject(err);
  });
}
