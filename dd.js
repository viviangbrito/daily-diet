// Estrutura inicial da API Daily Diet com Node.js, Express e SQLite usando Knex.js

// Instalação sugerida:
// npm install express knex sqlite3 bcryptjs jsonwebtoken dotenv

require('dotenv').config();
const express = require('express');
const knex = require('knex');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();

app.use(express.json());

const db = knex({
  client: 'sqlite3',
  connection: { filename: './daily_diet.db' },
  useNullAsDefault: true,
});

// -------------------- Criação das Tabelas --------------------
db.schema.hasTable('users').then(exists => {
  if (!exists) {
    return db.schema.createTable('users', table => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('email').unique().notNullable();
      table.string('password').notNullable();
    });
  }
});

db.schema.hasTable('meals').then(exists => {
  if (!exists) {
    return db.schema.createTable('meals', table => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('description');
      table.datetime('datetime').notNullable();
      table.boolean('on_diet').notNullable();
      table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
    });
  }
});

// -------------------- Middleware de Autenticação --------------------
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token required' });
  const [, token] = authHeader.split(' ');
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.userId = decoded.id;
    next();
  });
}

// -------------------- Rotas --------------------

// Criar usuário
app.post('/users', async (req, res) => {
  const { name, email, password } = req.body;
  const hash = await bcrypt.hash(password, 8);
  await db('users').insert({ name, email, password: hash });
  res.status(201).json({ message: 'User created' });
});

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db('users').where({ email }).first();
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token });
});

// Criar refeição
app.post('/meals', authenticate, async (req, res) => {
  const { name, description, datetime, on_diet } = req.body;
  await db('meals').insert({ name, description, datetime, on_diet, user_id: req.userId });
  res.status(201).json({ message: 'Meal added' });
});

// Listar refeições
app.get('/meals', authenticate, async (req, res) => {
  const meals = await db('meals').where({ user_id: req.userId });
  res.json(meals);
});

// Visualizar refeição
app.get('/meals/:id', authenticate, async (req, res) => {
  const meal = await db('meals').where({ id: req.params.id, user_id: req.userId }).first();
  if (!meal) return res.status(404).json({ error: 'Meal not found' });
  res.json(meal);
});

// Editar refeição
app.put('/meals/:id', authenticate, async (req, res) => {
  const { name, description, datetime, on_diet } = req.body;
  await db('meals')
    .where({ id: req.params.id, user_id: req.userId })
    .update({ name, description, datetime, on_diet });
  res.json({ message: 'Meal updated' });
});

// Apagar refeição
app.delete('/meals/:id', authenticate, async (req, res) => {
  await db('meals').where({ id: req.params.id, user_id: req.userId }).del();
  res.json({ message: 'Meal deleted' });
});

// Métricas
app.get('/metrics', authenticate, async (req, res) => {
  const meals = await db('meals').where({ user_id: req.userId });
  const total = meals.length;
  const inside = meals.filter(m => m.on_diet).length;
  const outside = total - inside;

  let bestSeq = 0, current = 0;
  for (let m of meals) {
    if (m.on_diet) current++;
    else current = 0;
    if (current > bestSeq) bestSeq = current;
  }

  res.json({ total, inside, outside, bestSequence: bestSeq });
});

// -------------------- Iniciar servidor --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
