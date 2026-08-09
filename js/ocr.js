// Configure worker for PDF.js
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
}

/**
 * Moteur OCR et Analyse de Contacts locaux
 */
const OCR = {
  
  /**
   * Effectue l'OCR sur un fichier Image
   * @param {File|Blob|HTMLCanvasElement} imageSource - Image à analyser
   * @param {Function} progressCallback - Callback(status, progress)
   * @returns {Promise<string>} - Texte extrait
   */
  async extractTextFromImage(imageSource, progressCallback) {
    if (!window.Tesseract) {
      throw new Error("La bibliothèque Tesseract.js n'est pas chargée.");
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
      
      // Charger uniquement le français pour accélérer le téléchargement et fiabiliser le chargement en local
      await worker.loadLanguage('fra');
      await worker.initialize('fra');
      
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
   * @returns {Promise<{text: string, canvas: HTMLCanvasElement|null}>}
   */
  async extractTextFromPdf(pdfFile, progressCallback, canvasContainer = null) {
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
        });
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

    // Découper le texte par lignes propres
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // 1. Extraire l'email (Regex standard)
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const emailMatch = text.match(emailRegex);
    if (emailMatch) {
      data.email = emailMatch[0].trim();
    }

    // 2. Extraire le site web
    const webRegex = /(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.)+(com|net|org|fr|cm|info|biz|co|io|edu|gov)\b/i;
    const webMatch = text.match(webRegex);
    if (webMatch) {
      data.website = webMatch[0].trim();
    }

    // 3. Extraire le téléphone (Chercher des motifs de numéro ou le mot clé "Tel", "Tél", "Phone", "Cel")
    // Supporte formats internationaux (+237, etc.) et locaux avec espaces ou tirets
    const phoneRegex = /(?:tel|tél|phone|cel|mob|mobile|phone|contact)?[\s.:-]*(\+?[0-9]{1,4}[\s.-]?)?([0-9]{2,3}[\s.-]?){3,4}[0-9]{2,4}/i;
    const phoneMatches = text.match(phoneRegex);
    if (phoneMatches) {
      // Nettoyer si le préfixe comme "Tél:" a été capturé
      let matchedPhone = phoneMatches[0];
      // Si la regex attrape "Tél: +237...", on nettoie les lettres au début
      matchedPhone = matchedPhone.replace(/(tel|tél|phone|cel|mob|mobile|contact|[:\s.-])+/i, '').trim();
      if (matchedPhone.length >= 8) { // taille minimale d'un vrai numéro
        data.phone = matchedPhone;
      }
    }

    // Si aucun téléphone trouvé avec label, chercher un numéro pur qui ressemble à un téléphone
    if (!data.phone) {
      const genericPhoneRegex = /\+?([0-9]{2,4}[\s.-]?){3,5}[0-9]{2,4}/;
      const genericMatch = text.match(genericPhoneRegex);
      if (genericMatch && genericMatch[0].replace(/[\s.-]/g, '').length >= 9) {
        data.phone = genericMatch[0].trim();
      }
    }

    // 4. Adresse (chercher des mots clés géographiques)
    const addressKeywords = /bastos|yaounde|yaoundé|douala|kribi|garoua|maroua|bafoussam|bamenda|rue|avenue|route|street|road|bp|b\.p|box|imm|immeuble|quartier/i;
    const addressLines = lines.filter(line => addressKeywords.test(line));
    if (addressLines.length > 0) {
      // Prendre la ligne la plus longue contenant des adresses
      data.address = addressLines.reduce((a, b) => a.length > b.length ? a : b).trim();
    }

    // 5. Analyse du Nom, de l'Entreprise et du Poste (Heuristique par lignes)
    // Nous filtrons les lignes qui contiennent l'email, le téléphone ou le site web
    const infoLines = lines.filter(line => {
      const isEmail = emailMatch && line.includes(emailMatch[0]);
      const isWeb = webMatch && line.includes(webMatch[0]);
      const isPhone = data.phone && line.includes(data.phone);
      const isAddress = data.address && line.includes(data.address);
      return !isEmail && !isWeb && !isPhone && !isAddress;
    });

    // Mots clés courants pour les postes/fonctions
    const jobKeywords = /directeur|dg|manager|engineer|ingénieur|gérant|fondateur|founder|ceo|commercial|consultant|technicien|chef|président|president|responsable|comptable|secrétaire/i;

    if (infoLines.length > 0) {
      // Parcourir les lignes épurées
      let nameCandidate = '';
      let companyCandidate = '';
      let jobCandidate = '';

      // La ligne contenant un mot clé de poste est probablement le Job
      const jobLineIdx = infoLines.findIndex(line => jobKeywords.test(line));
      if (jobLineIdx !== -1) {
        jobCandidate = infoLines[jobLineIdx];
      }

      // Si le job est trouvé, les lignes au-dessus sont souvent le Nom ou l'Entreprise
      if (jobCandidate) {
        data.job_title = jobCandidate;
        
        // Nom : première ligne en général (ou celle juste au-dessus du job)
        if (jobLineIdx > 0) {
          nameCandidate = infoLines[0];
          if (jobLineIdx > 1) {
            // Si on a au moins 2 lignes avant le job, l'autre pourrait être l'entreprise
            companyCandidate = infoLines[1];
          }
        } else if (infoLines.length > 1) {
          // Si le job était en première ligne, le nom est probablement après
          nameCandidate = infoLines[1];
          if (infoLines.length > 2) {
            companyCandidate = infoLines[2];
          }
        }
      } else {
        // Sans poste explicite, on fait une supposition simple :
        // Ligne 0 = Nom, Ligne 1 = Entreprise (si elle ne ressemble pas à un nom propre long, ou par défaut)
        nameCandidate = infoLines[0];
        if (infoLines.length > 1) {
          companyCandidate = infoLines[1];
        }
        if (infoLines.length > 2) {
          jobCandidate = infoLines[2];
        }
      }

      data.name = nameCandidate.trim();
      data.company = companyCandidate.trim();
      
      if (!data.job_title && jobCandidate) {
        data.job_title = jobCandidate.trim();
      }
    }

    // Fallbacks de sécurité si l'heuristique n'a rien trouvé
    if (!data.name && lines.length > 0) {
      data.name = lines[0]; // Première ligne du texte brut par défaut
    }

    return data;
  }
};

// Exposer à l'objet global window
window.OCR = OCR;
