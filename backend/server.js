const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurer CORS et parser JSON
app.use(cors());
app.use(express.json());

// Configuration de la sécurité par code d'accès
const ACCESS_CODE = process.env.ACCESS_CODE || 'Michel2026';

function checkAuth(req, res, next) {
  // Autoriser la route de connexion sans token
  if (req.path === '/login') {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${ACCESS_CODE}`) {
    return res.status(401).json({ error: 'Accès refusé. Code incorrect ou expiré.' });
  }
  next();
}

// Appliquer la vérification sur toutes les routes de l'API
app.use('/api', checkAuth);

// Route de connexion
app.post('/api/login', (req, res) => {
  const { code } = req.body;
  if (code === ACCESS_CODE) {
    res.json({ success: true, token: ACCESS_CODE });
  } else {
    res.status(401).json({ error: 'Code d\'accès incorrect.' });
  }
});

// Définir les dossiers
const uploadsDir = path.join(__dirname, 'uploads');
const frontendDir = path.join(__dirname, '..');

// S'assurer que le dossier uploads existe (uniquement utile en local)
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Servir le frontend et les téléversements statiques
app.use(express.static(frontendDir));
app.use('/uploads', express.static(uploadsDir));

// Configuration de Multer pour le stockage des fichiers originaux (Image / PDF)
// Sur Vercel, le dossier de travail est en lecture seule, excepté le dossier temporaire /tmp
const tempUploadDir = process.env.POSTGRES_URL || process.env.DATABASE_URL ? '/tmp' : uploadsDir;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${base}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Seuls les formats Image (JPG/PNG) et PDF sont autorisés !"));
  }
});

// API Routes

// Récupérer toutes les cartes
app.get('/api/cards', async (req, res) => {
  try {
    const { search, tag } = req.query;
    const cards = await db.getAllCards(search, tag);
    res.json(cards);
  } catch (err) {
    console.error('Erreur API GET /cards:', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Récupérer tous les tags
app.get('/api/tags', async (req, res) => {
  try {
    const tags = await db.getAllTags();
    res.json(tags);
  } catch (err) {
    console.error('Erreur API GET /tags:', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Récupérer une carte spécifique
app.get('/api/cards/:id', async (req, res) => {
  try {
    const card = await db.getCardById(req.params.id);
    if (!card) {
      return res.status(404).json({ error: 'Carte de visite introuvable' });
    }
    res.json(card);
  } catch (err) {
    console.error('Erreur API GET /cards/:id:', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Analyser une carte avec Gemini API (ou fallback si clé manquante)
app.post('/api/cards/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier téléversé." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Indiquer qu'il n'y a pas de clé pour que le frontend fasse le fallback Tesseract
      return res.status(200).json({ useFallback: true, message: "Pas de clé GEMINI_API_KEY configurée." });
    }

    console.log("Analyse de la carte avec l'API Gemini...");
    
    // Lire le fichier
    const fileBuffer = fs.readFileSync(req.file.path);
    const base64Data = fileBuffer.toString('base64');
    const mimeType = req.file.mimetype;

    // Supprimer le fichier temporaire immédiatement
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkErr) {
      console.warn("Impossible de supprimer le fichier temporaire:", unlinkErr.message);
    }

    // Préparer la requête pour Gemini API (utilisation de fetch)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const prompt = `Tu es un assistant expert en numérisation de cartes de visite et en enrichissement de données.
Analyse cette image de carte de visite (ou document PDF) et extrais ou déduis intelligemment toutes les informations possibles. 
Si des informations ne sont pas écrites explicitement mais peuvent être devinées ou déduites logiquement de manière fiable, tu DOIS les remplir (ne laisse pas les champs vides si une valeur peut être déduite).

Consignes de déduction intelligentes :
1. Si le site internet (website) est manquant mais que la personne a un e-mail professionnel (ex: contact@entreprise.com), déduis le site internet (ex: www.entreprise.com).
2. Si le nom de l'entreprise (company) n'est pas écrit explicitement mais qu'un logo ou le nom de domaine de l'e-mail ou du site est présent, déduis le nom de l'entreprise.
3. Si le poste (job_title) n'est pas écrit mais que le contexte général ou l'activité suggère fortement une fonction, écris cette fonction déduite.
4. Si l'adresse (address) ne mentionne pas la ville ou le pays mais contient des indications locales (ex: 'Bastos', 'Akwa', 'Biyem-Assi'), complète intelligemment avec la ville et le pays probables (ex: 'Bastos, Yaoundé, Cameroun' ou 'Akwa, Douala, Cameroun').
5. Génère au moins 3 tags pertinents (tags) séparés par des virgules décrivant le type d'activité, le domaine et la localisation (ex: "VIP, Partenaire, Santé, Yaoundé").

Renvoie obligatoirement un objet JSON valide contenant EXACTEMENT ces clés :
{
  "name": "Nom complet",
  "company": "Nom de l'entreprise déduit ou lu",
  "job_title": "Poste ou fonction déduit ou lu",
  "phone": "Numéro de téléphone nettoyé au format international standard",
  "email": "Adresse email",
  "website": "Site web lu ou déduit (ex: www.domaine.com)",
  "address": "Adresse complète lue ou enrichie",
  "tags": "Tags générés et séparés par des virgules",
  "raw_text": "Tout le texte brut visible sur la carte"
}

Ne renvoie aucun texte d'introduction ni de conclusion, uniquement l'objet JSON.`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Erreur API Gemini: ${geminiResponse.statusText} - ${errText}`);
    }

    const responseData = await geminiResponse.json();
    const responseText = responseData.candidates[0].content.parts[0].text;
    
    // Parser le JSON retourné par Gemini
    const extractedData = JSON.parse(responseText);
    
    res.json({ useFallback: false, data: extractedData });

  } catch (err) {
    console.error("Erreur lors de l'analyse avec Gemini:", err.message);
    // En cas d'erreur de l'API Gemini, on répond au client qu'il peut faire un fallback Tesseract
    res.json({ useFallback: true, error: err.message });
  }
});

