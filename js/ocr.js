// Configure worker for PDF.js
if (typeof window !== 'undefined' && window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
}

/**
 * Analyse de texte de contacts (utilisée pour l'option "Coller du texte brut").
 * La lecture des images/PDF est faite exclusivement par Gemini via le backend.
 */
const OCR = {

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
      tags: 'Texte collé',
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
