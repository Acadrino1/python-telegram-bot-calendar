require('dotenv').config();

module.exports = {
  development: {
    client: process.env.DB_CLIENT || 'sqlite3',
    connection: process.env.DB_CLIENT === 'mysql2' ? {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'appointment_scheduler'
    } : {
      filename: process.env.DB_FILENAME || './database/test_lodge_scheduler.sqlite3'
    },
    useNullAsDefault: process.env.DB_CLIENT === 'sqlite3',
    migrations: {
      directory: './database/migrations'
    },
    seeds: {
      directory: './database/seeders'
    },
    pool: {
      min: process.env.DB_POOL_MIN ? parseInt(process.env.DB_POOL_MIN) : 2,
      max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX) : 10,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      idleTimeoutMillis: 300000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 100,
      propagateCreateError: false,
      // Connection validation
      afterCreate: function (conn, done) {
        if (process.env.DB_CLIENT === 'mysql2') {
          conn.query('SET SESSION wait_timeout=300', function (err) {
            if (err) return done(err, conn);
            conn.query('SET SESSION interactive_timeout=300', function (err) {
              done(err, conn);
            });
          });
        } else {
          done(null, conn);
        }
      }
    },
    acquireConnectionTimeout: 60000,
    // Enable WAL mode for better concurrency in SQLite
    afterCreate: (conn, cb) => {
      if (process.env.DB_CLIENT === 'sqlite3' || !process.env.DB_CLIENT) {
        conn.run('PRAGMA journal_mode = WAL;', () => {});
        conn.run('PRAGMA busy_timeout = 5000;', () => {});
        conn.run('PRAGMA synchronous = NORMAL;', () => {});
      }
      cb();
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
      min: process.env.DB_POOL_MIN ? parseInt(process.env.DB_POOL_MIN) : 5,
      max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX) : 20,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      idleTimeoutMillis: 300000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 100,
      propagateCreateError: false,
      // Production connection validation
      afterCreate: function (conn, done) {
        conn.query('SET SESSION wait_timeout=300', function (err) {
          if (err) return done(err, conn);
          conn.query('SET SESSION interactive_timeout=300', function (err) {
            if (err) return done(err, conn);
            conn.query('SET SESSION sql_mode="STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO"', function (err) {
              done(err, conn);
            });
          });
        });
      }
    },
    acquireConnectionTimeout: 60000,
    // Enable WAL mode for better concurrency in SQLite
    afterCreate: (conn, cb) => {
      if (process.env.DB_CLIENT === 'sqlite3' || !process.env.DB_CLIENT) {
        conn.run('PRAGMA journal_mode = WAL;', () => {});
        conn.run('PRAGMA busy_timeout = 5000;', () => {});
        conn.run('PRAGMA synchronous = NORMAL;', () => {});
      }
      cb();
    }
  }
};