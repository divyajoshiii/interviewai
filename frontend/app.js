// ============================================
//   InterviewAI — Frontend (MongoDB version)
//   All data saved to backend via API
// ============================================

const API_BASE = 'http://localhost:3000/api';

const TOPICS = [
  { id: 'dsa',       name: 'Data Structures & Algorithms', icon: '🌲', questions: 80 },
  { id: 'os',        name: 'Operating Systems',             icon: '💻', questions: 45 },
  { id: 'dbms',      name: 'Database Management',           icon: '🗄️', questions: 40 },
  { id: 'networks',  name: 'Computer Networks',             icon: '🌐', questions: 38 },
  { id: 'oop',       name: 'OOP Concepts',                  icon: '📦', questions: 30 },
  { id: 'sysdesign', name: 'System Design',                 icon: '🏗️', questions: 25 },
  { id: 'cn',        name: 'C/C++ & Java',                  icon: '⚙️', questions: 35 },
  { id: 'ai',        name: 'AI / ML Basics',                icon: '🤖', questions: 28 },
];

let state = {
  user: null, token: null,
  currentTopic: 'dsa', currentDiff: 'Easy', currentMode: 'Q&A',
  questions: [], currentQ: 0, scores: [], breakdown: [],
  timerInterval: null, timerSec: 0, sessions: [],
};

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(API_BASE + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) page.classList.add('active');
  if (id === 'page-dashboard') { page.style.display = 'flex'; renderDashboard(); }
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.side-link').forEach(l => l.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.querySelectorAll('.side-link').forEach(l => {
    if (l.textContent.toLowerCase().includes(tab.substring(0, 4))) l.classList.add('active');
  });
  if (tab === 'history')   loadAndRenderHistory();
  if (tab === 'topics')    renderAllTopics();
  if (tab === 'interview') resetInterviewSetup();
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; return; }
  try {
    const data = await api('POST', '/auth/login', { email, password });
    state.token = data.token; state.user = data.user;
    localStorage.setItem('interviewai_token', data.token);
    localStorage.setItem('interviewai_user', JSON.stringify(data.user));
    showPage('page-dashboard');
  } catch (err) { errEl.textContent = err.message; }
}

async function handleRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;
  const errEl = document.getElementById('reg-error');
  errEl.textContent = '';
  if (!name || !email || !password) { errEl.textContent = 'Please fill all fields.'; return; }
  try {
    const data = await api('POST', '/auth/register', { name, email, password, role });
    state.token = data.token; state.user = data.user;
    localStorage.setItem('interviewai_token', data.token);
    localStorage.setItem('interviewai_user', JSON.stringify(data.user));
    showPage('page-dashboard');
  } catch (err) { errEl.textContent = err.message; }
}

function handleLogout() {
  localStorage.removeItem('interviewai_token');
  localStorage.removeItem('interviewai_user');
  state.token = null; state.user = null;
  showPage('page-landing');
}

async function renderDashboard() {
  if (!state.user) return;
  const initials = state.user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('user-initials').textContent = initials;
  document.getElementById('sidebar-name').textContent  = state.user.name.split(' ')[0] + ' ' + (state.user.name.split(' ')[1]?.[0] || '') + '.';
  document.getElementById('sidebar-role').textContent  = state.user.role || 'SDE Intern';
  document.getElementById('dash-name').textContent     = state.user.name.split(' ')[0];
  try {
    const stats = await api('GET', '/sessions/stats');
    document.getElementById('total-sessions').textContent = stats.total;
    document.getElementById('avg-score').textContent      = stats.avg ? stats.avg + '%' : '—';
    document.getElementById('streak').textContent         = (stats.streak || 0) + '🔥';
    if (stats.best) {
      const t = TOPICS.find(x => x.id === stats.best);
      document.getElementById('best-topic').textContent = t?.name?.split(' ')[0] || '—';
    }
  } catch {}
  renderTopicChips();
  renderTopicOptions();
  await loadAndRenderRecentSessions();
}

