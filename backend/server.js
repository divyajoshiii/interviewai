// ============================================
//   InterviewAI — Backend with Gemini AI
//   Node.js + Express + Mongoose + Gemini
const express  = require('express');
const cors     = require('cors');
const dotenv   = require('dotenv');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const fetch    = require('node-fetch');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

// ============================================
//   MONGODB CONNECTION
// ============================================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err.message));

// ============================================
//   GEMINI AI HELPER
// ============================================
async function askGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    }),
  });
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

// ============================================
//   SCHEMAS & MODELS
// ============================================

const userSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: true },
  role:      { type: String, default: 'SDE Intern' },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model('User', userSchema);

const sessionSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  topic:      { type: String, required: true },
  difficulty: { type: String, required: true },
  mode:       { type: String, required: true },
  score:      { type: Number, required: true },
  questions:  { type: Number, default: 5 },
  breakdown:  [{ question: String, score: Number, feedback: String }],
  date:       { type: Date, default: Date.now },
});
const Session = mongoose.model('Session', sessionSchema);

// ============================================
//   AUTH MIDDLEWARE
// ============================================
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ============================================
//   AUTH ROUTES
// ============================================

// REGISTER
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'All fields are required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user   = await User.create({ name, email, password: hashed, role });
    const token  = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET CURRENT USER
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
//   SESSION ROUTES
// ============================================

// SAVE SESSION
app.post('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const { topic, difficulty, mode, score, questions, breakdown } = req.body;
    const session = await Session.create({
      userId: req.userId,
      topic, difficulty, mode, score, questions, breakdown
    });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET ALL SESSIONS
app.get('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.userId }).sort({ date: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET STATS
app.get('/api/sessions/stats', authMiddleware, async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.userId });
    if (sessions.length === 0) return res.json({ total: 0, avg: 0, best: null, streak: 0 });

    const total = sessions.length;
    const avg   = Math.round(sessions.reduce((s, x) => s + x.score, 0) / total);

    const topicMap = {};
    sessions.forEach(s => {
      if (!topicMap[s.topic]) topicMap[s.topic] = [];
      topicMap[s.topic].push(s.score);
    });
    const best = Object.entries(topicMap)
      .map(([t, scores]) => ({ topic: t, avg: scores.reduce((a,b)=>a+b,0)/scores.length }))
      .sort((a,b) => b.avg - a.avg)[0]?.topic || null;

    const days = [...new Set(sessions.map(s => new Date(s.date).toDateString()))];
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      if (days.includes(d.toDateString())) streak++;
      else break;
    }

    res.json({ total, avg, best, streak });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
//   AI INTERVIEW ROUTES (GEMINI)
// ============================================

// GENERATE QUESTION
app.post('/api/interview/question', async (req, res) => {
  const { topic, difficulty, mode, questionNumber, previousQuestions = [] } = req.body;
  const prevList  = previousQuestions.map((q, i) => `${i+1}. ${q}`).join('\n');
  const modeInstr = mode === 'Coding'
    ? 'This is a CODING interview. Ask the student to write or explain code/algorithm.'
    : 'This is a Q&A interview. Ask a conceptual/theoretical question.';

  const prompt = `You are an expert technical interviewer for a top tech company interviewing a CSE final year student.
Topic: ${topic} | Difficulty: ${difficulty} | Mode: ${mode} | Question ${questionNumber} of 5
${prevList ? `Previous questions asked (DO NOT repeat):\n${prevList}` : ''}
${modeInstr}
Generate EXACTLY ONE interview question. Output ONLY the question text, nothing else. No numbering, no explanation.`;

  try {
    const question = await askGemini(prompt);
    res.json({ question });
  } catch (err) {
    console.error('Gemini error:', err.message);
    res.status(500).json({ error: 'Failed to generate question' });
  }
});

// EVALUATE ANSWER
app.post('/api/interview/evaluate', async (req, res) => {
  const { topic, difficulty, question, answer } = req.body;
  const prompt = `You are an expert CSE technical interviewer evaluating a student answer.
Topic: ${topic} | Difficulty: ${difficulty}
Question: ${question}
Student Answer: ${answer}

Respond with ONLY valid JSON, no markdown, no extra text:
{"score": <integer 0-100>, "feedback": "<2-3 sentences about what was good, what was missing, one tip>"}

Scoring guide: 85-100 excellent, 70-84 good, 50-69 partial, 30-49 poor, 0-29 off-topic.`;

  try {
    const raw  = await askGemini(prompt);
    const json = JSON.parse(raw.replace(/```json|```/g, '').trim());
    res.json(json);
  } catch (err) {
    console.error('Gemini error:', err.message);
    res.status(500).json({ score: 60, feedback: 'Answer received. Keep practicing for better results!' });
  }
});

// STUDY SUGGESTIONS
app.post('/api/interview/suggestions', async (req, res) => {
  const { topic, weakScore } = req.body;
  const prompt = `A CSE student scored ${weakScore}% on ${topic} interview questions.
Give 3 specific actionable study tips. Respond ONLY as a JSON array: ["tip1", "tip2", "tip3"]`;
  try {
    const raw  = await askGemini(prompt);
    const tips = JSON.parse(raw.replace(/```json|```/g, '').trim());
    res.json({ tips });
  } catch {
    res.json({ tips: ['Review core concepts.', 'Practice coding daily.', 'Read CLRS for algorithms.'] });
  }
});

// HEALTH CHECK
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db:     mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    ai:     process.env.GEMINI_API_KEY ? 'Gemini ✅' : '❌ Missing Key'
  });
});

// ============================================
//   START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 InterviewAI running at http://localhost:${PORT}`);
  console.log(`   Gemini API : ${process.env.GEMINI_API_KEY ? '✅' : '❌ Missing'}`);
 console.log(`   MongoDB    : ${process.env.MONGODB_URI  ? '✅' : '❌ Missing'}\n`);
});