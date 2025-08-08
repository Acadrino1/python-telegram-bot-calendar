require('dotenv').config();

module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'appointment_scheduler'
    },
    migrations: {
      directory: './database/migrations'
    },
    seeds: {
      directory: './database/seeders'
    },
    pool: {
      min: 2,
      max: 10
    }
  },

  test: {
    client: 'sqlite3',
    connection: ':memory:',
    migrations: {
      directory: './database/migrations'
    },
    seeds: {
      directory: './database/seeders'
    },
    useNullAsDefault: true
  },

  production: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    },
    migrations: {
      directory: './database/migrations'
    },
    seeds: {
      directory: './database/seeders'
    },
    pool: {
      min: 2,
      max: 10
    }
  }
};