async function loadAndRenderRecentSessions() {
  const el = document.getElementById('recent-sessions-list');
  try {
    const sessions = await api('GET', '/sessions');
    state.sessions = sessions;
    if (sessions.length === 0) { el.innerHTML = `<p class="empty-state">No sessions yet. Start your first interview!</p>`; return; }
    el.innerHTML = sessions.slice(0, 5).map(s => {
      const t = TOPICS.find(x => x.id === s.topic);
      const color = s.score >= 70 ? 'score-good' : s.score >= 50 ? 'score-med' : 'score-bad';
      return `<div class="history-item"><div class="hist-info"><h4>${t?.icon || '📋'} ${t?.name || s.topic}</h4><p>${s.difficulty} · ${s.mode} · ${new Date(s.date).toLocaleDateString()}</p></div><div class="hist-score ${color}">${s.score}%</div></div>`;
    }).join('');
  } catch { el.innerHTML = `<p class="empty-state">Could not load sessions.</p>`; }
}

async function loadAndRenderHistory() {
  const el = document.getElementById('history-list');
  if (!el) return;
  el.innerHTML = `<p class="empty-state">Loading...</p>`;
  try {
    const sessions = await api('GET', '/sessions');
    if (sessions.length === 0) { el.innerHTML = `<p class="empty-state">No sessions yet.</p>`; return; }
    el.innerHTML = sessions.map(s => {
      const t = TOPICS.find(x => x.id === s.topic);
      const color = s.score >= 70 ? 'score-good' : s.score >= 50 ? 'score-med' : 'score-bad';
      return `<div class="history-item"><div class="hist-info"><h4>${t?.icon || '📋'} ${t?.name || s.topic} Interview</h4><p>${s.difficulty} · ${s.mode} · ${s.questions} Questions · ${new Date(s.date).toLocaleString()}</p></div><div class="hist-score ${color}">${s.score}%</div></div>`;
    }).join('');
  } catch { el.innerHTML = `<p class="empty-state">Could not load history.</p>`; }
}

function renderAllTopics() {
  const el = document.getElementById('all-topics-grid');
  if (!el) return;
  el.innerHTML = TOPICS.map(t => `<div class="topic-card" onclick="selectQuickTopic('${t.id}',null);switchTab('interview')"><div class="t-icon">${t.icon}</div><h4>${t.name}</h4><p>${t.questions}+ Questions</p></div>`).join('');
}

function renderTopicChips() {
  const el = document.getElementById('quick-topics');
  if (!el) return;
  el.innerHTML = TOPICS.slice(0, 6).map(t => `<span class="topic-chip" onclick="selectQuickTopic('${t.id}',this)">${t.icon} ${t.name.split(' ')[0]}</span>`).join('');
}

function renderTopicOptions() {
  const el = document.getElementById('topic-options');
  if (!el) return;
  el.innerHTML = TOPICS.map(t => `<button class="opt-btn ${t.id === state.currentTopic ? 'active' : ''}" onclick="selectTopicOption(this,'${t.id}')">${t.icon} ${t.name.split(' & ')[0].split(' ')[0]}</button>`).join('');
}

function selectQuickTopic(id, el) { state.currentTopic = id; document.querySelectorAll('.topic-chip').forEach(c => c.classList.remove('selected')); el?.classList.add('selected'); }
function selectTopicOption(el, id) { state.currentTopic = id; document.querySelectorAll('#topic-options .opt-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); }
function selectDiff(el) { state.currentDiff = el.dataset.diff; el.closest('.option-row').querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); }
function selectMode(el) { state.currentMode = el.dataset.mode; el.closest('.option-row').querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); }
function resetInterviewSetup() { document.getElementById('interview-setup')?.classList.remove('hidden'); document.getElementById('interview-session')?.classList.add('hidden'); document.getElementById('interview-result')?.classList.add('hidden'); renderTopicOptions(); stopTimer(); }

