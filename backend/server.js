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
