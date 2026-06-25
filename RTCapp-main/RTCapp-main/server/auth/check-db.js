const knex = require('knex')({
  client: 'sqlite3',
  connection: { filename: './data/auth.db' },
  useNullAsDefault: true,
});

knex('developers').select('*')
  .then(rows => {
    console.log('Developers table:', JSON.stringify(rows, null, 2));
    return knex.destroy();
  })
  .catch(err => {
    console.error('Error:', err.message);
    knex.destroy();
  });