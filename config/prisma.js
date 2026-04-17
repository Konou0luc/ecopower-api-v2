const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

/* Pool explicite : évite les clients idle fermés par PostgreSQL / le proxy (« Connection terminated unexpectedly »). */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
});

pool.on('error', (err) => {
  console.error('Erreur client PostgreSQL (pool) :', err.message);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