// Créer une nouvelle carte (avec ou sans fichier d'origine)
app.post('/api/cards', upload.single('file'), async (req, res) => {
  try {
    const cardData = {
      name: req.body.name,
      company: req.body.company,
      job_title: req.body.job_title,
      phone: req.body.phone,
      email: req.body.email,
      website: req.body.website,
      address: req.body.address,
      tags: req.body.tags,
      raw_text: req.body.raw_text
    };

    if (req.file) {
      const isPostgres = !!(process.env.POSTGRES_URL || process.env.DATABASE_URL);
      if (isPostgres) {
        // Mode Postgres (Vercel) : lire le fichier temporaire, le convertir en Base64 et le supprimer
        const fileBuffer = fs.readFileSync(req.file.path);
        const base64 = fileBuffer.toString('base64');
        cardData.file_path = `data:${req.file.mimetype};base64,${base64}`;
        cardData.file_type = req.file.mimetype;
        
        // Nettoyage immédiat du fichier temporaire sur le disque
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.warn("Impossible de supprimer le fichier temporaire:", unlinkErr.message);
        }
      } else {
        // Mode SQLite local : stocker le chemin relatif local
        cardData.file_path = `/uploads/${req.file.filename}`;
        cardData.file_type = req.file.mimetype;
      }
    } else {
      cardData.file_path = '';
      cardData.file_type = '';
    }

    const newId = await db.createCard(cardData);
    const newCard = await db.getCardById(newId);
    res.status(201).json(newCard);
  } catch (err) {
    console.error('Erreur API POST /cards:', err.message);
    res.status(500).json({ error: 'Erreur de sauvegarde de la carte de visite' });
  }
});

// Mettre à jour une carte
app.put('/api/cards/:id', upload.single('file'), async (req, res) => {
  try {
    const cardId = req.params.id;
    const existingCard = await db.getCardById(cardId);
    
    if (!existingCard) {
      return res.status(404).json({ error: 'Carte de visite introuvable' });
    }

    const cardData = {
      name: req.body.name || existingCard.name,
      company: req.body.company || existingCard.company,
      job_title: req.body.job_title || existingCard.job_title,
      phone: req.body.phone || existingCard.phone,
      email: req.body.email || existingCard.email,
      website: req.body.website || existingCard.website,
      address: req.body.address || existingCard.address,
      tags: req.body.tags !== undefined ? req.body.tags : existingCard.tags,
      raw_text: req.body.raw_text || existingCard.raw_text,
      file_path: existingCard.file_path,
      file_type: existingCard.file_type
    };

    // Si un nouveau fichier est téléversé
    if (req.file) {
      // Supprimer l'ancien fichier s'il existait localement (pas de suppression si base64)
      if (existingCard.file_path && !existingCard.file_path.startsWith('data:')) {
        const oldPath = path.join(__dirname, '..', existingCard.file_path);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      const isPostgres = !!(process.env.POSTGRES_URL || process.env.DATABASE_URL);
      if (isPostgres) {
        // Mode Postgres (Vercel) : conversion Base64
        const fileBuffer = fs.readFileSync(req.file.path);
        const base64 = fileBuffer.toString('base64');
        cardData.file_path = `data:${req.file.mimetype};base64,${base64}`;
        cardData.file_type = req.file.mimetype;
        
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.warn("Impossible de supprimer le fichier temporaire:", unlinkErr.message);
        }
      } else {
        // Mode SQLite local : stockage fichier local
        cardData.file_path = `/uploads/${req.file.filename}`;
        cardData.file_type = req.file.mimetype;
      }
    }

    await db.updateCard(cardId, cardData);
    const updatedCard = await db.getCardById(cardId);
    res.json(updatedCard);
  } catch (err) {
    console.error('Erreur API PUT /cards/:id:', err.message);
    res.status(500).json({ error: 'Erreur de mise à jour' });
  }
});

// Supprimer une carte
app.delete('/api/cards/:id', async (req, res) => {
  try {
    const cardId = req.params.id;
    const card = await db.getCardById(cardId);
    
    if (!card) {
      return res.status(404).json({ error: 'Carte de visite introuvable' });
    }

    // Supprimer le fichier d'origine s'il existait localement (pas de suppression si base64)
    if (card.file_path && !card.file_path.startsWith('data:')) {
      const filePath = path.join(__dirname, '..', card.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await db.deleteCard(cardId);
    res.json({ message: 'Carte de visite supprimée avec succès' });
  } catch (err) {
    console.error('Erreur API DELETE /cards/:id:', err.message);
    res.status(500).json({ error: 'Erreur de suppression de la carte de visite' });
  }
});

// Démarrage de l'application
db.initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Le serveur tourne sur http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Impossible de démarrer l\'application en raison d\'une erreur de base de données:', err.message);
  });