async function startInterview() {
  const topicObj = TOPICS.find(t => t.id === state.currentTopic);
  state.questions = []; state.currentQ = 0; state.scores = []; state.breakdown = [];
  document.getElementById('interview-setup').classList.add('hidden');
  document.getElementById('interview-session').classList.remove('hidden');
  document.getElementById('interview-result').classList.add('hidden');
  document.getElementById('session-topic-title').textContent = `${topicObj?.icon} ${topicObj?.name}`;
  document.getElementById('session-meta').textContent = `${state.currentDiff} · ${state.currentMode}`;
  document.getElementById('q-counter').textContent = 'Q 1/5';
  state.currentMode === 'Coding' ? document.getElementById('code-editor-area').classList.remove('hidden') : document.getElementById('code-editor-area').classList.add('hidden');
  document.getElementById('chat-messages').innerHTML = `<div class="msg ai-msg"><div class="msg-bubble">Hi! I'm your AI interviewer for <strong>${topicObj?.name}</strong> (${state.currentDiff}). I'll ask you 5 questions. Let's begin!</div></div>`;
  document.getElementById('user-answer').value = '';
  startTimer();
  await askNextQuestion();
}

async function askNextQuestion() {
  const topicObj = TOPICS.find(t => t.id === state.currentTopic);
  const qNum = state.currentQ + 1;
  document.getElementById('q-counter').textContent = `Q ${qNum}/5`;
  addMessage('ai', `<span class="loading-dots">Generating question ${qNum}</span>`);
  try {
    const data = await api('POST', '/interview/question', { topic: topicObj?.name, difficulty: state.currentDiff, mode: state.currentMode, questionNumber: qNum, previousQuestions: state.questions });
    const question = data.question || generateFallbackQuestion(state.currentTopic, state.currentDiff, qNum);
    state.questions.push(question);
    const msgs = document.querySelectorAll('#chat-messages .msg-bubble');
    msgs[msgs.length - 1].innerHTML = `<strong>Q${qNum}:</strong> ${question}`;
  } catch {
    const question = generateFallbackQuestion(state.currentTopic, state.currentDiff, qNum);
    state.questions.push(question);
    const msgs = document.querySelectorAll('#chat-messages .msg-bubble');
    msgs[msgs.length - 1].innerHTML = `<strong>Q${qNum}:</strong> ${question}`;
  }
  document.getElementById('submit-btn').disabled = false;
  document.getElementById('user-answer').focus();
}

async function submitAnswer() {
  const answer = document.getElementById('user-answer').value.trim();
  const code = document.getElementById('code-editor')?.value?.trim() || '';
  if (!answer && !code) return;
  document.getElementById('submit-btn').disabled = true;
  const fullAnswer = answer + (code ? `\n\nCode:\n${code}` : '');
  addMessage('user', fullAnswer);
  document.getElementById('user-answer').value = '';
  if (document.getElementById('code-editor')) document.getElementById('code-editor').value = '';
  const question = state.questions[state.currentQ];
  addMessage('ai', `<span class="loading-dots">Evaluating your answer</span>`);
  let score = 70, feedback = 'Good effort! Keep practicing.';
  try {
    const data = await api('POST', '/interview/evaluate', { topic: TOPICS.find(t => t.id === state.currentTopic)?.name, difficulty: state.currentDiff, question, answer: fullAnswer });
    score = data.score ?? 70; feedback = data.feedback ?? feedback;
  } catch { score = evalFallback(answer); feedback = generateFallbackFeedback(score); }
  state.scores.push(score);
  state.breakdown.push({ question, score, feedback });
  const msgs = document.querySelectorAll('#chat-messages .msg-bubble');
  const lastAI = msgs[msgs.length - 1];
  const scoreColor = score >= 70 ? '#10d97e' : score >= 50 ? '#ffd166' : '#ff4d6d';
  lastAI.innerHTML = `<span style="color:${scoreColor}">✓ Score: ${score}/100</span> — ${feedback}`;
  lastAI.closest('.msg').className = 'msg feedback-msg';
  state.currentQ++;
  if (state.currentQ < 5) setTimeout(() => askNextQuestion(), 800);
  else setTimeout(() => showResult(), 1000);
}

