const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');
let db;

function initDb() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Erreur de connexion à SQLite:', err.message);
        return reject(err);
      }
      console.log('Connecté à la base de données SQLite.');

      // Création de la table cards
      const sql = `
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

      db.run(sql, (err) => {
        if (err) {
          console.error('Erreur lors de la création de la table cards:', err.message);
          return reject(err);
        }
        console.log('Table cards prête.');
        resolve();
      });
    });
  });
}

function getAllCards(search = '', tag = '') {
  return new Promise((resolve, reject) => {
    let sql = 'SELECT * FROM cards WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (name LIKE ? OR company LIKE ? OR job_title LIKE ? OR email LIKE ? OR phone LIKE ? OR raw_text LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    if (tag) {
      sql += ' AND (tags LIKE ? OR tags = ?)';
      params.push(`%,${tag},%`, tag); // Note: simplifiée. Nous pouvons faire un filtrage par tag
    }

    sql += ' ORDER BY created_at DESC';

    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      
      // Filtrage précis des tags si nécessaire (pour éviter les faux-positifs du LIKE sur les tags complexes)
      if (tag) {
        const filtered = rows.filter(row => {
          if (!row.tags) return false;
          const tagList = row.tags.split(',').map(t => t.trim().toLowerCase());
          return tagList.includes(tag.toLowerCase());
        });
        return resolve(filtered);
      }

      resolve(rows);
    });
  });
}

function getCardById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM cards WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

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

    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
  });
}

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

    db.run(sql, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function deleteCard(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM cards WHERE id = ?', [id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function getAllTags() {
  return new Promise((resolve, reject) => {
    db.all('SELECT tags FROM cards WHERE tags IS NOT NULL AND tags != ""', [], (err, rows) => {
      if (err) return reject(err);
      
      const tagSet = new Set();
      rows.forEach(row => {
        row.tags.split(',').forEach(tag => {
          const cleaned = tag.trim();
          if (cleaned) tagSet.add(cleaned);
        });
      });
      
      resolve(Array.from(tagSet));
    });
  });
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
