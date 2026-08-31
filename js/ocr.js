// Configure worker for PDF.js
if (typeof window !== 'undefined' && window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
}

/**
 * Moteur OCR et Analyse de Contacts locaux
 */
const OCR = {

  // Moteur Tesseract partagé (réutilisé lors d'un import groupé pour éviter
  // de réinitialiser le moteur et re-télécharger la langue à chaque fichier)
  _sharedWorker: null,
  _sharedProgressCb: null,

  async getSharedWorker() {
    if (!window.Tesseract) {
      throw new Error("La bibliothèque Tesseract.js n'est pas chargée.");
    }
    if (this._sharedWorker) return this._sharedWorker;

    const worker = await Tesseract.createWorker({
      logger: m => {
        if (this._sharedProgressCb && m.status === 'recognizing text') {
          this._sharedProgressCb(`Reconnaissance de texte : ${Math.round(m.progress * 100)}%`, m.progress * 0.8 + 0.15);
        }
      }
    });
    await worker.loadLanguage('fra+eng');
    await worker.initialize('fra+eng');
    this._sharedWorker = worker;
    return worker;
  },

  async releaseSharedWorker() {
    if (this._sharedWorker) {
      try {
        await this._sharedWorker.terminate();
      } catch (e) {
        console.warn("Impossible de terminer le moteur OCR partagé:", e);
      }
      this._sharedWorker = null;
      this._sharedProgressCb = null;
    }
  },

  /**
   * Effectue l'OCR sur un fichier Image
   * @param {File|Blob|HTMLCanvasElement} imageSource - Image à analyser
   * @param {Function} progressCallback - Callback(status, progress)
   * @param {boolean} useSharedWorker - Réutiliser le moteur partagé (import groupé)
   * @returns {Promise<string>} - Texte extrait
   */
  async extractTextFromImage(imageSource, progressCallback, useSharedWorker = false) {
    if (!window.Tesseract) {
      throw new Error("La bibliothèque Tesseract.js n'est pas chargée.");
    }

    if (useSharedWorker) {
      try {
        progressCallback('Préparation du moteur OCR...', 0.1);
        const worker = await this.getSharedWorker();
        this._sharedProgressCb = progressCallback;
        progressCallback('Extraction du texte...', 0.2);
        const { data: { text } } = await worker.recognize(imageSource);
        this._sharedProgressCb = null;
        progressCallback('Terminé', 1.0);
        return text;
      } catch (error) {
        this._sharedProgressCb = null;
        console.error("Erreur OCR Tesseract (moteur partagé):", error);
        throw new Error("Échec de la reconnaissance de texte sur l'image.");
      }
    }

    try {
      progressCallback('Initialisation de Tesseract...', 0.1);

      const worker = await Tesseract.createWorker({
        logger: m => {
          if (m.status === 'recognizing text') {
            progressCallback(`Reconnaissance de texte : ${Math.round(m.progress * 100)}%`, m.progress * 0.8 + 0.15);
          } else {
            progressCallback(m.status, 0.1);
          }
        }
      });

      // Français + anglais : les cartes mélangent souvent les deux langues
      await worker.loadLanguage('fra+eng');
      await worker.initialize('fra+eng');

      progressCallback('Extraction du texte...', 0.9);
      const { data: { text } } = await worker.recognize(imageSource);

      await worker.terminate();
      progressCallback('Terminé', 1.0);
      return text;
    } catch (error) {
      console.error("Erreur OCR Tesseract:", error);
      throw new Error("Échec de la reconnaissance de texte sur l'image.");
    }
  },

  /**
   * Effectue l'OCR ou l'extraction de texte sur un fichier PDF (hybride)
   * @param {File} pdfFile - Fichier PDF à analyser
   * @param {Function} progressCallback - Callback(status, progress)
   * @param {HTMLDivElement} canvasContainer - Optionnel, pour rendre la page
   * @param {boolean} useSharedWorker - Réutiliser le moteur OCR partagé (import groupé)
   * @returns {Promise<{text: string, canvas: HTMLCanvasElement|null}>}
   */
  async extractTextFromPdf(pdfFile, progressCallback, canvasContainer = null, useSharedWorker = false) {
    if (!window.pdfjsLib) {
      throw new Error("La bibliothèque PDF.js n'est pas chargée.");
    }

    try {
      progressCallback('Chargement du PDF...', 0.1);
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      if (pdf.numPages === 0) {
        throw new Error("Le PDF ne contient aucune page.");
      }

      // Analyser la première page (suffisant pour une carte de visite)
      progressCallback('Lecture de la page 1...', 0.2);
      const page = await pdf.getPage(1);
      
      // Essayer d'extraire le texte directement (si c'est un PDF vectoriel contenant du texte)
      const textContent = await page.getTextContent();
      let extractedText = textContent.items.map(item => item.str).join(' ');
      
      // Créer le rendu de la page dans un canvas pour prévisualisation et OCR alternatif
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      progressCallback('Rendu visuel de la page...', 0.3);
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      
      // Si l'extraction de texte direct est très vide, faire de l'OCR sur le canvas rendu
      if (extractedText.trim().length < 15) {
        progressCallback('Le PDF semble être une image. Lancement de l\'OCR local...', 0.4);
        extractedText = await this.extractTextFromImage(canvas, (status, val) => {
          // Ajuster la progression (de 0.4 à 0.95)
          const adjustedProgress = 0.4 + (val * 0.55);
          progressCallback(status, adjustedProgress);
        }, useSharedWorker);
      } else {
        progressCallback('Texte extrait directement avec succès !', 1.0);
      }

      return {
        text: extractedText,
        canvas: canvas
      };
    } catch (error) {
      console.error("Erreur extraction PDF:", error);
      throw new Error("Échec de la lecture ou de l'OCR sur le fichier PDF.");
    }
  },

  /**
   * Analyse le texte brut d'une carte de visite pour en extraire les entités
   * @param {string} text - Texte brut extrait
   * @returns {Object} - Données structurées pré-remplies
   */
  parseContactInfo(text) {
    const data = {
      name: '',
      company: '',
      job_title: '',
      phone: '',
      email: '',
      website: '',
      address: '',
      tags: 'Import OCR',
      raw_text: text
    };

    if (!text || text.trim() === '') return data;

    // Découper le texte par lignes propres (espaces multiples normalisés)
    const lines = text.split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line.length > 1);

    // 1. Emails (tous, on garde le premier)
    const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    if (emailMatches.length > 0) {
      data.email = emailMatches[0].toLowerCase();
    }

    // 2. Site web (en excluant les adresses e-mail)
    const webRegex = /(https?:\/\/[^\s]+)|((www\.)[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)|\b[a-zA-Z0-9-]+\.(com|net|org|fr|cm|td|sn|ci|info|biz|co|io|edu|gov)\b/gi;
    const webCandidates = (text.match(webRegex) || [])
      .filter(w => !w.includes('@') && !emailMatches.some(e => e.includes(w.toLowerCase())));
    if (webCandidates.length > 0) {
      data.website = webCandidates[0].trim();
    } else if (data.email) {
      // Déduire le site depuis un e-mail professionnel (pas gmail/yahoo/etc.)
      const domain = data.email.split('@')[1];
      const generic = ['gmail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'icloud.com', 'live.com', 'live.fr'];
      if (domain && !generic.includes(domain)) {
        data.website = 'www.' + domain;
      }
    }

    // 3. Téléphones : tous les numéros de 8 à 15 chiffres, dédupliqués (max 2)
    const phones = [];
    const phoneMatches = text.match(/\+?\d[\d\s.\-()\/]{6,}\d/g) || [];
    phoneMatches.forEach(cand => {
      cand.split('/').forEach(part => {
        const digits = part.replace(/\D/g, '');
        if (digits.length >= 8 && digits.length <= 15) {
          const cleaned = part.trim().replace(/[\s.]+/g, ' ');
          if (!phones.some(p => p.replace(/\D/g, '') === digits)) {
            phones.push(cleaned);
          }
        }
      });
    });
    if (phones.length > 0) {
      data.phone = phones.slice(0, 2).join(' / ');
    }

    // 4. Adresse (mots clés géographiques, jamais une ligne contenant un e-mail)
    const addressKeywords = /bastos|yaound|douala|kribi|garoua|maroua|bafoussam|bamenda|ndjamena|n['’]?djam|tchad|chad|cameroun|cameroon|rue|avenue|\bav\b|route|boulevard|\bbld\b|\bblvd\b|street|road|\bbp\b|b\.p|box|immeuble|\bimm\b|quartier|carrefour|rond[- ]point|face|derri[eè]re/i;
    const addressLines = lines.filter(line => addressKeywords.test(line) && !line.includes('@'));
    if (addressLines.length > 0) {
      data.address = addressLines.reduce((a, b) => a.length > b.length ? a : b).trim();
    }

    // 5. Nom / Entreprise / Poste : heuristiques sur les lignes restantes
    const contactLineRegex = /@|www\.|https?:|t[eé]l[\s.:]|phone|\bfax\b|mobile|\bcel\b|e-?mail|\bmail\b/i;
    const infoLines = lines.filter(line => {
      if (contactLineRegex.test(line)) return false;
      if (line.replace(/\D/g, '').length >= 6) return false; // ligne de téléphone
      if (data.address && line === data.address) return false;
      return true;
    });

    const jobKeywords = /directeur|directrice|\bdg\b|manager|engineer|ing[eé]nieur|g[eé]rant|fondateur|fondatrice|founder|\bceo\b|\bpdg\b|commercial|consultant|technicien|\bchef\b|pr[eé]sident|responsable|comptable|secr[eé]taire|avocat|m[eé]decin|pharmacien|architecte|notaire|expert|coordinateur|coordonnateur|assistant|agent|juriste|analyste|d[eé]veloppeur|designer|infirmier|enseignant|professeur|formateur/i;
    const companyHints = /\b(sarl|s\.a\.r\.l|sa|s\.a|sas|sasu|eurl|gie|ets|etablissements|group|groupe|sci|inc|ltd|llc|corp|cabinet|agence|soci[eé]t[eé]|entreprise|clinique|h[oô]pital|pharmacie|garage|boutique|restaurant|h[oô]tel|banque|assurance|universit[eé]|institut|centre|ong|association|solutions|services|consulting|technolog|international)\b/i;
    // Titres honorifiques : font partie d'un nom de personne, pas d'un poste
    const honorificPrefix = /^(dr|pr|me|mr|mme|mlle|m)\.?\s+/i;

    // Une ligne "nom de personne" : 2 à 4 mots commençant par une majuscule, sans indice société/poste
    const isNameLike = (line) => {
      const cleaned = line.replace(honorificPrefix, '');
      const words = cleaned.split(' ').filter(Boolean);
      if (words.length < 2 || words.length > 4) return false;
      if (companyHints.test(cleaned) || jobKeywords.test(cleaned)) return false;
      return words.every(w => /^[A-ZÀ-Þ]/.test(w));
    };

    let nameLine = infoLines.find(isNameLike) || '';
    let jobLine = infoLines.find(line => jobKeywords.test(line) && line !== nameLine) || '';
    let companyLine = infoLines.find(line => companyHints.test(line) && line !== nameLine && line !== jobLine) || '';

    // Une ligne tout en majuscules est souvent le nom de l'entreprise
    if (!companyLine) {
      companyLine = infoLines.find(line =>
        line !== nameLine && line !== jobLine &&
        line === line.toUpperCase() && /[A-ZÀ-Þ]{3}/.test(line)
      ) || '';
    }
    // Fallbacks par position
    if (!nameLine && infoLines.length > 0) nameLine = infoLines[0];
    if (!companyLine) companyLine = infoLines.find(line => line !== nameLine && line !== jobLine) || '';
    if (!jobLine) jobLine = infoLines.find(line => line !== nameLine && line !== companyLine) || '';

    data.name = nameLine.trim();
    data.company = companyLine.trim();
    data.job_title = jobLine.trim();

    // Derniers filets de sécurité
    if (!data.name && lines.length > 0) data.name = lines[0];
    if (!data.name && data.email) {
      // Reconstruire un nom depuis l'e-mail (prenom.nom@... -> Prenom Nom)
      const local = data.email.split('@')[0].replace(/[._-]+/g, ' ');
      data.name = local.replace(/(^|\s)\w/g, c => c.toUpperCase()).trim();
    }

    return data;
  }
};

// Exposer à l'objet global window (navigateur) ou module (tests Node)
if (typeof window !== 'undefined') {
  window.OCR = OCR;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OCR;
}
