const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const isPostgres = !!connectionString;

let dbSQLite;
let poolPG;

// Initialiser la connexion à la base de données
function initDb() {
  return new Promise((resolve, reject) => {
    if (isPostgres) {
      console.log('Connexion détectée pour PostgreSQL (Neon). Initialisation du Pool...');
      poolPG = new Pool({
        connectionString: connectionString,
        ssl: {
          rejectUnauthorized: false // Requis pour se connecter à Neon de manière sécurisée
        }
      });

      const sqlCreate = `
        CREATE TABLE IF NOT EXISTS cards (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255),
          company VARCHAR(255),
          job_title VARCHAR(255),
          phone VARCHAR(100),
          email VARCHAR(255),
          website VARCHAR(255),
          address TEXT,
          tags TEXT,
          raw_text TEXT,
          file_path TEXT,
          file_type VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      poolPG.query(sqlCreate, (err, res) => {
        if (err) {
          console.error('Erreur de création de la table PostgreSQL:', err.message);
          return reject(err);
        }
        console.log('Base de données PostgreSQL prête (Table cards ok).');
        resolve();
      });
    } else {
      console.log('Utilisation de la base SQLite locale...');
      const dbPath = path.join(__dirname, 'database.sqlite');
      dbSQLite = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Erreur de connexion à SQLite:', err.message);
          return reject(err);
        }

        const sqlCreate = `
          CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            company TEXT,
            job_title TEXT,
            phone TEXT,
            email TEXT,
            website TEXT,
            address TEXT,
            tags TEXT,
            raw_text TEXT,
            file_path TEXT,
            file_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `;

        dbSQLite.run(sqlCreate, (err) => {
          if (err) {
            console.error('Erreur lors de la création de la table SQLite cards:', err.message);
            return reject(err);
          }
          console.log('Base de données SQLite prête (Table cards ok).');
          resolve();
        });
      });
    }
  });
}

// Convertir une requête SQL standard SQLite (avec ?) en format PostgreSQL (avec $1, $2...)
function queryHelper(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (isPostgres) {
      // Remplacer les ? par $1, $2, $3...
      let index = 1;
      const pgSql = sql.replace(/\?/g, () => `$${index++}`);
      
      // PostgreSQL est sensible à la casse, on remplace LIKE par ILIKE pour les recherches insensibles
      const finalSql = pgSql.replace(/\bLIKE\b/gi, 'ILIKE');

      poolPG.query(finalSql, params, (err, result) => {
        if (err) return reject(err);
        resolve(result.rows);
      });
    } else {
      dbSQLite.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    }
  });
}

// Récupérer toutes les cartes
async function getAllCards(search = '', tag = '') {
  let sql = 'SELECT * FROM cards WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (name LIKE ? OR company LIKE ? OR job_title LIKE ? OR email LIKE ? OR phone LIKE ? OR raw_text LIKE ?)';
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
  }

  if (tag) {
    sql += ' AND (tags LIKE ? OR tags = ?)';
    params.push(`%,${tag},%`, tag);
  }

  sql += ' ORDER BY created_at DESC';

  const rows = await queryHelper(sql, params);
  
  if (tag) {
    // Filtrage précis des tags
    return rows.filter(row => {
      if (!row.tags) return false;
      const tagList = row.tags.split(',').map(t => t.trim().toLowerCase());
      return tagList.includes(tag.toLowerCase());
    });
  }

  return rows;
}

// Récupérer par ID
async function getCardById(id) {
  const rows = await queryHelper('SELECT * FROM cards WHERE id = ?', [id]);
  return rows[0] || null;
}

// Créer une carte
function createCard(card) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO cards (name, company, job_title, phone, email, website, address, tags, raw_text, file_path, file_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      card.name || '',
      card.company || '',
      card.job_title || '',
      card.phone || '',
      card.email || '',
      card.website || '',
      card.address || '',
      card.tags || '',
      card.raw_text || '',
      card.file_path || '',
      card.file_type || ''
    ];

    if (isPostgres) {
      // Pour Postgres, on ajoute RETURNING id pour récupérer l'ID généré
      let index = 1;
      const pgSql = sql.replace(/\?/g, () => `$${index++}`) + ' RETURNING id';
      poolPG.query(pgSql, params, (err, result) => {
        if (err) return reject(err);
        resolve(result.rows[0].id);
      });
    } else {
      dbSQLite.run(sql, params, function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    }
  });
}

// Mettre à jour une carte
function updateCard(id, card) {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE cards
      SET name = ?, company = ?, job_title = ?, phone = ?, email = ?, website = ?, address = ?, tags = ?, raw_text = ?, file_path = ?, file_type = ?
      WHERE id = ?
    `;
    const params = [
      card.name || '',
      card.company || '',
      card.job_title || '',
      card.phone || '',
      card.email || '',
      card.website || '',
      card.address || '',
      card.tags || '',
      card.raw_text || '',
      card.file_path || '',
      card.file_type || '',
      id
    ];

    if (isPostgres) {
      let index = 1;
      const pgSql = sql.replace(/\?/g, () => `$${index++}`);
      poolPG.query(pgSql, params, (err) => {
        if (err) return reject(err);
        resolve();
      });
    } else {
      dbSQLite.run(sql, params, (err) => {
        if (err) return reject(err);
        resolve();
      });
    }
  });
}

// Supprimer une carte
function deleteCard(id) {
  return new Promise((resolve, reject) => {
    if (isPostgres) {
      poolPG.query('DELETE FROM cards WHERE id = $1', [id], (err) => {
        if (err) return reject(err);
        resolve();
      });
    } else {
      dbSQLite.run('DELETE FROM cards WHERE id = ?', [id], (err) => {
        if (err) return reject(err);
        resolve();
      });
    }
  });
}

// Récupérer la liste de tous les tags
async function getAllTags() {
  const rows = await queryHelper('SELECT tags FROM cards WHERE tags IS NOT NULL AND tags != ?', ['']);
  const tagSet = new Set();
  rows.forEach(row => {
    row.tags.split(',').forEach(tag => {
      const cleaned = tag.trim();
      if (cleaned) tagSet.add(cleaned);
    });
  });
  return Array.from(tagSet);
}

module.exports = {
  initDb,
  getAllCards,
  getCardById,
  createCard,
  updateCard,
  deleteCard,
  getAllTags
};