async function showResult() {
  stopTimer();
  document.getElementById('interview-session').classList.add('hidden');
  document.getElementById('interview-result').classList.remove('hidden');
  const topicObj = TOPICS.find(t => t.id === state.currentTopic);
  const total = Math.round(state.scores.reduce((a, b) => a + b, 0) / state.scores.length);
  document.getElementById('result-topic-name').textContent = `${topicObj?.name} — ${state.currentDiff}`;
  document.getElementById('final-score').textContent = total;
  document.getElementById('result-breakdown').innerHTML = state.scores.map((s, i) => {
    const cls = s >= 70 ? 'score-good' : s >= 50 ? 'score-med' : 'score-bad';
    return `<div class="breakdown-item"><span>Question ${i+1}</span><span class="breakdown-score ${cls}">${s}/100</span></div>`;
  }).join('');
  document.getElementById('result-feedback').textContent = total >= 80 ? '🌟 Excellent! Strong grasp of the concepts.' : total >= 60 ? '👍 Good effort! Review questions you scored below 70.' : '📖 Keep studying! Focus on core fundamentals.';
  try {
    await api('POST', '/sessions', { topic: state.currentTopic, difficulty: state.currentDiff, mode: state.currentMode, score: total, questions: state.scores.length, breakdown: state.breakdown });
  } catch (err) { console.warn('Could not save to DB:', err.message); }
}

function endInterview()   { state.currentQ > 0 ? showResult() : resetInterviewSetup(); }
function retryInterview() { resetInterviewSetup(); switchTab('interview'); }

function addMessage(role, html) {
  const el = document.getElementById('chat-messages');
  el.innerHTML += `<div class="msg ${role === 'ai' ? 'ai-msg' : 'user-msg'}"><div class="msg-bubble">${html}</div></div>`;
  el.scrollTop = el.scrollHeight;
}

function startTimer() {
  state.timerSec = 0; stopTimer();
  state.timerInterval = setInterval(() => {
    state.timerSec++;
    const m = String(Math.floor(state.timerSec / 60)).padStart(2, '0');
    const s = String(state.timerSec % 60).padStart(2, '0');
    const el = document.getElementById('session-timer');
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}
function stopTimer() { if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; } }

const FALLBACK_QS = {
  dsa: { Easy: ['What is a stack? Give a real-world example.','Difference between array and linked list?','Explain binary search.','What is Big O notation?','What is a queue?'], Medium: ['Explain merge sort.','What is dynamic programming?','How does a hash map work?','Explain BFS and DFS.','What is a balanced binary tree?'], Hard: ['Design an LRU cache.','Explain Dijkstra\'s algorithm.','What are red-black trees?','Find longest increasing subsequence.','Explain segment trees.'] },
  os:  { Easy: ['What is an OS?','Process vs thread?','What is virtual memory?','What is deadlock?','Explain paging.'], Medium: ['CPU scheduling algorithms?','What is thrashing?','Explain semaphores.','What is context switching?','Explain memory management.'], Hard: ['Design a memory allocator.','Producer-consumer problem?','Dining philosophers problem?','Explain RAID levels.','How does virtual memory work?'] },
};

function generateFallbackQuestion(topicId, diff, num) { const qs = FALLBACK_QS[topicId]?.[diff] || FALLBACK_QS.dsa.Easy; return qs[(num - 1) % qs.length]; }
function evalFallback(answer) { const len = answer.trim().split(/\s+/).length; return len > 80 ? 85 : len > 40 ? 72 : len > 15 ? 58 : 40; }
function generateFallbackFeedback(score) { return score >= 80 ? 'Great answer!' : score >= 65 ? 'Good, add more details.' : score >= 50 ? 'Partial. Add more specifics.' : 'Study the fundamentals.'; }

window.addEventListener('load', async () => {
  const token = localStorage.getItem('interviewai_token');
  const user  = localStorage.getItem('interviewai_user');
  if (token && user) { state.token = token; state.user = JSON.parse(user); showPage('page-dashboard'); }
  else showPage('page-landing');
});