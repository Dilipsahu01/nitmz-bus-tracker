const { Pool } = require('pg');
require('dotenv').config();

const config = {};

if (process.env.DATABASE_URL) {
  config.connectionString = process.env.DATABASE_URL;
  config.ssl = { rejectUnauthorized: false };
} else {
  config.host = process.env.DB_HOST;
  config.port = process.env.DB_PORT;
  config.user = process.env.DB_USER;
  config.password = process.env.DB_PASSWORD;
  config.database = process.env.DB_NAME;
  
  if (process.env.DB_SSL === 'true') {
    config.ssl = { rejectUnauthorized: false };
  }
}

config.max = 10;
config.idleTimeoutMillis = 30000;

const pool = new Pool(config);

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

async function query(sql, params) {
  try {
    const res = await pool.query(sql, params);
    return res.rows;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
}

module.exports = {
  pool,
  query
};
