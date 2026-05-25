const App = {
    state: {
        currentPage: 'dashboard',
        currentQuiz: null,
        quizIndex: 0,
        selectedOption: null,
        bookmarks: JSON.parse(localStorage.getItem('jambBookmarks') || '[]'),
        history: JSON.parse(localStorage.getItem('jambHistory') || '[]'),
        theme: localStorage.getItem('jambTheme') || 'light',
        currentStudyPage: 1,
        studyPerPage: 10
    },

    init() {
        // Load data from external data.js
        this.subjects = window.SUBJECTS_DATA || {};
        this.practicals = window.PRACTICALS_DATA || {};
        this.formulas = window.FORMULAS_DATA || {};
        this.achievements = (window.ACHIEVEMENTS_DATA || []).map(a => ({
            ...a,
            check: new Function('s', 'return ' + a.check)
        }));
        this.dailyTips = window.DAILY_TIPS_DATA || [
            'Start your day with a 10-question quiz to warm up!',
            'Review your wrong answers before attempting new questions.',
            'Focus on your weakest subjects first to maximize improvement.',
            'Consistency is key - study at least 30 minutes daily.'
        ];
        this.courses = window.COURSES_DATA || [];
        this.syllabus = window.SYLLABUS_DATA || {};
        this.novel = window.NOVEL_DATA || null;
        this.tips = window.TIPS_DATA || [];
        this.glossary = window.GLOSSARY_DATA || [];
        this.register = window.REGISTRATION_DATA || { steps: [], requirements: [], faq: [] };
        this.flashcards = window.FLASHCARD_DATA || {};
        this.studyPlans = window.STUDY_PLAN_DATA || {};
        this.animations = window.ANIMATIONS_DATA || {};

        this.practicalViews = parseInt(localStorage.getItem('jambPracticalViews') || '0');
        this.loadTheme();
        this.renderSubjects();
        this.populateSelects();
        this.renderFormulas();
        this.renderLessons();
        this.populateMockSelects();
        this.renderSummaries();
        this.setupPracticals();
        this.renderBookmarks();
        this.updateDashboard();
        this.updateProgress();
        this.renderAchievements();
        this.initCookieBanner();
        this._lessonTTS = false;
        this._lessonSlides = [];
        this._lessonIndex = 0;
        this._lessonAutoTimer = null;
        this._lessonSubKey = '';
        this._flashcardData = [];
        this._flashcardIndex = 0;
        this.populateCoursesFilter();
        this.mockQuestions = [];
        this.mockAnswers = [];
        this.mockIndex = 0;
        this.mockTimer = null;
        this.mockRemaining = 0;
        this.deferredPrompt = null;
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            const btn = document.getElementById('installBtn');
            if (btn) btn.style.display = 'flex';
        });
        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            const btn = document.getElementById('installBtn');
            if (btn) btn.style.display = 'none';
        });
        this.bindEvents();
    },

    /* =============== DATA (loaded from data.js) =============== */
    subjects: {},

    achievements: window.ACHIEVEMENTS_DATA ? 
        (window.ACHIEVEMENTS_DATA || []).map(a => ({ ...a, check: new Function('s', 'return ' + a.check) })) : [
        { id: 'first_quiz', title: 'First Steps', desc: 'Complete your first quiz', icon: 'fa-star', check: s => s.totalQuizzes >= 1 },
        { id: 'perfect_score', title: 'Perfect Score', desc: 'Get 100% on a quiz', icon: 'fa-crown', check: s => s.perfectQuizzes >= 1 },
        { id: 'ten_quizzes', title: 'Quiz Machine', desc: 'Complete 10 quizzes', icon: 'fa-rocket', check: s => s.totalQuizzes >= 10 },
        { id: 'fifty_questions', title: 'Question Master', desc: 'Answer 50 questions', icon: 'fa-brain', check: s => s.totalAnswered >= 50 },
        { id: 'hundred_questions', title: 'Scholar', desc: 'Answer 100 questions', icon: 'fa-graduation-cap', check: s => s.totalAnswered >= 100 },
        { id: 'all_subjects', title: 'Explorer', desc: 'Study all 8 subjects', icon: 'fa-globe', check: s => s.subjectsStudied >= 8 },
        { id: 'high_accuracy', title: 'Sharp Mind', desc: 'Achieve 80%+ accuracy', icon: 'fa-bullseye', check: s => s.totalAnswered >= 20 && (s.correct / s.totalAnswered) >= 0.8 },
        { id: 'bookmark_five', title: 'Collector', desc: 'Bookmark 5 questions', icon: 'fa-bookmark', check: s => s.bookmarks >= 5 }
    ],

    dailyTips: window.DAILY_TIPS_DATA || [
        'Start your day with a 10-question quiz to warm up!',
        'Review your wrong answers before attempting new questions.',
        'Consistency is key - study at least 30 minutes daily.'
    ],

    /* =============== RENDER FUNCTIONS =============== */
    renderSubjects() {
        const grid = document.getElementById('subjectsGrid');
        grid.innerHTML = Object.entries(this.subjects).map(([key, subj]) => `
            <div class="subject-card" onclick="App.openSubject('${key}')">
                <div class="subject-icon" style="background: ${subj.color}22; color: ${subj.color}">
                    <i class="fas ${subj.icon}"></i>
                </div>
                <div class="subject-name">${subj.name}</div>
                <div class="subject-topics">${subj.topics.length} topics • ${subj.questions.length} questions</div>
                <div class="subject-stats">
                    ${this.getSubjectProgress(key)}
                </div>
            </div>
        `).join('');
    },

    getSubjectProgress(key) {
        const history = this.state.history.filter(h => h.subject === key);
        const total = history.length;
        const correct = history.filter(h => h.correct).length;
        if (total === 0) return '<i class="fas fa-circle"></i> Not started';
        return `<i class="fas fa-check-circle"></i> ${correct}/${total} (${Math.round(correct/total*100)}%)`;
    },

    openSubject(key) {
        this.state.currentStudySubject = key;
        this.navigateTo('study');
        document.getElementById('studySubject').value = key;
        this.renderStudyQuestions();
    },

    populateSelects() {
        const subjects = Object.entries(this.subjects);
        const selects = ['studySubject', 'quizSubject', 'formulaSubject', 'summarySubject', 'lessonSubject', 'syllabusSubject', 'flashcardSubject', 'animSubject'];
        
        selects.forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const placeholder = id === 'quizSubject' ? 'Random Mixed' : 'All Subjects';
            sel.innerHTML = `<option value="">${placeholder}</option>` + 
                subjects.map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
        });

        // Study topic & year filters
        this.populateStudyFilters();
    },

    populateStudyFilters() {
        const topicSel = document.getElementById('studyTopic');
        const yearSel = document.getElementById('studyYear');
        const subject = document.getElementById('studySubject').value;
        
        // Topics
        if (subject && this.subjects[subject]) {
            topicSel.innerHTML = '<option value="">All Topics</option>' + 
                this.subjects[subject].topics.map(t => `<option value="${t}">${t}</option>`).join('');
        } else {
            topicSel.innerHTML = '<option value="">All Topics</option>';
        }

        // Years
        const years = new Set();
        Object.values(this.subjects).forEach(s => s.questions.forEach(q => {
            if (!subject || s.name === this.subjects[subject]?.name) years.add(q.year);
        }));
        yearSel.innerHTML = '<option value="">All Years</option>' + 
            [...years].sort().reverse().map(y => `<option value="${y}">${y}</option>`).join('');
    },

    populateFormulaFilters() {
        const topicSel = document.getElementById('formulaTopic');
        const subject = document.getElementById('formulaSubject').value;
        const formulas = this.formulas;
        if (subject && formulas[subject]) {
            const topics = [...new Set(formulas[subject].formulas.map(f => f.topic))];
            topicSel.innerHTML = '<option value="">All Topics</option>' + 
                topics.map(t => `<option value="${t}">${t}</option>`).join('');
        } else {
            topicSel.innerHTML = '<option value="">All Topics</option>';
        }
    },

    populateMockSelects() {
        const sel = document.getElementById('mockSubject');
        if (!sel) return;
        sel.innerHTML = '<option value="">Select a subject</option>' +
            Object.entries(this.subjects).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
    },

    /* =============== PRACTICALS =============== */
    setupPracticals() {
        if (!document.getElementById('practicalTabs')) return;
        // Reload practical data from external DATA
        this.practicals = window.PRACTICALS_DATA || this.practicals || {};
    },

    renderPracticals() {
        const tab = document.querySelector('.practical-tabs .btn.active');
        if (!tab) {
            this.renderPracticalSubject('physics');
            return;
        }
        this.renderPracticalSubject(tab.dataset.practical);
    },

    renderPracticalSubject(subj) {
        const container = document.getElementById('practicalContent');
        const data = this.practicals[subj];
        if (!data) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-flask"></i><p>No practicals available for this subject.</p></div>';
            return;
        }

        // Track practical views for achievements
        this.practicalViews = (this.practicalViews || 0) + 1;
        localStorage.setItem('jambPracticalViews', this.practicalViews);

        container.innerHTML = `
            <div class="practical-header">
                <h2><i class="fas ${data.icon}" style="color:${data.color}"></i> ${data.title}</h2>
                <p>Step-by-step guides for JAMB practical examinations.</p>
            </div>
            <div class="practical-list">
                ${data.experiments.map((exp, i) => `
                    <div class="practical-card card">
                        <div class="practical-card-header" onclick="App.togglePractical(${i})">
                            <h3><span class="practical-num">${i + 1}</span> ${exp.title}</h3>
                            <i class="fas fa-chevron-down practical-arrow" id="parrow-${i}"></i>
                        </div>
                        <div class="practical-body" id="pbody-${i}" style="display:none">
                            <h4>Procedure:</h4>
                            <ol class="practical-steps">
                                ${exp.procedure.map(step => `<li>${step}</li>`).join('')}
                            </ol>
                            ${exp.tips ? `<div class="practical-tips"><strong><i class="fas fa-lightbulb"></i> Tips:</strong> ${exp.tips}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    togglePractical(idx) {
        const body = document.getElementById('pbody-' + idx);
        const arrow = document.getElementById('parrow-' + idx);
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    },

    /* =============== STUDY MODE =============== */
    renderStudyQuestions() {
        const container = document.getElementById('studyQuestions');
        const subject = document.getElementById('studySubject').value;
        const topic = document.getElementById('studyTopic').value;
        const year = document.getElementById('studyYear').value;
        const search = document.getElementById('studySearch').value.toLowerCase();
        
        let questions = [];
        if (subject && this.subjects[subject]) {
            questions = [...this.subjects[subject].questions];
        } else {
            Object.values(this.subjects).forEach(s => questions.push(...s.questions));
        }

        if (topic) questions = questions.filter(q => q.topic === topic);
        if (year) questions = questions.filter(q => q.year == year);
        if (search) questions = questions.filter(q => 
            q.question.toLowerCase().includes(search) || 
            q.explanation.toLowerCase().includes(search)
        );

        const totalPages = Math.ceil(questions.length / this.state.studyPerPage);
        const page = Math.min(this.state.currentStudyPage, totalPages || 1);
        const start = (page - 1) * this.state.studyPerPage;
        const pageQuestions = questions.slice(start, start + this.state.studyPerPage);

        if (!pageQuestions.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>No questions found.</p></div>';
        } else {
            container.innerHTML = pageQuestions.map(q => this.renderQuestionCard(q, subject || this.getSubjectForQuestion(q))).join('');
        }

        // Pagination
        const pagination = document.getElementById('studyPagination');
        if (totalPages <= 1) {
            pagination.innerHTML = '';
        } else {
            let p = '<button onclick="App.changeStudyPage(1)" ' + (page === 1 ? 'disabled' : '') + '><i class="fas fa-angle-double-left"></i></button>';
            p += '<button onclick="App.changeStudyPage(' + (page - 1) + ')" ' + (page === 1 ? 'disabled' : '') + '><i class="fas fa-angle-left"></i></button>';
            for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
                p += `<button class="${i === page ? 'active' : ''}" onclick="App.changeStudyPage(${i})">${i}</button>`;
            }
            p += '<button onclick="App.changeStudyPage(' + (page + 1) + ')" ' + (page >= totalPages ? 'disabled' : '') + '><i class="fas fa-angle-right"></i></button>';
            p += '<button onclick="App.changeStudyPage(' + totalPages + ')" ' + (page >= totalPages ? 'disabled' : '') + '><i class="fas fa-angle-double-right"></i></button>';
            pagination.innerHTML = p;
        }
    },

    changeStudyPage(page) {
        this.state.currentStudyPage = page;
        this.renderStudyQuestions();
        document.getElementById('studyQuestions').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    renderQuestionCard(q, subjectKey) {
        const subj = this.subjects[subjectKey];
        const isBookmarked = this.state.bookmarks.includes(q.id);
        return `
            <div class="study-question-card" id="sq-${q.id}">
                <div class="q-meta">
                    <span class="q-subject">${subj ? subj.name : 'General'}</span>
                    <span class="q-year">${q.year}</span>
                    <span class="q-topic">${q.topic}</span>
                </div>
                <div class="q-text">${q.question}</div>
                <div class="q-options">
                    ${q.options.map((opt, i) => {
                        const letter = String.fromCharCode(65 + i);
                        const isCorrect = letter === q.answer;
                        return `<div class="q-option" onclick="App.revealStudyAnswer('${q.id}', '${letter}')" id="so-${q.id}-${letter}">
                            <span class="opt-label">${letter}</span>
                            <span class="opt-text">${opt.replace(/^[A-D]:\s*/, '')}</span>
                        </div>`;
                    }).join('')}
                </div>
                <div class="q-explanation" id="sexpl-${q.id}" style="display:none">
                    <strong>Answer: ${q.answer}</strong><br>
                    ${q.explanation}
                </div>
                <div class="q-actions">
                    <button class="btn btn-sm ${isBookmarked ? 'btn-primary' : 'btn-outline'}" onclick="App.toggleBookmark('${q.id}')">
                        <i class="fas ${isBookmarked ? 'fa-bookmark' : 'fa-bookmark'}"></i> ${isBookmarked ? 'Bookmarked' : 'Bookmark'}
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="App.shareQuestion('${q.id}')">
                        <i class="fas fa-share"></i> Share
                    </button>
                </div>
            </div>
        `;
    },

    revealStudyAnswer(qId, selected) {
        const q = this.findQuestion(qId);
        if (!q) return;
        
        // Show explanation
        document.getElementById('sexpl-' + qId).style.display = 'block';
        
        // Mark selected
        q.options.forEach((_, i) => {
            const letter = String.fromCharCode(65 + i);
            const el = document.getElementById('so-' + qId + '-' + letter);
            if (!el) return;
            el.classList.remove('correct', 'wrong');
            if (letter === q.answer) el.classList.add('correct');
            if (letter === selected && letter !== q.answer) el.classList.add('wrong');
        });
    },

    getSubjectForQuestion(qId) {
        for (const [key, subj] of Object.entries(this.subjects)) {
            if (subj.questions.some(q => q.id === qId)) return key;
        }
        return null;
    },

    findQuestion(qId) {
        for (const subj of Object.values(this.subjects)) {
            const found = subj.questions.find(q => q.id === qId);
            if (found) return found;
        }
        return null;
    },

    /* =============== QUIZ MODE =============== */
    startQuiz() {
        const subject = document.getElementById('quizSubject').value;
        const count = parseInt(document.getElementById('quizCount').value);
        const timeLimit = parseInt(document.getElementById('quizTime').value);
        const difficulty = document.getElementById('quizDifficulty').value;

        let questions = [];
        if (subject && this.subjects[subject]) {
            questions = [...this.subjects[subject].questions];
        } else {
            Object.values(this.subjects).forEach(s => questions.push(...s.questions));
        }

        if (difficulty !== 'all') {
            questions = questions.filter(q => q.difficulty === difficulty);
        }

        // Shuffle
        for (let i = questions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [questions[i], questions[j]] = [questions[j], questions[i]];
        }

        questions = questions.slice(0, Math.min(count, questions.length));

        if (questions.length === 0) {
            this.showToast('No questions match your criteria.', 'warning');
            return;
        }

        this.state.currentQuiz = questions.map(q => ({ ...q, selected: null }));
        this.state.quizIndex = 0;
        this.state.selectedOption = null;

        document.getElementById('quizSetup').style.display = 'none';
        document.getElementById('quizArea').style.display = 'block';
        document.getElementById('quizResults').style.display = 'none';

        // Hide finish button initially
        document.getElementById('finishBtn').style.display = 'none';

        this.showQuizQuestion();

        // Timer
        if (timeLimit > 0) {
            this.startTimer(timeLimit);
        } else {
            document.getElementById('quizTimer').innerHTML = '<i class="fas fa-infinity"></i> No limit';
        }
    },

    showQuizQuestion() {
        const quiz = this.state.currentQuiz;
        if (!quiz || quiz.length === 0) return;

        const idx = this.state.quizIndex;
        const q = quiz[idx];
        const answered = quiz.filter(q => q.selected !== null).length;

        // Progress
        document.getElementById('quizProgress').textContent = `Question ${idx + 1} of ${quiz.length}`;
        document.getElementById('quizProgressFill').style.width = `${((idx + 1) / quiz.length) * 100}%`;
        document.getElementById('quizScoreLive').textContent = `Score: ${quiz.filter(q => q.selected === q.answer).length}/${answered}`;

        // Question meta
        const subj = this.getSubjectForQuestion(q.id);
        const subjName = subj ? this.subjects[subj].name : 'General';
        document.getElementById('qSubject').textContent = subjName;
        document.getElementById('qYear').textContent = q.year;
        document.getElementById('qTopic').textContent = q.topic;
        document.getElementById('qDifficulty').textContent = q.difficulty;

        // Question text
        document.getElementById('qText').textContent = q.question;

        // Options
        const optContainer = document.getElementById('qOptions');
        optContainer.innerHTML = q.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            const selected = q.selected === letter;
            const correct = q.selected !== null && letter === q.answer;
            const wrong = q.selected !== null && q.selected === letter && letter !== q.answer;
            const cls = selected && q.selected !== null && letter !== q.answer ? 'wrong' : 
                       correct ? 'correct' : 
                       selected ? 'selected' : '';
            return `<button class="option-btn ${cls}" onclick="App.selectOption('${letter}')" ${q.selected !== null ? 'disabled' : ''}>
                <span class="opt-letter">${letter}</span>
                <span>${opt.replace(/^[A-D]:\s*/, '')}</span>
            </button>`;
        }).join('');

        // Explanation (shown after selecting)
        const expl = document.getElementById('qExplanation');
        if (q.selected !== null) {
            expl.style.display = 'block';
            expl.innerHTML = `<strong>Answer: ${q.answer}</strong><br>${q.explanation}`;
        } else {
            expl.style.display = 'none';
        }

        // Navigation buttons
        document.getElementById('prevBtn').disabled = idx === 0;
        const isLast = idx === quiz.length - 1;
        document.getElementById('nextBtn').style.display = isLast ? 'none' : 'inline-flex';
        document.getElementById('finishBtn').style.display = isLast ? 'inline-flex' : 'none';

        // Disable next/finish if no answer selected
        if (isLast) {
            document.getElementById('finishBtn').disabled = q.selected === null;
        } else {
            document.getElementById('nextBtn').disabled = q.selected === null;
        }
    },

    selectOption(letter) {
        const quiz = this.state.currentQuiz;
        const idx = this.state.quizIndex;
        const q = quiz[idx];

        if (q.selected !== null) return;

        q.selected = letter;
        this.showQuizQuestion();

        // Update score live
        const answered = quiz.filter(q => q.selected !== null).length;
        document.getElementById('quizScoreLive').textContent = `Score: ${quiz.filter(q => q.selected === q.answer).length}/${answered}`;
    },

    nextQuestion() {
        if (this.state.quizIndex < this.state.currentQuiz.length - 1) {
            this.state.quizIndex++;
            this.state.selectedOption = null;
            this.showQuizQuestion();
        }
    },

    prevQuestion() {
        if (this.state.quizIndex > 0) {
            this.state.quizIndex--;
            this.state.selectedOption = null;
            this.showQuizQuestion();
        }
    },

    finishQuiz() {
        const quiz = this.state.currentQuiz;
        const correct = quiz.filter(q => q.selected === q.answer).length;
        const wrong = quiz.filter(q => q.selected !== null && q.selected !== q.answer).length;
        const skipped = quiz.filter(q => q.selected === null).length;
        const total = quiz.length;
        const score = Math.round((correct / total) * 100);

        // Save to history
        const record = {
            date: new Date().toISOString(),
            subject: document.getElementById('quizSubject').value || 'mixed',
            total,
            correct,
            wrong,
            skipped,
            score,
            questions: quiz.map(q => ({ id: q.id, selected: q.selected, correct: q.selected === q.answer }))
        };
        this.state.history.push(record);
        localStorage.setItem('jambHistory', JSON.stringify(this.state.history));

        // Stop timer
        this.stopTimer();

        // Show results
        document.getElementById('quizArea').style.display = 'none';
        document.getElementById('quizResults').style.display = 'block';

        document.getElementById('resultCorrect').textContent = correct;
        document.getElementById('resultWrong').textContent = wrong;
        document.getElementById('resultSkipped').textContent = skipped;
        document.getElementById('resultScore').textContent = score + '%';

        // Result chart
        this.renderResultChart(correct, wrong, skipped);

        // Save last quiz result for perfect score check
        if (score === 100) {
            const stats = this.getStats();
            stats.perfectQuizzes = (stats.perfectQuizzes || 0) + 1;
            localStorage.setItem('jambPerfectQuizzes', stats.perfectQuizzes);
        }

        // Update everything
        this.updateDashboard();
        this.updateProgress();
        this.renderAchievements();
        this.showToast(`Quiz complete! Score: ${score}%`, score >= 50 ? 'success' : 'error');
    },

    reviewQuiz() {
        const quiz = this.state.currentQuiz;
        // Show the questions in study mode style
        document.getElementById('quizResults').style.display = 'none';
        document.getElementById('quizArea').style.display = 'block';
        this.state.quizIndex = 0;
        this.showQuizQuestion();
        
        // Change finish to back
        document.getElementById('finishBtn').textContent = 'Back to Results';
        document.getElementById('finishBtn').onclick = () => {
            document.getElementById('quizArea').style.display = 'none';
            document.getElementById('quizResults').style.display = 'block';
        };
    },

    retryQuiz() {
        document.getElementById('quizResults').style.display = 'none';
        document.getElementById('quizSetup').style.display = 'block';
        document.getElementById('quizArea').style.display = 'none';
        this.state.currentQuiz = null;
    },

    /* =============== MOCK EXAM =============== */
    startMockExam() {
        const subject = document.getElementById('mockSubject').value;
        const count = parseInt(document.getElementById('mockCount').value);
        const difficulty = document.getElementById('mockDifficulty').value;

        if (!subject) {
            this.showToast('Please select a subject.', 'warning');
            return;
        }
        if (!this.subjects[subject]) {
            this.showToast('Subject data not found.', 'error');
            return;
        }

        let questions = [...this.subjects[subject].questions];
        if (difficulty !== 'all') {
            questions = questions.filter(q => q.difficulty === difficulty);
        }

        if (questions.length === 0) {
            this.showToast('No questions match your criteria.', 'warning');
            return;
        }

        for (let i = questions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [questions[i], questions[j]] = [questions[j], questions[i]];
        }

        questions = questions.slice(0, Math.min(count, questions.length));

        this.mockQuestions = questions;
        this.mockAnswers = new Array(questions.length).fill(null);
        this.mockIndex = 0;

        document.getElementById('mockSetup').style.display = 'none';
        document.getElementById('mockArea').style.display = 'block';
        document.getElementById('mockResults').style.display = 'none';
        document.getElementById('mockReview').style.display = 'none';

        this.showMockQuestion();
        this.renderMockPalette();
        this.startMockTimer();
    },

    showMockQuestion() {
        const questions = this.mockQuestions;
        if (!questions || questions.length === 0) return;

        const idx = this.mockIndex;
        const q = questions[idx];
        const answered = this.mockAnswers.filter(a => a !== null).length;

        document.getElementById('mockProgress').textContent = `Question ${idx + 1} of ${questions.length}`;

        const subj = this.getSubjectForQuestion(q.id);
        const subjName = subj ? this.subjects[subj].name : 'General';
        document.getElementById('mqSubject').textContent = subjName;
        document.getElementById('mqYear').textContent = q.year;
        document.getElementById('mqTopic').textContent = q.topic;
        document.getElementById('mqDifficulty').textContent = q.difficulty;
        document.getElementById('mqText').textContent = q.question;

        const optContainer = document.getElementById('mqOptions');
        optContainer.innerHTML = q.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            const selected = this.mockAnswers[idx] === letter;
            return `<button class="option-btn ${selected ? 'selected' : ''}" onclick="App.selectMockOption('${letter}')" ${this.mockAnswers[idx] !== null ? 'disabled' : ''}>
                <span class="opt-letter">${letter}</span>
                <span>${opt.replace(/^[A-D]:\s*/, '')}</span>
            </button>`;
        }).join('');

        this.renderMockPalette();
    },

    selectMockOption(letter) {
        const idx = this.mockIndex;
        if (this.mockAnswers[idx] !== null) return;
        this.mockAnswers[idx] = letter;
        this.showMockQuestion();
    },

    renderMockPalette() {
        const palette = document.getElementById('mockPalette');
        if (!palette) return;
        palette.innerHTML = this.mockQuestions.map((_, i) => {
            let cls = 'palette-btn';
            if (i === this.mockIndex) cls += ' current';
            if (this.mockAnswers[i] !== null) cls += ' answered';
            return `<button class="${cls}" onclick="App.jumpMockQuestion(${i})">${i + 1}</button>`;
        }).join('');
    },

    jumpMockQuestion(idx) {
        if (idx < 0 || idx >= this.mockQuestions.length) return;
        this.mockIndex = idx;
        this.showMockQuestion();
    },

    startMockTimer() {
        this.stopMockTimer();
        const count = this.mockQuestions.length;
        this.mockRemaining = count === 30 ? 1800 : count === 105 ? 5400 : 3600;
        this.updateMockTimerDisplay();

        this.mockTimer = setInterval(() => {
            this.mockRemaining--;
            this.updateMockTimerDisplay();
            if (this.mockRemaining <= 0) {
                this.showToast('Time is up! Submitting exam.', 'warning');
                this.submitMockExam();
            }
        }, 1000);
    },

    stopMockTimer() {
        if (this.mockTimer) {
            clearInterval(this.mockTimer);
            this.mockTimer = null;
        }
    },

    updateMockTimerDisplay() {
        const display = document.getElementById('mockTimeDisplay');
        if (!display) return;
        const hrs = Math.floor(this.mockRemaining / 3600);
        const mins = Math.floor((this.mockRemaining % 3600) / 60);
        const secs = this.mockRemaining % 60;
        display.textContent =
            String(hrs).padStart(2, '0') + ':' +
            String(mins).padStart(2, '0') + ':' +
            String(secs).padStart(2, '0');

        const el = document.getElementById('mockTimer');
        if (this.mockRemaining <= 300) {
            el.classList.add('warning');
        } else {
            el.classList.remove('warning');
        }
    },

    submitMockExam() {
        this.stopMockTimer();

        const total = this.mockQuestions.length;
        let correct = 0;
        let wrong = 0;
        let unanswered = 0;

        this.mockQuestions.forEach((q, i) => {
            const selected = this.mockAnswers[i];
            if (selected === null) unanswered++;
            else if (selected === q.answer) correct++;
            else wrong++;
        });

        const score = Math.round((correct / total) * 100);
        const grade = this.getJambGrade(score);

        document.getElementById('mockArea').style.display = 'none';
        document.getElementById('mockResults').style.display = 'block';

        document.getElementById('mockResultCorrect').textContent = correct;
        document.getElementById('mockResultWrong').textContent = wrong;
        document.getElementById('mockResultSkipped').textContent = unanswered;
        document.getElementById('mockResultScore').textContent = score + '%';
        document.getElementById('mockScoreMain').textContent = `${correct}/${total}`;

        const badge = document.getElementById('mockGradeBadge');
        badge.textContent = grade.letter;
        badge.style.background = grade.color;

        const label = document.getElementById('mockGradeLabel');
        label.textContent = grade.description;
        label.style.color = grade.color;

        document.querySelectorAll('.grade-row').forEach(el => el.classList.remove('active'));
        const activeRow = document.querySelector(`.grade-row[data-grade="${grade.letter}"]`);
        if (activeRow) activeRow.classList.add('active');

        // Save to history
        const record = {
            date: new Date().toISOString(),
            subject: document.getElementById('mockSubject').value,
            total,
            correct,
            wrong,
            skipped: unanswered,
            score,
            grade: grade.letter,
            type: 'mock',
            questions: this.mockQuestions.map((q, i) => ({
                id: q.id, selected: this.mockAnswers[i], correct: this.mockAnswers[i] === q.answer
            }))
        };
        this.state.history.push(record);
        localStorage.setItem('jambHistory', JSON.stringify(this.state.history));

        this.renderMockResultChart(correct, wrong, unanswered);
        this.updateDashboard();
        this.updateProgress();
        this.renderAchievements();
        this.showToast(`Mock Exam complete! Grade: ${grade.letter} (${score}%)`, score >= 50 ? 'success' : 'error');
    },

    getJambGrade(score) {
        if (score >= 75) return { letter: 'A1', description: 'Excellent', color: 'linear-gradient(135deg,#10b981,#059669)' };
        if (score >= 70) return { letter: 'B2', description: 'Very Good', color: 'linear-gradient(135deg,#22c55e,#16a34a)' };
        if (score >= 65) return { letter: 'B3', description: 'Good', color: 'linear-gradient(135deg,#3b82f6,#2563eb)' };
        if (score >= 60) return { letter: 'C4', description: 'Credit', color: 'linear-gradient(135deg,#6366f1,#4f46e5)' };
        if (score >= 55) return { letter: 'C5', description: 'Credit', color: 'linear-gradient(135deg,#f59e0b,#d97706)' };
        if (score >= 50) return { letter: 'C6', description: 'Credit', color: 'linear-gradient(135deg,#f97316,#ea580c)' };
        if (score >= 45) return { letter: 'D7', description: 'Pass', color: 'linear-gradient(135deg,#ef4444,#dc2626)' };
        if (score >= 40) return { letter: 'E8', description: 'Pass', color: 'linear-gradient(135deg,#dc2626,#b91c1c)' };
        return { letter: 'F9', description: 'Fail', color: 'linear-gradient(135deg,#991b1b,#7f1d1d)' };
    },

    renderMockResultChart(correct, wrong, skipped) {
        const ctx = document.getElementById('mockResultChart');
        if (!ctx) return;
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Correct', 'Wrong', 'Unanswered'],
                datasets: [{
                    data: [correct, wrong, skipped],
                    backgroundColor: ['#10b981', '#ef4444', '#94a3b8'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } }
                },
                cutout: '60%'
            }
        });
    },

    reviewMockExam() {
        document.getElementById('mockResults').style.display = 'none';
        document.getElementById('mockReview').style.display = 'block';
        this.mockIndex = 0;
        this.showMockReviewQuestion();
        this.renderMockReviewPalette();
    },

    showMockReviewQuestion() {
        const questions = this.mockQuestions;
        const idx = this.mockIndex;
        const q = questions[idx];

        document.getElementById('mockReviewProgress').textContent = `Question ${idx + 1} of ${questions.length}`;

        const subj = this.getSubjectForQuestion(q.id);
        const subjName = subj ? this.subjects[subj].name : 'General';
        document.getElementById('mrSubject').textContent = subjName;
        document.getElementById('mrYear').textContent = q.year;
        document.getElementById('mrTopic').textContent = q.topic;
        document.getElementById('mrDifficulty').textContent = q.difficulty;
        document.getElementById('mrText').textContent = q.question;

        const selected = this.mockAnswers[idx];
        const optContainer = document.getElementById('mrOptions');
        optContainer.innerHTML = q.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            const isSelected = selected === letter;
            const isCorrect = letter === q.answer;
            const isWrong = isSelected && !isCorrect;
            const cls = isCorrect ? 'correct' : isWrong ? 'wrong' : '';
            return `<button class="option-btn ${cls}" disabled>
                <span class="opt-letter">${letter}</span>
                <span>${opt.replace(/^[A-D]:\s*/, '')}</span>
            </button>`;
        }).join('');

        document.getElementById('mrExplanation').style.display = 'block';
        document.getElementById('mrExplanation').innerHTML =
            `<strong>Answer: ${q.answer}</strong><br>${q.explanation}`;

        this.renderMockReviewPalette();
    },

    renderMockReviewPalette() {
        const palette = document.getElementById('mockReviewPalette');
        if (!palette) return;
        palette.innerHTML = this.mockQuestions.map((_, i) => {
            let cls = 'palette-btn';
            if (i === this.mockIndex) cls += ' current';
            const selected = this.mockAnswers[i];
            if (selected !== null) {
                cls += selected === this.mockQuestions[i].answer ? ' answered' : ' wrong-answer';
            }
            return `<button class="${cls}" onclick="App.jumpMockReviewQuestion(${i})">${i + 1}</button>`;
        }).join('');
    },

    jumpMockReviewQuestion(idx) {
        if (idx < 0 || idx >= this.mockQuestions.length) return;
        this.mockIndex = idx;
        this.showMockReviewQuestion();
    },

    backToMockResults() {
        document.getElementById('mockReview').style.display = 'none';
        document.getElementById('mockResults').style.display = 'block';
    },

    retryMockExam() {
        this.stopMockTimer();
        this.mockQuestions = [];
        this.mockAnswers = [];
        this.mockIndex = 0;
        document.getElementById('mockResults').style.display = 'none';
        document.getElementById('mockReview').style.display = 'none';
        document.getElementById('mockArea').style.display = 'none';
        document.getElementById('mockSetup').style.display = 'block';
    },

    /* =============== TIMER =============== */
    timerInterval: null,
    timerSeconds: 0,

    startTimer(seconds) {
        this.stopTimer();
        this.timerSeconds = seconds;
        this.updateTimerDisplay();

        this.timerInterval = setInterval(() => {
            this.timerSeconds--;
            this.updateTimerDisplay();
            if (this.timerSeconds <= 0) {
                this.showToast('Time is up!', 'warning');
                this.finishQuiz();
            }
        }, 1000);
    },

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    },

    updateTimerDisplay() {
        const mins = Math.floor(this.timerSeconds / 60);
        const secs = this.timerSeconds % 60;
        document.getElementById('timeDisplay').textContent = 
            String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        
        if (this.timerSeconds <= 60) {
            document.getElementById('quizTimer').style.color = 'var(--danger)';
        }
    },

    /* =============== ANIMATED LESSONS =============== */
    renderLessons() {
        const sel = document.getElementById('lessonSubject');
        const key = sel.value;
        const player = document.getElementById('lessonPlayer');
        const welcome = document.getElementById('lessonWelcome');
        const playBtn = document.getElementById('lessonPlayBtn');

        if (!key || !this.subjects[key]) {
            player.style.display = 'none';
            welcome.style.display = 'block';
            playBtn.disabled = true;
            return;
        }
        welcome.style.display = 'none';
        player.style.display = 'block';
        playBtn.disabled = false;

        const sub = this.subjects[key];
        const color = sub.color || 'var(--primary)';
        this._lessonSlides = [];
        this._lessonIndex = 0;
        this._lessonAutoTimer = null;
        this._lessonSubKey = key;

        // 1 — Welcome slide
        this._lessonSlides.push({
            type: 'welcome',
            html: `<div class="slide-icon" style="color:${color}"><i class="fas fa-graduation-cap"></i></div>
                   <span class="slide-subject-badge" style="background:${color}">${sub.name}</span>
                   <h2>Welcome to ${sub.name}</h2>
                   <p>Get ready to explore this JAMB subject through animated slides with narration.</p>`
        });

        // 2 — Topics overview
        if (sub.topics && sub.topics.length) {
            this._lessonSlides.push({
                type: 'topics',
                html: `<div class="slide-icon" style="color:${color}"><i class="fas fa-list"></i></div>
                       <span class="slide-subject-badge" style="background:${color}">Topics</span>
                       <h2>Topics Covered</h2>
                       <ul class="slide-list">${sub.topics.map(t => `<li>${t}</li>`).join('')}</ul>`
            });
        }

        // 3 — Key point slides (one per keyPoint)
        if (sub.summary && sub.summary.keyPoints) {
            sub.summary.keyPoints.forEach(kp => {
                this._lessonSlides.push({
                    type: 'keypoint',
                    html: `<div class="slide-icon" style="color:${color}"><i class="fas fa-lightbulb"></i></div>
                           <span class="slide-subject-badge" style="background:${color}">Key Point</span>
                           <h2>${kp}</h2>`
                });
            });
        }

        // 4 — Summary content
        if (sub.summary && sub.summary.content) {
            this._lessonSlides.push({
                type: 'content',
                html: `<div class="slide-icon" style="color:${color}"><i class="fas fa-book-open"></i></div>
                       <span class="slide-subject-badge" style="background:${color}">Summary</span>
                       <h2>Lesson Summary</h2>
                       <p>${sub.summary.content}</p>`
            });
        }

        // 5 — Q&A slides (up to 3)
        if (sub.questions && sub.questions.length) {
            const sample = sub.questions.slice(0, 3);
            sample.forEach((q, i) => {
                const qText = q.question || q.text || '';
                const ans = q.answer || q.correctAnswer || '';
                this._lessonSlides.push({
                    type: 'qa',
                    html: `<div class="slide-icon" style="color:${color}"><i class="fas fa-question-circle"></i></div>
                           <span class="slide-subject-badge" style="background:${color}">Question ${i + 1}</span>
                           <h2>Practice Question</h2>
                           <div class="slide-qa"><strong>Q:</strong><span>${qText}</span></div>
                           <div class="slide-qa" style="margin-top:8px"><strong>A:</strong><span>${ans}</span></div>`
                });
            });
        }

        // 6 — Closing slide
        this._lessonSlides.push({
            type: 'closing',
            html: `<div class="slide-icon" style="color:${color}"><i class="fas fa-flag-checkered"></i></div>
                   <span class="slide-subject-badge" style="background:${color}">Complete</span>
                   <h2>You've completed this lesson!</h2>
                   <p>Review the key points or try another subject. Keep studying and good luck on your JAMB exam!</p>`
        });

        // Apply subject color to progress bar
        document.getElementById('lessonProgressFill').style.background =
            `linear-gradient(90deg, ${color}, ${color}dd)`;
        document.getElementById('lessonSlide').style.borderTop = `3px solid ${color}`;

        this._showLessonSlide(0);
    },

    _showLessonSlide(idx) {
        const slides = this._lessonSlides;
        if (!slides || idx < 0 || idx >= slides.length) return;

        this._lessonIndex = idx;

        const slideEl = document.getElementById('lessonSlide');
        const fill = document.getElementById('lessonProgressFill');
        const text = document.getElementById('lessonProgressText');
        const prev = document.getElementById('lessonPrevBtn');
        const next = document.getElementById('lessonNextBtn');
        const pause = document.getElementById('lessonPauseBtn');

        slideEl.style.animation = 'none';
        slideEl.offsetHeight; // trigger reflow
        slideEl.style.animation = 'slideFadeIn 0.5s ease';

        document.getElementById('slideContent').innerHTML = slides[idx].html;
        fill.style.width = `${((idx + 1) / slides.length) * 100}%`;
        text.textContent = `Slide ${idx + 1} of ${slides.length}`;

        prev.disabled = idx === 0;
        next.disabled = idx === slides.length - 1;
        pause.disabled = false;

        // Auto-speak if TTS enabled
        if (this._lessonTTS) {
            this._speakLessonSlide(idx);
        }
    },

    _speakLessonSlide(idx) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();

        const slide = this._lessonSlides[idx];
        if (!slide) return;

        let text = '';
        if (slide.type === 'welcome') {
            const sub = this.subjects[this._lessonSubKey];
            text = `Welcome to ${sub.name}. ${sub.summary?.content || 'Let\'s begin this lesson.'}`;
        } else if (slide.type === 'topics') {
            const sub = this.subjects[this._lessonSubKey];
            text = `Topics covered: ${sub.topics.join(', ')}`;
        } else if (slide.type === 'keypoint') {
            text = slide.html.match(/<h2>([^<]+)<\/h2>/)?.[1] || 'Key point.';
        } else if (slide.type === 'content') {
            text = document.querySelector('.slide-content p')?.textContent || '';
        } else if (slide.type === 'qa') {
            text = document.querySelector('.slide-qa strong')?.textContent || 'Practice question.';
            const qSpan = document.querySelectorAll('.slide-qa span');
            text = qSpan.length ? `Question: ${qSpan[0].textContent}. Answer: ${qSpan[1]?.textContent || ''}` : 'Practice question.';
        } else if (slide.type === 'closing') {
            text = 'You have completed this lesson. Keep studying and good luck on your JAMB exam.';
        }

        if (!text) return;

        const utterance = new SpeechSynthesisUtterance(text);
        const speed = parseFloat(document.getElementById('lessonSpeed').value) || 1;
        utterance.rate = speed;
        utterance.pitch = 1;
        utterance.volume = 1;

        const lang = navigator.language || 'en-US';
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.lang.startsWith('en') && v.lang.includes('NG'))
            || voices.find(v => v.lang.startsWith('en'))
            || null;
        if (preferred) utterance.voice = preferred;
        utterance.lang = lang;

        window.speechSynthesis.speak(utterance);
    },

    _stopLessonSpeech() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    },

    _startLessonAuto() {
        this._stopAutoLesson();
        const speed = parseFloat(document.getElementById('lessonSpeed').value) || 1;
        const delay = Math.max(2000, 5000 / speed);
        this._lessonAutoTimer = setInterval(() => {
            if (this._lessonIndex < this._lessonSlides.length - 1) {
                this._showLessonSlide(this._lessonIndex + 1);
            } else {
                this._stopAutoLesson();
                document.getElementById('lessonPauseBtn').innerHTML = '<i class="fas fa-play"></i> Play';
            }
        }, delay);
    },

    _stopAutoLesson() {
        if (this._lessonAutoTimer) {
            clearInterval(this._lessonAutoTimer);
            this._lessonAutoTimer = null;
        }
    },

    /* =============== FORMULA SHEET =============== */
    renderFormulas() {
        const grid = document.getElementById('formulaGrid');
        const subject = document.getElementById('formulaSubject').value;
        const topic = document.getElementById('formulaTopic').value;
        const search = document.getElementById('formulaSearch').value.toLowerCase();
        const formulas = this.formulas;

        if (!formulas || Object.keys(formulas).length === 0) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-calculator"></i><p>No formulas available.</p></div>';
            return;
        }

        let entries = Object.entries(formulas);
        if (subject) entries = entries.filter(([k]) => k === subject);

        let items = [];
        entries.forEach(([subjKey, subj]) => {
            (subj.formulas || []).forEach(f => {
                if (topic && f.topic !== topic) return;
                if (search && !f.name.toLowerCase().includes(search) && !f.formula.toLowerCase().includes(search) && !f.desc.toLowerCase().includes(search)) return;
                items.push({ ...f, subjKey, subjectName: subj.name, subjectColor: subj.color });
            });
        });

        if (!items.length) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-square-root-variable"></i><p>No formulas match your search.</p></div>';
            return;
        }

        grid.innerHTML = items.map(f => `
            <div class="formula-card">
                <div class="formula-header">
                    <span class="formula-subject" style="background:${f.subjectColor}">${f.subjectName}</span>
                    <span class="formula-topic">${f.topic}</span>
                </div>
                <div class="formula-name" title="${f.name}">${f.name}</div>
                <div class="formula-expression" title="${f.formula}">${f.formula}</div>
                <div class="formula-desc">${f.desc}</div>
                <button class="btn btn-sm btn-outline formula-copy" onclick="App.copyFormula('${this._escapeCopy(f.formula)}')"><i class="fas fa-copy"></i> Copy</button>
            </div>
        `).join('');
    },

    _escapeCopy(text) {
        return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    },

    copyFormula(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Formula copied!', 'success');
        }).catch(() => {
            this.showToast('Could not copy formula.', 'error');
        });
    },

    /* =============== SUMMARIES =============== */
    renderSummaries() {
        const grid = document.getElementById('summariesGrid');
        const subject = document.getElementById('summarySubject').value;

        let entries = Object.entries(this.subjects);
        if (subject) entries = entries.filter(([k]) => k === subject);

        grid.innerHTML = entries.map(([key, subj]) => `
            <div class="summary-card">
                <h3><i class="fas ${subj.icon}" style="color:${subj.color}"></i> ${subj.summary.title}</h3>
                <div class="summary-content">${subj.summary.content}</div>
                <h4 style="margin-bottom:8px; font-size:0.9rem;">📌 Key Points</h4>
                <ul class="summary-points">
                    ${subj.summary.keyPoints.map(p => `<li>${p}</li>`).join('')}
                </ul>
                <h4 style="margin-bottom:8px; font-size:0.9rem; margin-top:12px;">❓ Practice Q&A</h4>
                <div class="summary-qa">
                    ${subj.summary.qa.map(qa => `
                        <div class="summary-qa-item">
                            <div class="qa-q">Q: ${qa.q}</div>
                            <div class="qa-a">A: ${qa.a}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    },

    /* =============== BOOKMARKS =============== */
    toggleBookmark(qId) {
        const idx = this.state.bookmarks.indexOf(qId);
        if (idx === -1) {
            this.state.bookmarks.push(qId);
            this.showToast('Question bookmarked!', 'success');
        } else {
            this.state.bookmarks.splice(idx, 1);
            this.showToast('Bookmark removed.', 'info');
        }
        localStorage.setItem('jambBookmarks', JSON.stringify(this.state.bookmarks));
        this.renderBookmarks();
        this.renderStudyQuestions();
        this.updateDashboard();
        this.updateProgress();
    },

    renderBookmarks() {
        const container = document.getElementById('bookmarksList');
        
        if (this.state.bookmarks.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-bookmark"></i><p>No bookmarked questions yet. Bookmark questions while studying for quick access!</p></div>';
            return;
        }

        const questions = [];
        this.state.bookmarks.forEach(id => {
            for (const subj of Object.values(this.subjects)) {
                const q = subj.questions.find(q => q.id === id);
                if (q) { questions.push({ ...q, subjectKey: this.getSubjectForQuestion(id) }); break; }
            }
        });

        container.innerHTML = questions.map(q => this.renderQuestionCard(q, q.subjectKey)).join('');
    },

    clearBookmarks() {
        if (this.state.bookmarks.length === 0) return;
        this.state.bookmarks = [];
        localStorage.setItem('jambBookmarks', JSON.stringify(this.state.bookmarks));
        this.renderBookmarks();
        this.showToast('All bookmarks cleared.', 'info');
    },

    /* =============== DASHBOARD =============== */
    updateDashboard() {
        const stats = this.getStats();
        document.getElementById('statCorrect').textContent = stats.correct;
        document.getElementById('statWrong').textContent = stats.wrong;
        document.getElementById('statScore').textContent = stats.accuracy + '%';
        document.getElementById('statStreak').textContent = stats.bestStreak;
        document.getElementById('totalAnswered').textContent = stats.totalAnswered;

        // Daily tip
        const today = new Date().toDateString();
        const tipIndex = this.hashCode(today) % this.dailyTips.length;
        document.getElementById('dailyTip').textContent = this.dailyTips[Math.abs(tipIndex)];

        // Recent activity
        const recent = document.getElementById('recentActivity');
        const last5 = this.state.history.slice(-5).reverse();
        if (last5.length === 0) {
            recent.innerHTML = '<p class="text-muted">No activity yet. Start studying!</p>';
        } else {
            recent.innerHTML = last5.map(h => {
                const subjName = h.subject && this.subjects[h.subject] ? this.subjects[h.subject].name : 'Mixed';
                const date = new Date(h.date).toLocaleDateString();
                return `<div class="recent-item" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.85rem;">
                    <span><strong>${subjName}</strong> - ${h.score}%</span>
                    <span style="color:var(--text-secondary)">${date}</span>
                </div>`;
            }).join('');
        }

        // Weak topics
        this.renderWeakTopics();

        // Performance chart
        this.renderPerformanceChart();
    },

    renderWeakTopics() {
        const container = document.getElementById('weakTopics');
        const topicStats = {};
        
        this.state.history.forEach(h => {
            (h.questions || []).forEach(q => {
                const question = this.findQuestion(q.id);
                if (!question) return;
                const key = `${this.getSubjectForQuestion(q.id) || 'unknown'}:${question.topic}`;
                if (!topicStats[key]) topicStats[key] = { total: 0, correct: 0 };
                topicStats[key].total++;
                if (q.correct) topicStats[key].correct++;
            });
        });

        const weak = Object.entries(topicStats)
            .filter(([, s]) => s.total >= 2)
            .map(([key, s]) => ({ key, accuracy: (s.correct / s.total) * 100 }))
            .sort((a, b) => a.accuracy - b.accuracy)
            .slice(0, 5);

        if (weak.length === 0) {
            container.innerHTML = '<p class="text-muted">Complete more quizzes to get insights.</p>';
        } else {
            container.innerHTML = weak.map(w => {
                const [subjKey, topic] = w.key.split(':');
                const subj = this.subjects[subjKey];
                return `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.85rem;border-bottom:1px solid var(--border);">
                    <span>${subj ? subj.name : ''} - ${topic}</span>
                    <span style="color:${w.accuracy < 50 ? 'var(--danger)' : 'var(--warning)'}">${Math.round(w.accuracy)}%</span>
                </div>`;
            }).join('');
        }
    },

    renderPerformanceChart() {
        const ctx = document.getElementById('performanceChart');
        if (!ctx) return;
        const parent = ctx.parentElement;
        const existingCanvas = parent.querySelector('canvas');
        if (existingCanvas && existingCanvas.chart) existingCanvas.chart.destroy();

        const history = this.state.history.slice(-10);
        if (history.length === 0) {
            // Show empty placeholder
            return;
        }

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.map((_, i) => `Quiz ${i + 1}`),
                datasets: [{
                    label: 'Score %',
                    data: history.map(h => h.score),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99,102,241,0.1)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#6366f1',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    },

    renderResultChart(correct, wrong, skipped) {
        const ctx = document.getElementById('resultChart');
        if (!ctx) return;

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Correct', 'Wrong', 'Skipped'],
                datasets: [{
                    data: [correct, wrong, skipped],
                    backgroundColor: ['#10b981', '#ef4444', '#3b82f6'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } }
                },
                cutout: '60%'
            }
        });
    },

    /* =============== PROGRESS =============== */
    updateProgress() {
        const stats = this.getStats();
        document.getElementById('progTotal').textContent = stats.totalAnswered;
        document.getElementById('progAccuracy').textContent = stats.accuracy + '%';
        document.getElementById('progQuizzes').textContent = stats.totalQuizzes;
        document.getElementById('progBookmarks').textContent = this.state.bookmarks.length;

        // Subject chart
        this.renderSubjectChart();
        // Trend chart
        this.renderTrendChart();
        // Weekly chart
        this.renderWeeklyChart();
    },

    renderSubjectChart() {
        const ctx = document.getElementById('subjectChart');
        if (!ctx) return;
        
        const labels = [];
        const data = [];
        const colors = [];

        Object.entries(this.subjects).forEach(([key, subj]) => {
            const history = this.state.history.filter(h => h.subject === key);
            const total = history.reduce((sum, h) => sum + h.total, 0);
            const correct = history.reduce((sum, h) => sum + h.correct, 0);
            if (total > 0) {
                labels.push(subj.name);
                data.push(Math.round((correct / total) * 100));
                colors.push(subj.color);
            }
        });

        if (data.length === 0) return;

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Accuracy %',
                    data,
                    backgroundColor: colors.map(c => c + '88'),
                    borderColor: colors,
                    borderWidth: 2,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    },

    renderTrendChart() {
        const ctx = document.getElementById('trendChart');
        if (!ctx) return;

        const history = this.state.history.slice(-10);
        if (history.length === 0) return;

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.map((_, i) => `#${i + 1}`),
                datasets: [{
                    label: 'Score',
                    data: history.map(h => h.score),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16,185,129,0.1)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#10b981'
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    },

    renderWeeklyChart() {
        const ctx = document.getElementById('weeklyChart');
        if (!ctx) return;

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const today = new Date().getDay();
        const weekData = Array(7).fill(0);
        const weekCorrect = Array(7).fill(0);

        this.state.history.forEach(h => {
            const d = new Date(h.date);
            const now = new Date();
            const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
            if (diff < 7) {
                const dayIdx = d.getDay();
                weekData[dayIdx] += h.total;
                weekCorrect[dayIdx] += h.correct;
            }
        });

        const labels = days.map((d, i) => {
            const dayLabels = [];
            for (let j = today; j >= 0; j--) dayLabels.push(days[j]);
            for (let j = 6; j > today; j--) dayLabels.push(days[j]);
            return dayLabels;
        })[0];

        const reorderedData = [];
        const reorderedCorrect = [];
        for (let i = today + 1; i < 7; i++) {
            reorderedData.push(weekData[i]);
            reorderedCorrect.push(weekCorrect[i]);
        }
        for (let i = 0; i <= today; i++) {
            reorderedData.push(weekData[i]);
            reorderedCorrect.push(weekCorrect[i]);
        }

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Questions',
                    data: reorderedData,
                    backgroundColor: '#6366f188',
                    borderColor: '#6366f1',
                    borderWidth: 2,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    },

    /* =============== ACHIEVEMENTS =============== */
    renderAchievements() {
        const stats = this.getStats();
        const grid = document.getElementById('achievementsGrid');
        
        grid.innerHTML = this.achievements.map(a => {
            const unlocked = a.check(stats);
            return `<div class="achievement ${unlocked ? 'unlocked' : 'locked'}">
                <i class="fas ${a.icon}"></i>
                <span class="a-title">${a.title}</span>
                <span class="a-desc">${a.desc}</span>
            </div>`;
        }).join('');
    },

    /* =============== STATS =============== */
    getStats() {
        let totalAnswered = 0;
        let correct = 0;
        let wrong = 0;
        const subjectsStudied = new Set();
        let bestStreak = 0;
        let currentStreak = 0;

        this.state.history.forEach(h => {
            totalAnswered += h.total;
            correct += h.correct;
            wrong += h.wrong;
            if (h.subject) subjectsStudied.add(h.subject);
            
            if (h.score >= 50) {
                currentStreak++;
                bestStreak = Math.max(bestStreak, currentStreak);
            } else {
                currentStreak = 0;
            }
        });

        const accuracy = totalAnswered > 0 ? Math.round((correct / totalAnswered) * 100) : 0;
        const perfectQuizzes = parseInt(localStorage.getItem('jambPerfectQuizzes') || '0');

        return {
            totalAnswered,
            correct,
            wrong,
            accuracy,
            totalQuizzes: this.state.history.length,
            subjectsStudied: subjectsStudied.size,
            bestStreak,
            currentStreak,
            perfectQuizzes,
            bookmarks: this.state.bookmarks.length,
            practicalViews: parseInt(localStorage.getItem('jambPracticalViews') || '0'),
            streak: currentStreak
        };
    },

    /* =============== NAVIGATION =============== */
    navigateTo(page) {
        this.state.currentPage = page;
        
        // Update sidebar
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
        if (navItem) navItem.classList.add('active');

        // Show page
        document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
        const targetPage = document.getElementById(`page-${page}`);
        if (targetPage) targetPage.classList.add('active');

        // Refresh content
        switch (page) {
            case 'dashboard': this.updateDashboard(); break;
            case 'subjects': this.renderSubjects(); break;
            case 'study': this.renderStudyQuestions(); break;
            case 'formulas': this.renderFormulas(); break;
            case 'lessons': this.renderLessons(); break;
            case 'summaries': this.renderSummaries(); break;
            case 'bookmarks': this.renderBookmarks(); break;
            case 'practicals': this.renderPracticals(); break;
            case 'mock': this.retryMockExam(); break;
            case 'courses': this.renderCourses(); break;
            case 'syllabus': this.renderSyllabus(); break;
            case 'novel': this.renderNovel(); break;
            case 'flashcards': this.renderFlashcards(); break;
            case 'tips': this.renderTips(); break;
            case 'studyplan': this.renderStudyPlan(); break;
            case 'glossary': this.renderGlossary(); break;
            case 'registration': this.renderRegistration(); break;
            case 'animations': this.renderAnimations(); break;
            case 'progress': this.updateProgress(); this.renderAchievements(); break;
        }

        // Close mobile sidebar
        this.closeSidebar();
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    /* =============== SEARCH =============== */
    handleSearch(e) {
        const query = e.target.value.trim();
        if (query.length < 2) return;

        // Navigate to study page with search
        this.navigateTo('study');
        document.getElementById('studySearch').value = query;
        this.state.currentStudyPage = 1;
        this.renderStudyQuestions();
    },

    /* =============== THEME =============== */
    loadTheme() {
        if (this.state.theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    },

    toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            this.state.theme = 'light';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            this.state.theme = 'dark';
        }
        localStorage.setItem('jambTheme', this.state.theme);
        this.updateThemeIcons();
    },

    updateThemeIcons() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const icon = isDark ? 'fa-sun' : 'fa-moon';
        const text = isDark ? 'Light Mode' : 'Dark Mode';
        document.querySelectorAll('.theme-toggle i, .theme-toggle-mobile i').forEach(el => {
            el.className = `fas ${icon}`;
        });
        document.querySelectorAll('.theme-toggle span').forEach(el => {
            el.textContent = text;
        });
    },

    /* =============== SHARE =============== */
    shareQuestion(qId) {
        const q = this.findQuestion(qId);
        if (!q) return;
        
        const text = `📚 JAMB Practice: ${q.question}\n\nCorrect answer: ${q.answer}\n\nJoin JAMB Mastery Pro to practice more!`;
        
        if (navigator.share) {
            navigator.share({ title: 'JAMB Question', text }).catch(() => {});
        } else {
            navigator.clipboard.writeText(text).then(() => {
                this.showToast('Question copied to clipboard!', 'success');
            });
        }
    },

    shareApp() {
        const url = window.location.href;
        const text = '📚 Master JAMB with JAMB Mastery Pro - past questions, quizzes, animated explainers, and more!';
        if (navigator.share) {
            navigator.share({ title: 'JAMB Mastery Pro', url, text }).catch(() => {});
        } else {
            navigator.clipboard.writeText(`${text}\n\n${url}`).then(() => {
                this.showToast('Link copied to clipboard!', 'success');
            });
        }
    },

    installApp() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            this.deferredPrompt.userChoice.then((result) => {
                if (result.outcome === 'accepted') {
                    this.showToast('App installed!', 'success');
                }
                this.deferredPrompt = null;
            });
        } else {
            this.showToast('Open browser menu → Install app (or Add to Home Screen)', 'info');
        }
    },

    /* =============== UTILITIES =============== */
    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash;
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    /* =============== PRIVACY & COOKIE CONSENT =============== */
    showPrivacyPolicy() {
        document.getElementById('privacyModal').classList.add('show');
        document.body.style.overflow = 'hidden';
    },

    closePrivacyModal() {
        document.getElementById('privacyModal').classList.remove('show');
        document.body.style.overflow = '';
    },

    getCookiePrefs() {
        try {
            return JSON.parse(localStorage.getItem('jambCookiePrefs') || 'null');
        } catch { return null; }
    },

    setCookiePrefs(prefs) {
        localStorage.setItem('jambCookiePrefs', JSON.stringify(prefs));
    },

    showCookieSettings() {
        const prefs = this.getCookiePrefs() || { essential: true, analytics: false, ads: false };
        document.getElementById('cookieAnalytics').checked = prefs.analytics || false;
        document.getElementById('cookieAds').checked = prefs.ads !== false;
        document.getElementById('cookieModal').classList.add('show');
        document.body.style.overflow = 'hidden';
    },

    closeCookieModal() {
        document.getElementById('cookieModal').classList.remove('show');
        document.body.style.overflow = '';
    },

    saveCookieSettings() {
        const prefs = {
            essential: true,
            analytics: document.getElementById('cookieAnalytics').checked,
            ads: document.getElementById('cookieAds').checked
        };
        this.setCookiePrefs(prefs);
        this.closeCookieModal();
        document.getElementById('cookieBanner').classList.remove('show');
        this.initAdSense();
        this.showToast('Cookie preferences saved.', 'success');
    },

    acceptAllCookies() {
        const prefs = { essential: true, analytics: true, ads: true };
        this.setCookiePrefs(prefs);
        this.closeCookieModal();
        document.getElementById('cookieBanner').classList.remove('show');
        this.initAdSense();
        this.showToast('All cookies accepted.', 'success');
    },

    acceptCookies() {
        this.acceptAllCookies();
    },

    declineCookies() {
        const prefs = { essential: true, analytics: false, ads: false };
        this.setCookiePrefs(prefs);
        document.getElementById('cookieBanner').classList.remove('show');
    },

    initAdSense() {
        const prefs = this.getCookiePrefs();
        if (prefs && prefs.ads === false) return;
        try {
            (adsbygoogle = window.adsbygoogle || []).push({});
        } catch(e) {}
    },

    initCookieBanner() {
        const prefs = this.getCookiePrefs();
        if (!prefs) {
            setTimeout(() => {
                document.getElementById('cookieBanner').classList.add('show');
            }, 1000);
        }
    },

    openSidebar() {
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('overlay').classList.add('show');
        document.body.style.overflow = 'hidden';
    },

    closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('overlay').classList.remove('show');
        document.body.style.overflow = '';
    },

    /* =============== COURSES =============== */
    renderCourses() {
        const grid = document.getElementById('coursesGrid');
        const filter = document.getElementById('coursesFilter').value;
        const search = document.getElementById('coursesSearch').value.toLowerCase();

        let data = this.courses;
        if (filter) data = data.filter(c => c.department === filter);
        if (search) data = data.filter(c => c.department.toLowerCase().includes(search));

        if (!data.length) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-university"></i><p>No courses match your criteria.</p></div>';
            return;
        }

        grid.innerHTML = data.map(c => `
            <div class="course-card">
                <div class="course-header">
                    <h3>${c.department}</h3>
                    <span class="course-cutoff">Cut-off: ${c.cutoff}</span>
                </div>
                <div class="course-subjects">
                    <strong>JAMB Subjects:</strong> ${c.subjects.join(', ')}
                </div>
                <div class="course-universities">
                    <strong>Top Universities:</strong>
                    <ul>${c.universities.map(u => `<li>${u}</li>`).join('')}</ul>
                </div>
            </div>
        `).join('');
    },

    populateCoursesFilter() {
        const sel = document.getElementById('coursesFilter');
        const depts = [...new Set(this.courses.map(c => c.department))];
        sel.innerHTML = '<option value="">All Departments</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
    },

    /* =============== SYLLABUS =============== */
    renderSyllabus() {
        const grid = document.getElementById('syllabusGrid');
        const subject = document.getElementById('syllabusSubject').value;
        const saved = JSON.parse(localStorage.getItem('jambSyllabusProgress') || '{}');

        let entries = Object.entries(this.syllabus);
        if (subject) entries = entries.filter(([k]) => k === subject);

        let totalTopics = 0;
        let completedTopics = 0;

        grid.innerHTML = entries.map(([key, data]) => {
            const subj = this.subjects[key];
            const subjName = subj ? subj.name : key;
            const subjColor = data.color || 'var(--primary)';
            const topics = data.topics || [];

            const topicHtml = topics.map(t => {
                const id = `syl-${key}-${t.replace(/\s+/g, '-')}`;
                const checked = saved[id] || false;
                if (checked) completedTopics++;
                totalTopics++;
                return `<label class="syllabus-item ${checked ? 'done' : ''}">
                    <input type="checkbox" ${checked ? 'checked' : ''} data-sylid="${id}" onchange="App.toggleSyllabusTopic('${id}')">
                    <span class="syllabus-check"></span>
                    <span>${t}</span>
                </label>`;
            }).join('');

            return `<div class="syllabus-subject-card">
                <h3 style="color:${subjColor}"><i class="fas fa-circle" style="color:${subjColor}"></i> ${subjName}</h3>
                <div class="syllabus-topics">${topicHtml}</div>
            </div>`;
        }).join('');

        document.getElementById('syllabusCompleted').textContent = completedTopics;
        document.getElementById('syllabusTotal').textContent = totalTopics;
        const pct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
        document.getElementById('syllabusPercent').textContent = pct + '%';
        document.getElementById('syllabusProgressFill').style.width = pct + '%';
    },

    toggleSyllabusTopic(id) {
        const saved = JSON.parse(localStorage.getItem('jambSyllabusProgress') || '{}');
        saved[id] = !saved[id];
        localStorage.setItem('jambSyllabusProgress', JSON.stringify(saved));
        this.renderSyllabus();
    },

    resetSyllabusProgress() {
        localStorage.removeItem('jambSyllabusProgress');
        this.renderSyllabus();
        this.showToast('Syllabus progress reset.', 'info');
    },

    /* =============== NOVEL =============== */
    renderNovel() {
        const container = document.getElementById('novelContent');
        const novel = this.novel;

        if (!novel) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-book"></i><p>Novel data not available.</p></div>';
            return;
        }

        container.innerHTML = `
            <div class="novel-header">
                <div class="novel-cover">
                    <i class="fas ${novel.icon || 'fa-book'}" style="font-size:3rem;color:${novel.color || 'var(--primary)'}"></i>
                </div>
                <div class="novel-info">
                    <h2>${novel.title}</h2>
                    <p class="novel-author">by ${novel.author}</p>
                    <p class="novel-year">JAMB ${novel.year} Recommended Text</p>
                    <p class="novel-summary">${novel.summary}</p>
                </div>
            </div>

            <div class="novel-section">
                <h3><i class="fas fa-users"></i> Characters</h3>
                <div class="novel-characters">
                    ${(novel.characters || []).map(ch => `
                        <div class="character-card">
                            <div class="character-name">${ch.name}</div>
                            <div class="character-role">${ch.role}</div>
                            <div class="character-desc">${ch.desc}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="novel-section">
                <h3><i class="fas fa-theater-masks"></i> Themes</h3>
                <div class="novel-themes">
                    ${(novel.themes || []).map(th => `
                        <div class="theme-card">
                            <h4>${th.title}</h4>
                            <p>${th.desc}</p>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="novel-section">
                <h3><i class="fas fa-list"></i> Chapter Summaries</h3>
                <div class="novel-chapters">
                    ${(novel.chapters || []).map(ch => `
                        <div class="chapter-card">
                            <h4>${ch.title}</h4>
                            <p>${ch.summary}</p>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="novel-section">
                <h3><i class="fas fa-question-circle"></i> Practice Q&A</h3>
                <div class="novel-qa">
                    ${(novel.questions || []).map(qa => `
                        <div class="novel-qa-item">
                            <div class="novel-q">Q: ${qa.q}</div>
                            <div class="novel-a">A: ${qa.a}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    /* =============== FLASHCARDS =============== */
    renderFlashcards() {
        const subject = document.getElementById('flashcardSubject').value;
        let cards = [];
        if (subject && this.flashcards[subject]) {
            cards = this.flashcards[subject].map(c => ({ ...c, subject }));
        } else {
            Object.entries(this.flashcards).forEach(([key, arr]) => {
                arr.forEach(c => cards.push({ ...c, subject: key }));
            });
        }

        if (!cards.length) {
            document.getElementById('flashcardContainer').innerHTML = '<div class="empty-state"><i class="fas fa-layer-group"></i><p>No flashcards available.</p></div>';
            return;
        }

        this._flashcardData = cards;
        this._flashcardIndex = 0;
        this.showFlashcard(0);
    },

    showFlashcard(idx) {
        const cards = this._flashcardData;
        if (!cards || !cards.length) return;
        if (idx < 0) idx = 0;
        if (idx >= cards.length) idx = cards.length - 1;
        this._flashcardIndex = idx;
        const card = cards[idx];

        document.getElementById('flashcardFront').innerHTML = `<div class="flashcard-subject">${this.subjects[card.subject]?.name || card.subject}</div><div class="flashcard-question">${card.front}</div>`;
        document.getElementById('flashcardBack').innerHTML = `<div class="flashcard-answer">${card.back}</div>`;
        document.getElementById('flashcardCounter').textContent = `${idx + 1} / ${cards.length}`;

        // Reset flip
        document.getElementById('flashcardInner').classList.remove('flipped');
    },

    flipFlashcard() {
        document.getElementById('flashcardInner').classList.toggle('flipped');
    },

    nextFlashcard() {
        if (this._flashcardIndex < this._flashcardData.length - 1) {
            this.showFlashcard(this._flashcardIndex + 1);
        }
    },

    prevFlashcard() {
        if (this._flashcardIndex > 0) {
            this.showFlashcard(this._flashcardIndex - 1);
        }
    },

    shuffleFlashcards() {
        const cards = this._flashcardData;
        if (!cards) return;
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
        this._flashcardData = cards;
        this.showFlashcard(0);
        this.showToast('Flashcards shuffled!', 'success');
    },

    /* =============== EXAM TIPS =============== */
    renderTips() {
        const container = document.getElementById('tipsCategories');
        container.innerHTML = this.tips.map(cat => `
            <div class="tip-category">
                <div class="tip-category-header" onclick="App.toggleTipCategory(this)">
                    <div class="tip-category-title">
                        <i class="fas ${cat.icon}"></i>
                        <h3>${cat.category}</h3>
                    </div>
                    <i class="fas fa-chevron-down tip-arrow"></i>
                </div>
                <div class="tip-category-body" style="display:none">
                    <ul class="tip-list">
                        ${cat.tips.map(t => `<li>${t}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `).join('');
    },

    toggleTipCategory(el) {
        const body = el.nextElementSibling;
        const arrow = el.querySelector('.tip-arrow');
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    },

    /* =============== STUDY PLAN =============== */
    renderStudyPlan() {
        const container = document.getElementById('studyplanContent');
        const selected = document.getElementById('studyplanSelect').value;
        const plan = this.studyPlans[selected];

        if (!plan) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-alt"></i><p>No study plan available.</p></div>';
            return;
        }

        container.innerHTML = `
            <div class="studyplan-header">
                <h2>${plan.title}</h2>
                <p>${plan.desc}</p>
            </div>
            <div class="studyplan-weeks">
                ${plan.weeks.map(w => `
                    <div class="studyplan-week card">
                        <div class="studyplan-week-header">
                            <span class="studyplan-week-num">Week ${w.week}</span>
                            <span class="studyplan-week-focus">${w.focus}</span>
                        </div>
                        <ul class="studyplan-tasks">
                            ${w.tasks.map(t => `<li><i class="fas fa-check-circle"></i> ${t}</li>`).join('')}
                        </ul>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /* =============== GLOSSARY =============== */
    renderGlossary() {
        const container = document.getElementById('glossaryList');
        const search = document.getElementById('glossarySearch').value.toLowerCase();

        let data = this.glossary;
        if (search) data = data.filter(g => g.term.toLowerCase().includes(search) || g.definition.toLowerCase().includes(search));

        if (!data.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-book"></i><p>No glossary terms found.</p></div>';
            return;
        }

        container.innerHTML = data.map(g => `
            <div class="glossary-item">
                <div class="glossary-term">${g.term}</div>
                <div class="glossary-def">${g.definition}</div>
            </div>
        `).join('');
    },

    /* =============== REGISTRATION GUIDE =============== */
    renderRegistration() {
        const container = document.getElementById('registrationContent');
        const tab = document.querySelector('.registration-tabs .btn.active');
        const section = tab ? tab.dataset.regtab : 'steps';

        if (section === 'steps') {
            container.innerHTML = `
                <h3><i class="fas fa-list-ol"></i> Registration Steps</h3>
                <div class="reg-steps">
                    ${this.register.steps.map(s => `
                        <div class="reg-step">
                            <div class="reg-step-num">${s.step}</div>
                            <div class="reg-step-body">
                                <h4>${s.title}</h4>
                                <p>${s.desc}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (section === 'requirements') {
            container.innerHTML = `
                <h3><i class="fas fa-check-list"></i> Requirements</h3>
                <ul class="reg-requirements">
                    ${this.register.requirements.map(r => `<li><i class="fas fa-check-circle"></i> ${r}</li>`).join('')}
                </ul>
            `;
        } else if (section === 'faq') {
            container.innerHTML = `
                <h3><i class="fas fa-question-circle"></i> Frequently Asked Questions</h3>
                <div class="reg-faq">
                    ${this.register.faq.map(f => `
                        <div class="reg-faq-item">
                            <div class="reg-faq-q">Q: ${f.q}</div>
                            <div class="reg-faq-a">A: ${f.a}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    },

    /* =============== ANIMATED EXPLAINERS =============== */
    renderAnimations() {
        const animSubject = document.getElementById('animSubject').value;
        const animSelect = document.getElementById('animSelect');
        if (!animSubject) {
            document.getElementById('animViewport').innerHTML = '<div class="anim-placeholder"><i class="fas fa-hand-pointer"></i><p>Select a subject and animation above to begin</p></div>';
            document.getElementById('animInfo').style.display = 'none';
            return;
        }
        const subjectData = this.animations[animSubject];
        if (!subjectData) {
            document.getElementById('animViewport').innerHTML = '<div class="anim-placeholder"><i class="fas fa-film"></i><p>No animated explainers available for this subject yet</p></div>';
            document.getElementById('animInfo').style.display = 'none';
            return;
        }
        const current = animSelect.value;
        animSelect.innerHTML = '<option value="">Choose animation</option>' +
            subjectData.items.map(a => `<option value="${a.id}">${a.title}</option>`).join('');
        if (current && subjectData.items.some(a => a.id === current)) animSelect.value = current;
        if (animSelect.value) {
            this.showAnimation(animSelect.value);
        } else {
            document.getElementById('animViewport').innerHTML = '<div class="anim-placeholder"><i class="fas fa-hand-pointer"></i><p>Choose an animation from the list</p></div>';
            document.getElementById('animInfo').style.display = 'none';
        }
    },

    showAnimation(id) {
        const viewport = document.getElementById('animViewport');
        const info = document.getElementById('animInfo');
        let animData = null;
        for (const key in this.animations) {
            const found = this.animations[key].items.find(a => a.id === id);
            if (found) { animData = found; break; }
        }
        if (!animData) return;
        document.getElementById('animTitle').textContent = animData.title;
        document.getElementById('animDesc').textContent = animData.desc;
        document.getElementById('animTopics').innerHTML = animData.topics.map(t => `<span class="topic-tag">${t}</span>`).join('');
        document.getElementById('animFormula').innerHTML = `<i class="fas fa-superscript"></i> ${animData.formula}`;
        document.getElementById('animFact').querySelector('span').textContent = animData.fact;
        info.style.display = 'block';
        viewport.innerHTML = this.getAnimationScene(id);
        this.resetAnimation();
    },

    getAnimationScene(id) {
        switch (id) {
            case 'pendulum': return `
                <div class="anim-scene">
                    <div class="pendulum-pivot"><div class="pivot-dot"></div></div>
                    <div class="pendulum-arm">
                        <div class="pendulum-line"></div>
                        <div class="pendulum-bob"></div>
                    </div>
                </div>`;
            case 'wave': return `
                <div class="anim-scene wave-scene">
                    <div class="wave-src"></div>
                    ${Array.from({length: 20}, (_, i) => `<div class="wave-dot" style="--i:${i};--left:${8 + i * 4.2}%"></div>`).join('')}
                </div>`;
            case 'circuit': return `
                <div class="anim-scene circuit-scene">
                    <svg viewBox="0 0 320 200">
                        <rect x="15" y="15" width="290" height="170" rx="20" fill="none" stroke="var(--border)" stroke-width="3" id="circuitPath"/>
                        <rect x="15" y="15" width="290" height="170" rx="20" fill="none" stroke="#3B82F6" stroke-width="3" stroke-dasharray="8 8" id="circuitFlow"/>
                        <rect x="0" y="80" width="40" height="40" rx="6" fill="#64748B"/><text x="20" y="105" text-anchor="middle" fill="white" font-size="11">+−</text>
                        <circle cx="160" cy="35" r="18" fill="#F59E0B" opacity="0.8"/><text x="160" y="40" text-anchor="middle" fill="white" font-size="14">💡</text>
                        <circle cx="300" cy="100" r="6" fill="#F87171" opacity="0">
                            <animate attributeName="opacity" values="0;1;0" dur="1.5s" repeatCount="indefinite"/>
                        </circle>
                    </svg>
                </div>`;
            case 'projectile': return `
                <div class="anim-scene projectile-scene">
                    <div class="proj-ground"></div>
                    <div class="proj-trail"></div>
                    <div class="proj-ball"></div>
                </div>`;
            case 'refraction': return `
                <div class="anim-scene refract-scene">
                    <svg viewBox="0 0 300 200">
                        <line x1="0" y1="100" x2="300" y2="100" stroke="var(--border)" stroke-width="2"/>
                        <text x="20" y="90" fill="var(--text-secondary)" font-size="11">Air</text>
                        <text x="20" y="115" fill="var(--text-secondary)" font-size="11">Water</text>
                        <line x1="150" y1="10" x2="150" y2="190" stroke="var(--border)" stroke-width="1" stroke-dasharray="4 4"/>
                        <text x="155" y="15" fill="var(--text-secondary)" font-size="9">Normal</text>
                        <line class="refract-incident" x1="60" y1="30" x2="150" y2="100" stroke="#3B82F6" stroke-width="2.5"/>
                        <text x="65" y="25" fill="#3B82F6" font-size="10">Incident ray</text>
                        <line class="refract-bent" x1="150" y1="100" x2="230" y2="170" stroke="#EF4444" stroke-width="2.5"/>
                        <text x="235" y="175" fill="#EF4444" font-size="10">Refracted ray</text>
                        <path d="M 100 100 A 50 50 0 0 0 120 80" fill="none" stroke="#F59E0B" stroke-width="1.5"/>
                        <text x="110" y="85" fill="#F59E0B" font-size="9">&theta;<sub>i</sub></text>
                        <path d="M 180 100 A 30 30 0 0 1 167 115" fill="none" stroke="#10B981" stroke-width="1.5"/>
                        <text x="172" y="118" fill="#10B981" font-size="9">&theta;<sub>r</sub></text>
                    </svg>
                </div>`;
            case 'newtons-laws': return `
                <div class="anim-scene newt-scene">
                    <div class="newt-card law1"><div class="newt-num">I</div><div class="newt-title">Inertia</div><div class="newt-desc">Object at rest stays at rest</div><div class="newt-box"><div class="box-body"></div></div></div>
                    <div class="newt-card law2"><div class="newt-num">II</div><div class="newt-title">F = ma</div><div class="newt-desc">Force causes acceleration</div><div class="newt-box"><div class="box-body pushed"></div><div class="force-arrow">&rarr;</div></div></div>
                    <div class="newt-card law3"><div class="newt-num">III</div><div class="newt-title">Action-Reaction</div><div class="newt-desc">Equal and opposite forces</div><div class="newt-pair"><div class="action-arrow">&larr;</div><span>Wall</span><div class="reaction-arrow">&rarr;</div></div></div>
                </div>`;
            case 'thermal-expansion': return `
                <div class="anim-scene thermal-scene">
                    <div class="therm-bar">
                        <div class="therm-particle" style="--d:0s;--x:15%"></div>
                        <div class="therm-particle" style="--d:0.2s;--x:35%"></div>
                        <div class="therm-particle" style="--d:0.4s;--x:55%"></div>
                        <div class="therm-particle" style="--d:0.6s;--x:75%"></div>
                    </div>
                    <div class="therm-label">Cold</div>
                    <div class="therm-bar hot">
                        <div class="therm-particle hot" style="--d:0s;--x:12%"></div>
                        <div class="therm-particle hot" style="--d:0.15s;--x:30%"></div>
                        <div class="therm-particle hot" style="--d:0.3s;--x:50%"></div>
                        <div class="therm-particle hot" style="--d:0.45s;--x:68%"></div>
                        <div class="therm-particle hot" style="--d:0.6s;--x:85%"></div>
                    </div>
                    <div class="therm-label hot">Hot &rarr; Expands</div>
                </div>`;
            case 'atom': return `
                <div class="anim-scene atom-scene">
                    <div class="atom-nucleus"><span>+</span></div>
                    <div class="atom-orbit" style="--r:55px;--speed:3s;--tilt:0deg"><div class="electron" style="--delay:0s"></div></div>
                    <div class="atom-orbit" style="--r:90px;--speed:4.5s;--tilt:30deg"><div class="electron" style="--delay:0.7s"></div></div>
                    <div class="atom-orbit" style="--r:125px;--speed:6s;--tilt:60deg"><div class="electron" style="--delay:1.4s"></div></div>
                </div>`;
            case 'bonding': return `
                <div class="anim-scene bonding-scene">
                    <div class="bond-atom na-atom"><span class="bond-symbol">Na</span><div class="valence-e"></div></div>
                    <div class="bond-plus">+</div>
                    <div class="bond-atom cl-atom"><span class="bond-symbol">Cl</span><div class="valence-empty"></div></div>
                    <div class="bond-arrow">&rarr;</div>
                    <div class="bond-result na-ion"><span class="bond-symbol">Na<sup>+</sup></span></div>
                    <div class="bond-plus">+</div>
                    <div class="bond-result cl-ion"><span class="bond-symbol">Cl<sup>&minus;</sup></span></div>
                </div>`;
            case 'ph-scale': return `
                <div class="anim-scene ph-scene">
                    <div class="ph-bar">
                        ${Array.from({length:15}, (_, i) => `<div class="ph-seg" style="background:${['#FF0000','#FF3300','#FF6600','#FF9900','#FFCC00','#FFFF00','#CCFF00','#00CC00','#00FF66','#00FFCC','#00CCFF','#0066FF','#3300FF','#6600FF','#9900FF'][i]};width:${100/15}%"></div>`).join('')}
                    </div>
                    <div class="ph-indicator" id="phIndicator" style="left:${7/15*100}%"><div class="ph-arrow">&#9660;</div><div class="ph-value">7 Neutral</div></div>
                    <div class="ph-labels"><span>0 Acidic</span><span>14 Basic</span></div>
                    <div class="ph-btns"><button class="btn btn-sm btn-outline" onclick="App.shiftPH(-1)">-1</button><button class="btn btn-sm btn-outline" onclick="App.shiftPH(1)">+1</button><button class="btn btn-sm btn-outline" onclick="App.shiftPH(0)">Reset</button></div>
                </div>`;
            case 'electrolysis': return `
                <div class="anim-scene elec-scene">
                    <div class="elec-cell">
                        <div class="elec-electrode cathode"><span>Cathode (-)</span><div class="elec-bubble" style="--d:0s;--x:40%;--y:60%"></div><div class="elec-bubble" style="--d:0.8s;--x:60%;--y:50%"></div></div>
                        <div class="elec-liquid"><span class="elec-ion na" style="--d:0s">Na<sup>+</sup></span><span class="elec-ion cl" style="--d:0.5s">Cl<sup>-</sup></span><span class="elec-ion na" style="--d:1s">Na<sup>+</sup></span><span class="elec-ion cl" style="--d:1.5s">Cl<sup>-</sup></span></div>
                        <div class="elec-electrode anode"><span>Anode (+)</span><div class="elec-bubble" style="--d:0.3s;--x:50%;--y:40%"></div><div class="elec-bubble" style="--d:1.1s;--x:45%;--y:55%"></div></div>
                    </div>
                    <div class="elec-label">Power Supply</div>
                </div>`;
            case 'distillation': return `
                <div class="anim-scene dist-scene">
                    <div class="dist-flask"><div class="dist-liquid"></div><div class="dist-heat"><i class="fas fa-fire"></i></div></div>
                    <div class="dist-connector"><div class="dist-vapor" style="--d:0s"></div><div class="dist-vapor" style="--d:0.3s"></div><div class="dist-vapor" style="--d:0.6s"></div></div>
                    <div class="dist-condenser"><div class="dist-cool"><i class="fas fa-snowflake"></i></div><div class="dist-drip" style="--d:0s"></div><div class="dist-drip" style="--d:0.5s"></div><div class="dist-drip" style="--d:1s"></div></div>
                    <div class="dist-receiver"><div class="dist-collect"></div></div>
                    <div class="dist-labels"><span>Heat</span><span>Condenser</span><span>Collection</span></div>
                </div>`;
            case 'periodic-trends': return `
                <div class="anim-scene periodic-scene">
                    <svg viewBox="0 0 300 200">
                        <rect x="10" y="10" width="280" height="30" rx="4" fill="rgba(59,130,246,0.15)" stroke="#3B82F6" stroke-width="1.5"/>
                        <text x="150" y="30" text-anchor="middle" fill="#3B82F6" font-size="11" font-weight="bold">Electronegativity &rarr; increases</text>
                        <rect x="10" y="50" width="30" height="140" rx="4" fill="rgba(239,68,68,0.15)" stroke="#EF4444" stroke-width="1.5"/>
                        <text x="25" y="120" text-anchor="middle" fill="#EF4444" font-size="11" font-weight="bold" transform="rotate(-90,25,120)">Radius &darr; decreases</text>
                        <rect class="periodic-cell" x="60" y="60" width="50" height="40" rx="3" fill="rgba(16,185,129,0.2)" stroke="#10B981"/>
                        <text x="85" y="78" text-anchor="middle" fill="var(--text)" font-size="12">Li</text>
                        <text x="85" y="92" text-anchor="middle" fill="var(--text-secondary)" font-size="8">2,1</text>
                        <rect class="periodic-cell" x="120" y="60" width="50" height="40" rx="3" fill="rgba(16,185,129,0.2)" stroke="#10B981"/>
                        <text x="145" y="78" text-anchor="middle" fill="var(--text)" font-size="12">Na</text>
                        <text x="145" y="92" text-anchor="middle" fill="var(--text-secondary)" font-size="8">2,8,1</text>
                        <rect class="periodic-cell" x="180" y="60" width="50" height="40" rx="3" fill="rgba(16,185,129,0.2)" stroke="#10B981"/>
                        <text x="205" y="78" text-anchor="middle" fill="var(--text)" font-size="12">K</text>
                        <text x="205" y="92" text-anchor="middle" fill="var(--text-secondary)" font-size="8">2,8,8,1</text>
                        <rect class="periodic-cell" x="60" y="110" width="50" height="40" rx="3" fill="rgba(245,158,11,0.2)" stroke="#F59E0B"/>
                        <text x="85" y="128" text-anchor="middle" fill="var(--text)" font-size="12">F</text>
                        <text x="85" y="142" text-anchor="middle" fill="var(--text-secondary)" font-size="8">2,7</text>
                        <rect class="periodic-cell" x="120" y="110" width="50" height="40" rx="3" fill="rgba(245,158,11,0.2)" stroke="#F59E0B"/>
                        <text x="145" y="128" text-anchor="middle" fill="var(--text)" font-size="12">Cl</text>
                        <text x="145" y="142" text-anchor="middle" fill="var(--text-secondary)" font-size="8">2,8,7</text>
                        <rect class="periodic-cell" x="180" y="110" width="50" height="40" rx="3" fill="rgba(245,158,11,0.2)" stroke="#F59E0B"/>
                        <text x="205" y="128" text-anchor="middle" fill="var(--text)" font-size="12">Br</text>
                        <text x="205" y="142" text-anchor="middle" fill="var(--text-secondary)" font-size="8">2,8,18,7</text>
                        <text x="150" y="175" text-anchor="middle" fill="var(--text-secondary)" font-size="9">Group I (alkali metals) &darr; radius increases</text>
                    </svg>
                </div>`;
            case 'heart': return `
                <div class="anim-scene heart-scene">
                    <div class="heart-body"></div>
                    <div class="blood-flow">
                        <div class="blood-cell" style="--d:0s"></div>
                        <div class="blood-cell" style="--d:0.5s"></div>
                        <div class="blood-cell" style="--d:1s"></div>
                        <div class="blood-cell" style="--d:1.5s"></div>
                        <div class="blood-cell" style="--d:2s"></div>
                    </div>
                    <div class="heart-label"><span class="heart-chamber la">LA</span><span class="heart-chamber ra">RA</span><span class="heart-chamber lv">LV</span><span class="heart-chamber rv">RV</span></div>
                </div>`;
            case 'photosynthesis': return `
                <div class="anim-scene photo-scene">
                    <div class="photo-sun"><div class="sun-core"></div><div class="sun-ray" style="--a:0deg"></div><div class="sun-ray" style="--a:45deg"></div><div class="sun-ray" style="--a:90deg"></div><div class="sun-ray" style="--a:135deg"></div><div class="sun-ray" style="--a:180deg"></div><div class="sun-ray" style="--a:225deg"></div><div class="sun-ray" style="--a:270deg"></div><div class="sun-ray" style="--a:315deg"></div></div>
                    <div class="photo-plant">
                        <div class="photo-stem"></div>
                        <div class="photo-leaf pl"></div>
                        <div class="photo-leaf pr"></div>
                        <div class="photo-leaf pl2"></div>
                        <div class="photo-leaf pr2"></div>
                    </div>
                    <div class="photo-molecule co2"><span>CO<sub>2</sub></span></div>
                    <div class="photo-molecule h2o"><span>H<sub>2</sub>O</span></div>
                    <div class="photo-molecule o2"><span>O<sub>2</sub></span></div>
                    <div class="photo-molecule glucose"><span>C<sub>6</sub>H<sub>12</sub>O<sub>6</sub></span></div>
                    <div class="photo-desc">Light energy + CO<sub>2</sub> + H<sub>2</sub>O &rarr; O<sub>2</sub> + C<sub>6</sub>H<sub>12</sub>O<sub>6</sub></div>
                </div>`;
            case 'dna': return `
                <div class="anim-scene dna-scene">
                    <div class="dna-helix">
                        ${Array.from({length:10}, (_, i) => {
                            const delay = i * 0.15;
                            const leftX = 50 - 35 * Math.cos(i * 0.8);
                            const rightX = 50 + 35 * Math.cos(i * 0.8);
                            const y = 5 + i * 10;
                            return `<div class="dna-rung" style="--d:${delay}s;left:${leftX}%;right:${100-rightX}%;top:${y}%"><div class="rung-bar"></div><div class="base a"></div><div class="base t"></div></div>`;
                        }).join('')}
                        <div class="dna-strand s1"></div>
                        <div class="dna-strand s2"></div>
                    </div>
                </div>`;
            case 'mitosis': return `
                <div class="anim-scene mitosis-scene">
                    <div class="mitosis-cell"><div class="mitosis-nucleus"></div></div>
                    <div class="mitosis-arrow">&rarr;</div>
                    <div class="mitosis-cell dividing"><div class="mitosis-chromo" style="--d:0s;--x:35%;--y:40%"></div><div class="mitosis-chromo" style="--d:0.3s;--x:55%;--y:35%"></div><div class="mitosis-chromo" style="--d:0.6s;--x:40%;--y:55%"></div><div class="mitosis-chromo" style="--d:0.9s;--x:60%;--y:50%"></div></div>
                    <div class="mitosis-arrow">&rarr;</div>
                    <div class="mitosis-cells"><div class="mitosis-daughter"><div class="mitosis-nucleus small"></div></div><div class="mitosis-daughter"><div class="mitosis-nucleus small"></div></div></div>
                    <div class="mitosis-labels"><span>Parent Cell</span><span>Chromosomes align</span><span>2 Daughter Cells</span></div>
                </div>`;
            case 'the-eye': return `
                <div class="anim-scene eye-scene">
                    <svg viewBox="0 0 320 160">
                        <ellipse cx="160" cy="80" rx="140" ry="70" fill="none" stroke="var(--border)" stroke-width="2"/>
                        <circle cx="60" cy="80" r="25" fill="rgba(59,130,246,0.1)" stroke="#3B82F6" stroke-width="1.5"/>
                        <text x="45" y="75" fill="#3B82F6" font-size="8">Cornea</text>
                        <ellipse cx="80" cy="80" rx="12" ry="18" fill="rgba(16,185,129,0.1)" stroke="#10B981" stroke-width="1.5"/>
                        <text x="75" y="65" fill="#10B981" font-size="8">Lens</text>
                        <ellipse cx="270" cy="80" rx="30" ry="40" fill="rgba(239,68,68,0.1)" stroke="#EF4444" stroke-width="1.5"/>
                        <text x="255" y="50" fill="#EF4444" font-size="8">Retina</text>
                        <line class="eye-ray" x1="10" y1="40" x2="75" y2="75" stroke="#F59E0B" stroke-width="2" stroke-dasharray="5 3"/>
                        <line class="eye-ray" x1="10" y1="80" x2="75" y2="80" stroke="#F59E0B" stroke-width="2" stroke-dasharray="5 3"/>
                        <line class="eye-ray" x1="10" y1="120" x2="75" y2="85" stroke="#F59E0B" stroke-width="2" stroke-dasharray="5 3"/>
                        <line class="eye-ray-bent" x1="85" y1="78" x2="260" y2="78" stroke="#F59E0B" stroke-width="2"/>
                        <line class="eye-ray-bent" x1="85" y1="82" x2="260" y2="82" stroke="#F59E0B" stroke-width="2"/>
                        <circle cx="260" cy="80" r="4" fill="#EF4444" opacity="0.8">
                            <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite"/>
                        </circle>
                        <text x="160" y="145" text-anchor="middle" fill="var(--text-secondary)" font-size="9">Light rays focus on the retina</text>
                    </svg>
                </div>`;
            case 'respiratory': return `
                <div class="anim-scene resp-scene">
                    <div class="resp-lungs">
                        <div class="resp-lung left"><div class="resp-bronchi"></div></div>
                        <div class="resp-trachea"></div>
                        <div class="resp-lung right"><div class="resp-bronchi"></div></div>
                    </div>
                    <div class="resp-gas o2-in">O<sub>2</sub> &rarr;</div>
                    <div class="resp-gas co2-out">&larr; CO<sub>2</sub></div>
                    <div class="resp-diaphragm">
                        <div class="resp-dome"></div>
                        <div class="resp-label">Diaphragm</div>
                    </div>
                    <div class="resp-desc">Inhale: O<sub>2</sub> enters &bull; Exhale: CO<sub>2</sub> leaves</div>
                </div>`;
            case 'unit-circle': return `
                <div class="anim-scene uc-scene">
                    <svg viewBox="-130 -130 260 260">
                        <circle r="100" fill="none" stroke="var(--border)" stroke-width="2"/>
                        <line x1="-100" y1="0" x2="100" y2="0" stroke="var(--border)" stroke-width="1" stroke-dasharray="4 4"/>
                        <line x1="0" y1="-100" x2="0" y2="100" stroke="var(--border)" stroke-width="1" stroke-dasharray="4 4"/>
                        <g class="uc-rotating">
                            <line x1="0" y1="0" x2="85" y2="0" stroke="#3B82F6" stroke-width="3" stroke-linecap="round"/>
                            <circle cx="85" cy="0" r="5" fill="#3B82F6"/>
                        </g>
                        <path d="M 20 0 A 20 20 0 0 0 14.1 -14.1" fill="none" stroke="#F59E0B" stroke-width="2"/>
                        <text x="24" y="-6" fill="#F59E0B" font-size="11">&theta;</text>
                        <text x="-110" y="115" fill="var(--text-secondary)" font-size="10">(-1,0)</text>
                        <text x="90" y="115" fill="var(--text-secondary)" font-size="10">(1,0)</text>
                        <text x="-115" y="5" fill="var(--text-secondary)" font-size="10">(0,1)</text>
                        <text x="-115" y="15" fill="var(--text-secondary)" font-size="10">(0,-1)</text>
                    </svg>
                </div>`;
            case 'probability': return `
                <div class="anim-scene prob-scene">
                    <div class="prob-coin" id="probCoin">
                        <div class="coin-face heads">H</div>
                        <div class="coin-face tails">T</div>
                    </div>
                    <div class="prob-controls">
                        <button class="btn btn-primary" onclick="App.flipCoin()"><i class="fas fa-play"></i> Flip</button>
                        <button class="btn btn-outline" onclick="App.resetCoin()"><i class="fas fa-rotate-left"></i> Reset</button>
                    </div>
                    <div class="prob-stats">
                        <div class="stat"><span class="stat-label">Heads</span><span class="stat-val" id="headsStat">0</span><span class="stat-pct" id="headsPct">0%</span></div>
                        <div class="stat"><span class="stat-label">Tails</span><span class="stat-val" id="tailsStat">0</span><span class="stat-pct" id="tailsPct">0%</span></div>
                        <div class="stat total"><span class="stat-label">Total</span><span class="stat-val" id="totalStat">0</span></div>
                    </div>
                </div>`;
            case 'supply-demand': return `
                <div class="anim-scene sd-scene">
                    <svg viewBox="0 0 300 200">
                        <line x1="30" y1="170" x2="280" y2="170" stroke="var(--border)" stroke-width="2"/>
                        <line x1="30" y1="170" x2="30" y2="20" stroke="var(--border)" stroke-width="2"/>
                        <text x="155" y="195" text-anchor="middle" fill="var(--text-secondary)" font-size="12">Quantity</text>
                        <text x="15" y="95" text-anchor="middle" fill="var(--text-secondary)" font-size="12" transform="rotate(-90,15,95)">Price</text>
                        <line class="sd-demand" x1="50" y1="30" x2="260" y2="150" stroke="#EF4444" stroke-width="3"/>
                        <text x="230" y="35" fill="#EF4444" font-size="12">D</text>
                        <line class="sd-supply" x1="60" y1="150" x2="250" y2="40" stroke="#10B981" stroke-width="3"/>
                        <text x="255" y="145" fill="#10B981" font-size="12">S</text>
                        <circle class="sd-eq" r="7" fill="#F59E0B">
                            <animate attributeName="r" values="7;10;7" dur="2s" repeatCount="indefinite"/>
                        </circle>
                        <text x="185" y="85" fill="#F59E0B" font-size="11" font-weight="bold">E</text>
                    </svg>
                </div>`;
            case 'parts-of-speech': return `
                <div class="anim-scene pos-scene">
                    <div class="pos-sentence">The <span class="pos-word" data-pos="article">quick</span> <span class="pos-word" data-pos="adj">brown</span> <span class="pos-word" data-pos="noun">fox</span> <span class="pos-word" data-pos="verb">jumps</span> <span class="pos-word" data-pos="prep">over</span> <span class="pos-word" data-pos="article">the</span> <span class="pos-word" data-pos="adj">lazy</span> <span class="pos-word" data-pos="noun">dog</span>.</div>
                    <div class="pos-legend" id="posLegend">
                        <span data-pos="noun">Noun</span> <span data-pos="verb">Verb</span> <span data-pos="adj">Adjective</span>
                        <span data-pos="article">Article</span> <span data-pos="prep">Preposition</span>
                    </div>
                </div>`;
            case 'figures-of-speech': return `
                <div class="anim-scene fig-scene">
                    <div class="fig-card simile"><div class="fig-icon"><i class="fas fa-equals"></i></div><div class="fig-label">Simile</div><div class="fig-example">"Brave <strong>as</strong> a lion"</div></div>
                    <div class="fig-card metaphor"><div class="fig-icon"><i class="fas fa-arrow-right"></i></div><div class="fig-label">Metaphor</div><div class="fig-example">"He <strong>is</strong> a lion"</div></div>
                    <div class="fig-card personification"><div class="fig-icon"><i class="fas fa-person"></i></div><div class="fig-label">Personification</div><div class="fig-example">"The wind <strong>whispered</strong>"</div></div>
                    <div class="fig-card hyperbole"><div class="fig-icon"><i class="fas fa-up-long"></i></div><div class="fig-label">Hyperbole</div><div class="fig-example">"Told you <strong>million</strong> times"</div></div>
                </div>`;
            case 'tenses': return `
                <div class="anim-scene tense-scene">
                    <div class="tense-timeline">
                        <div class="tense-marker past" style="left:10%"><div class="tense-dot"></div><div class="tense-label">Past</div><div class="tense-example">I walked</div></div>
                        <div class="tense-marker present" style="left:45%"><div class="tense-dot"></div><div class="tense-label">Present</div><div class="tense-example">I walk</div></div>
                        <div class="tense-marker future" style="left:80%"><div class="tense-dot"></div><div class="tense-label">Future</div><div class="tense-example">I will walk</div></div>
                        <div class="tense-line"></div>
                        <div class="tense-arrow right"></div>
                    </div>
                    <div class="tense-grid">
                        <span>Simple</span><span>Continuous</span><span>Perfect</span><span>Perfect Continuous</span>
                    </div>
                </div>`;
            case 'separation-powers': return `
                <div class="anim-scene sep-scene">
                    <div class="sep-branch exec"><div class="sep-icon"><i class="fas fa-gavel"></i></div><div class="sep-title">Executive</div><div class="sep-desc">Enforces laws</div></div>
                    <div class="sep-arrow"><i class="fas fa-arrow-right"></i></div>
                    <div class="sep-branch leg"><div class="sep-icon"><i class="fas fa-landmark"></i></div><div class="sep-title">Legislature</div><div class="sep-desc">Makes laws</div></div>
                    <div class="sep-arrow"><i class="fas fa-arrow-right"></i></div>
                    <div class="sep-branch jud"><div class="sep-icon"><i class="fas fa-scale-balanced"></i></div><div class="sep-title">Judiciary</div><div class="sep-desc">Interprets laws</div></div>
                    <div class="sep-check"><span>Checks & Balances</span></div>
                </div>`;
            case 'election-process': return `
                <div class="anim-scene elect-scene">
                    <div class="elect-step" style="--s:0"><div class="step-num">1</div><div class="step-label">Nomination</div></div>
                    <div class="elect-conn"></div>
                    <div class="elect-step" style="--s:1"><div class="step-num">2</div><div class="step-label">Campaign</div></div>
                    <div class="elect-conn"></div>
                    <div class="elect-step" style="--s:2"><div class="step-num">3</div><div class="step-label">Voting</div></div>
                    <div class="elect-conn"></div>
                    <div class="elect-step" style="--s:3"><div class="step-num">4</div><div class="step-label">Counting</div></div>
                    <div class="elect-conn"></div>
                    <div class="elect-step" style="--s:4"><div class="step-num">5</div><div class="step-label">Declaration</div></div>
                </div>`;
            case 'plot-structure': return `
                <div class="anim-scene plot-scene">
                    <svg viewBox="0 0 400 200">
                        <polyline points="20,180 100,140 200,40 300,120 380,160" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linejoin="round"/>
                        <circle cx="20" cy="180" r="8" fill="#3B82F6"><animate attributeName="r" values="8;12;8" dur="2s" repeatCount="indefinite"/></circle>
                        <text x="20" y="200" text-anchor="middle" fill="var(--text-secondary)" font-size="10">Exposition</text>
                        <circle cx="100" cy="140" r="8" fill="#10B981"><animate attributeName="r" values="8;12;8" dur="2s" begin="0.4s" repeatCount="indefinite"/></circle>
                        <text x="100" y="160" text-anchor="middle" fill="var(--text-secondary)" font-size="10">Rising</text>
                        <circle cx="200" cy="40" r="10" fill="#EF4444"><animate attributeName="r" values="10;15;10" dur="2s" begin="0.8s" repeatCount="indefinite"/></circle>
                        <text x="200" y="30" text-anchor="middle" fill="var(--text-secondary)" font-size="10">Climax</text>
                        <circle cx="300" cy="120" r="8" fill="#F59E0B"><animate attributeName="r" values="8;12;8" dur="2s" begin="1.2s" repeatCount="indefinite"/></circle>
                        <text x="300" y="140" text-anchor="middle" fill="var(--text-secondary)" font-size="10">Falling</text>
                        <circle cx="380" cy="160" r="8" fill="#8B5CF6"><animate attributeName="r" values="8;12;8" dur="2s" begin="1.6s" repeatCount="indefinite"/></circle>
                        <text x="380" y="180" text-anchor="middle" fill="var(--text-secondary)" font-size="10">Resolution</text>
                    </svg>
                </div>`;
            case 'poetic-devices': return `
                <div class="anim-scene poetic-scene">
                    <div class="poem-line"><span class="poem-word" style="--d:0s">Shall</span> <span class="poem-word" style="--d:0.3s">I</span> <span class="poem-word" style="--d:0.6s">compare</span> <span class="poem-word" style="--d:0.9s">thee</span> <span class="poem-word" style="--d:1.2s">to</span> <span class="poem-word rhyme" style="--d:1.5s">a</span> <span class="poem-word rhyme" style="--d:1.8s">summer's</span> <span class="poem-word rhyme" style="--d:2.1s">day?</span></div>
                    <div class="poem-devices">
                        <span class="device-tag" style="--d:2.5s"><i class="fas fa-music"></i> Rhyme</span>
                        <span class="device-tag" style="--d:2.8s"><i class="fas fa-ruler"></i> Rhythm (iambic)</span>
                        <span class="device-tag" style="--d:3.1s"><i class="fas fa-repeat"></i> Alliteration</span>
                    </div>
                </div>`;
            case 'trade-cycle': return `
                <div class="anim-scene trade-scene">
                    <div class="trade-country exporter"><div class="trade-icon"><i class="fas fa-ship"></i></div><div class="trade-name">Exporter</div><div class="trade-goods">Goods &darr;</div></div>
                    <div class="trade-flow"><div class="trade-arrow">&#8594;</div><div class="trade-label">Exports</div></div>
                    <div class="trade-country importer"><div class="trade-icon"><i class="fas fa-truck-loading"></i></div><div class="trade-name">Importer</div><div class="trade-goods">Payment &darr;</div></div>
                    <div class="trade-flow rev"><div class="trade-arrow">&#8592;</div><div class="trade-label">Imports</div></div>
                </div>`;
            case 'business-org': return `
                <div class="anim-scene biz-scene">
                    <div class="biz-card sole"><div class="biz-icon"><i class="fas fa-user"></i></div><div class="biz-title">Sole Proprietor</div><div class="biz-detail">1 owner, unlimited liability</div></div>
                    <div class="biz-card partnership"><div class="biz-icon"><i class="fas fa-users"></i></div><div class="biz-title">Partnership</div><div class="biz-detail">2+ owners, shared liability</div></div>
                    <div class="biz-card corp"><div class="biz-icon"><i class="fas fa-building"></i></div><div class="biz-title">Corporation</div><div class="biz-detail">Shareholders, limited liability</div></div>
                </div>`;
            case 'creation-story': return `
                <div class="anim-scene creation-scene">
                    <div class="creation-days">
                        <div class="day-card" style="--d:0"><div class="day-num">1</div><div class="day-content">Light</div></div>
                        <div class="day-card" style="--d:1"><div class="day-num">2</div><div class="day-content">Sky</div></div>
                        <div class="day-card" style="--d:2"><div class="day-num">3</div><div class="day-content">Land & Plants</div></div>
                        <div class="day-card" style="--d:3"><div class="day-num">4</div><div class="day-content">Sun, Moon, Stars</div></div>
                        <div class="day-card" style="--d:4"><div class="day-num">5</div><div class="day-content">Fish & Birds</div></div>
                        <div class="day-card" style="--d:5"><div class="day-num">6</div><div class="day-content">Animals & Man</div></div>
                        <div class="day-card rest" style="--d:6"><div class="day-num">7</div><div class="day-content">Rest (Sabbath)</div></div>
                    </div>
                </div>`;
            case 'life-of-jesus': return `
                <div class="anim-scene jesus-scene">
                    <div class="jesus-timeline">
                        <div class="jesus-event" style="--d:0s;left:5%"><div class="event-dot"></div><div class="event-text">Birth</div></div>
                        <div class="jesus-event" style="--d:1s;left:23%"><div class="event-dot"></div><div class="event-text">Baptism</div></div>
                        <div class="jesus-event" style="--d:2s;left:41%"><div class="event-dot"></div><div class="event-text">Ministry</div></div>
                        <div class="jesus-event" style="--d:3s;left:59%"><div class="event-dot"></div><div class="event-text">Crucifixion</div></div>
                        <div class="jesus-event" style="--d:4s;left:77%"><div class="event-dot"></div><div class="event-text">Resurrection</div></div>
                        <div class="jesus-event" style="--d:5s;left:92%"><div class="event-dot"></div><div class="event-text">Ascension</div></div>
                        <div class="jesus-line"></div>
                    </div>
                </div>`;
            case 'water-cycle': return `
                <div class="anim-scene wc-scene">
                    <div class="wc-sun"><i class="fas fa-sun"></i></div>
                    <div class="wc-evap"><div class="wc-vapor" style="--d:0s"></div><div class="wc-vapor" style="--d:0.4s"></div><div class="wc-vapor" style="--d:0.8s"></div></div>
                    <div class="wc-cloud"><i class="fas fa-cloud"></i></div>
                    <div class="wc-rain"><div class="wc-drop" style="--d:0s"></div><div class="wc-drop" style="--d:0.2s"></div><div class="wc-drop" style="--d:0.4s"></div><div class="wc-drop" style="--d:0.6s"></div></div>
                    <div class="wc-ocean"><i class="fas fa-water"></i></div>
                    <div class="wc-labels"><span>Evaporation</span><span>Condensation</span><span>Precipitation</span></div>
                </div>`;
            case 'rock-cycle': return `
                <div class="anim-scene rock-scene">
                    <div class="rock-node igneous"><div class="rock-icon"><i class="fas fa-fire"></i></div><div>Igneous</div></div>
                    <div class="rock-node sedimentary"><div class="rock-icon"><i class="fas fa-layer-group"></i></div><div>Sedimentary</div></div>
                    <div class="rock-node metamorphic"><div class="rock-icon"><i class="fas fa-compress"></i></div><div>Metamorphic</div></div>
                    <div class="rock-arrow a1">Cooling</div>
                    <div class="rock-arrow a2">Weathering</div>
                    <div class="rock-arrow a3">Heat & Pressure</div>
                    <div class="rock-arrow a4">Melting</div>
                    <div class="rock-arrow a5">Metamorphism</div>
                    <div class="rock-arrow a6">Compaction</div>
                </div>`;
            case 'lat-long': return `
                <div class="anim-scene latlong-scene">
                    <svg viewBox="0 0 300 200">
                        <ellipse cx="150" cy="100" rx="120" ry="70" fill="rgba(59,130,246,0.05)" stroke="var(--border)" stroke-width="2"/>
                        <ellipse class="lat-line" cx="150" cy="60" rx="95" ry="15" fill="none" stroke="rgba(59,130,246,0.4)" stroke-width="1.5" stroke-dasharray="4 3"/>
                        <ellipse class="lat-line" cx="150" cy="140" rx="95" ry="15" fill="none" stroke="rgba(59,130,246,0.4)" stroke-width="1.5" stroke-dasharray="4 3"/>
                        <ellipse cx="150" cy="100" rx="120" ry="4" fill="none" stroke="#EF4444" stroke-width="2.5"/>
                        <text x="150" y="115" text-anchor="middle" fill="#EF4444" font-size="9" font-weight="bold">Equator (0&deg;)</text>
                        <path class="lon-line" d="M 150 30 Q 110 60 110 100 Q 110 140 150 170" fill="none" stroke="rgba(16,185,129,0.4)" stroke-width="1.5" stroke-dasharray="4 3"/>
                        <path class="lon-line" d="M 150 30 Q 190 60 190 100 Q 190 140 150 170" fill="none" stroke="rgba(16,185,129,0.4)" stroke-width="1.5" stroke-dasharray="4 3"/>
                        <path d="M 150 30 Q 60 60 60 100 Q 60 140 150 170" fill="none" stroke="#F59E0B" stroke-width="2.5"/>
                        <text x="45" y="100" fill="#F59E0B" font-size="9" font-weight="bold">Prime Meridian (0&deg;)</text>
                        <text x="150" y="195" text-anchor="middle" fill="var(--text-secondary)" font-size="9">Latitude: horizontal &bull; Longitude: vertical</text>
                    </svg>
                </div>`;
            case 'plate-tectonics': return `
                <div class="anim-scene plate-scene">
                    <svg viewBox="0 0 300 180">
                        <rect class="tectonic-plate plate-a" x="20" y="30" width="120" height="120" rx="4" fill="rgba(239,68,68,0.15)" stroke="#EF4444" stroke-width="2"/>
                        <text x="80" y="95" text-anchor="middle" fill="#EF4444" font-size="11" font-weight="bold">Plate A</text>
                        <rect class="tectonic-plate plate-b" x="160" y="30" width="120" height="120" rx="4" fill="rgba(59,130,246,0.15)" stroke="#3B82F6" stroke-width="2"/>
                        <text x="220" y="95" text-anchor="middle" fill="#3B82F6" font-size="11" font-weight="bold">Plate B</text>
                        <line class="plate-boundary" x1="140" y1="30" x2="140" y2="150" stroke="#F59E0B" stroke-width="3" stroke-dasharray="6 4"/>
                        <text x="150" y="25" fill="#F59E0B" font-size="9">Convergent Boundary</text>
                        <text class="conv-arrow" x="130" y="50" fill="var(--text-secondary)" font-size="14">&rarr;</text>
                        <text class="conv-arrow" x="155" y="50" fill="var(--text-secondary)" font-size="14">&larr;</text>
                        <text x="150" y="170" text-anchor="middle" fill="var(--text-secondary)" font-size="9">Plates collide &rarr; mountains form (e.g., Himalayas)</text>
                    </svg>
                </div>`;
            case 'weathering': return `
                <div class="anim-scene weather-scene">
                    <div class="weather-rock big">
                        <div class="weather-crack" style="--d:0s"></div>
                        <div class="weather-crack" style="--d:1s"></div>
                    </div>
                    <div class="weather-arrow">&rarr;</div>
                    <div class="weather-rock broken">
                        <div class="weather-fragment" style="--d:0s;--x:-10%;--y:-15%"></div>
                        <div class="weather-fragment" style="--d:0.5s;--x:15%;--y:10%"></div>
                        <div class="weather-fragment" style="--d:1s;--x:-5%;--y:20%"></div>
                        <div class="weather-fragment" style="--d:1.5s;--x:10%;--y:-10%"></div>
                    </div>
                    <div class="weather-arrow">&rarr;</div>
                    <div class="weather-eroded">
                        <div class="weather-particle" style="--d:0s;--x:0%"></div>
                        <div class="weather-particle" style="--d:0.3s;--x:15%"></div>
                        <div class="weather-particle" style="--d:0.6s;--x:30%"></div>
                        <div class="weather-particle" style="--d:0.9s;--x:10%"></div>
                    </div>
                    <div class="weather-labels"><span>Weathering</span><span>Erosion</span></div>
                </div>`;
            case 'nigeria-timeline': return `
                <div class="anim-scene ngr-scene">
                    <div class="ngr-track">
                        <div class="ngr-event" style="--d:0s;left:2%"><div class="ngr-dot"></div><div class="ngr-text">Ancient Empires</div><div class="ngr-year">-1000</div></div>
                        <div class="ngr-event" style="--d:0.8s;left:22%"><div class="ngr-dot"></div><div class="ngr-text">Colonial Era</div><div class="ngr-year">1914</div></div>
                        <div class="ngr-event" style="--d:1.6s;left:42%"><div class="ngr-dot"></div><div class="ngr-text">Independence</div><div class="ngr-year">1960</div></div>
                        <div class="ngr-event" style="--d:2.4s;left:60%"><div class="ngr-dot"></div><div class="ngr-text">Civil War</div><div class="ngr-year">1967-70</div></div>
                        <div class="ngr-event" style="--d:3.2s;left:80%"><div class="ngr-dot"></div><div class="ngr-text">Democracy</div><div class="ngr-year">1999</div></div>
                        <div class="ngr-line"></div>
                    </div>
                </div>`;
            case 'trans-saharan': return `
                <div class="anim-scene sahara-scene">
                    <div class="sahara-map">
                        <div class="sahara-region west"><span>West Africa</span><div class="sahara-good gold">Gold</div><div class="sahara-good slaves">Slaves</div></div>
                        <div class="sahara-desert"><div class="dune" style="--d:0s"></div><div class="dune" style="--d:0.5s"></div><div class="dune" style="--d:1s"></div><div class="camel"><i class="fas fa-horse"></i></div><div class="sahara-route">&#8594; Trans-Saharan Route &#8592;</div></div>
                        <div class="sahara-region north"><span>North Africa</span><div class="sahara-good salt">Salt</div><div class="sahara-good textile">Textiles</div></div>
                    </div>
                </div>`;
            case 'soil-profile': return `
                <div class="anim-scene soil-scene">
                    <div class="soil-horizons">
                        <div class="horizon O" style="--h:10%;--c:#5B3A1A"><span class="horizon-label">O - Organic</span><span class="horizon-desc">Leaves, humus</span></div>
                        <div class="horizon A" style="--h:25%;--c:#8B5E3C"><span class="horizon-label">A - Topsoil</span><span class="horizon-desc">Rich in nutrients</span></div>
                        <div class="horizon B" style="--h:35%;--c:#A0714F"><span class="horizon-label">B - Subsoil</span><span class="horizon-desc">Clay, minerals</span></div>
                        <div class="horizon C" style="--h:20%;--c:#C4A882"><span class="horizon-label">C - Parent Material</span><span class="horizon-desc">Weathered rock</span></div>
                        <div class="horizon R" style="--h:10%;--c:#8C8C8C"><span class="horizon-label">R - Bedrock</span><span class="horizon-desc">Solid rock</span></div>
                    </div>
                    <div class="soil-creatures">
                        <div class="creature" style="--d:0s;top:8%;left:30%"><i class="fas fa-worm"></i></div>
                        <div class="creature" style="--d:0.7s;top:18%;left:60%"><i class="fas fa-bug"></i></div>
                        <div class="creature" style="--d:1.4s;top:15%;left:15%"><i class="fas fa-seedling"></i></div>
                    </div>
                </div>`;
            case 'plant-growth': return `
                <div class="anim-scene plantg-scene">
                    <div class="plantg-stage" style="--s:0"><div class="plantg-vis"><div class="seed"></div></div><div class="plantg-label">Seed</div></div>
                    <div class="plantg-arrow">&rarr;</div>
                    <div class="plantg-stage" style="--s:1"><div class="plantg-vis"><div class="sprout"></div></div><div class="plantg-label">Germination</div></div>
                    <div class="plantg-arrow">&rarr;</div>
                    <div class="plantg-stage" style="--s:2"><div class="plantg-vis"><div class="seedling"><div class="sl-leaf l"></div><div class="sl-leaf r"></div></div></div><div class="plantg-label">Seedling</div></div>
                    <div class="plantg-arrow">&rarr;</div>
                    <div class="plantg-stage" style="--s:3"><div class="plantg-vis"><div class="flowering"><div class="flower"></div></div></div><div class="plantg-label">Flowering</div></div>
                    <div class="plantg-arrow">&rarr;</div>
                    <div class="plantg-stage" style="--s:4"><div class="plantg-vis"><div class="fruiting"><div class="fruit"></div></div></div><div class="plantg-label">Fruiting</div></div>
                </div>`;
            default: return '<div class="anim-placeholder"><i class="fas fa-film"></i><p>Animation coming soon</p></div>';
        }
    },

    resetAnimation() {
        const scenes = document.querySelectorAll('#animViewport .anim-scene');
        scenes.forEach(s => {
            s.querySelectorAll('*').forEach(el => {
                const cs = getComputedStyle(el);
                if (cs.animationName && cs.animationName !== 'none') {
                    el.style.animationPlayState = 'paused';
                    void el.offsetHeight;
                    el.style.animationPlayState = '';
                }
            });
        });
    },

    shiftPH(dir) {
        const indicator = document.getElementById('phIndicator');
        if (!indicator) return;
        const bar = indicator.parentElement;
        const barW = bar.offsetWidth || 300;
        let left = parseFloat(indicator.style.left) || (7/15*100);
        if (dir === 0) left = 7/15*100;
        else left = Math.max(0, Math.min(100, left + dir * (100/15)));
        indicator.style.left = left + '%';
        const val = Math.round((left / 100) * 14);
        indicator.querySelector('.ph-value').textContent = val + ' ' + (val < 7 ? 'Acidic' : val > 7 ? 'Basic' : 'Neutral');
    },

    flipCoin() {
        const coin = document.getElementById('probCoin');
        if (!coin || coin.classList.contains('flipping')) return;
        coin.classList.add('flipping');
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        this.coinData = this.coinData || { heads: 0, tails: 0 };
        setTimeout(() => {
            coin.className = 'prob-coin show-' + result;
            if (result === 'heads') this.coinData.heads++;
            else this.coinData.tails++;
            const total = this.coinData.heads + this.coinData.tails;
            document.getElementById('headsStat').textContent = this.coinData.heads;
            document.getElementById('tailsStat').textContent = this.coinData.tails;
            document.getElementById('totalStat').textContent = total;
            document.getElementById('headsPct').textContent = total ? Math.round(this.coinData.heads/total*100) + '%' : '0%';
            document.getElementById('tailsPct').textContent = total ? Math.round(this.coinData.tails/total*100) + '%' : '0%';
        }, 600);
    },

    resetCoin() {
        this.coinData = { heads: 0, tails: 0 };
        const coin = document.getElementById('probCoin');
        if (coin) coin.className = 'prob-coin show-heads';
        ['headsStat','tailsStat','totalStat'].forEach(id => document.getElementById(id).textContent = '0');
        ['headsPct','tailsPct'].forEach(id => document.getElementById(id).textContent = '0%');
    },

    /* =============== BIND EVENTS =============== */
    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(el => {
            el.addEventListener('click', () => this.navigateTo(el.dataset.page));
        });

        // Menu
        document.getElementById('menuBtn').addEventListener('click', () => this.openSidebar());
        document.getElementById('sidebarClose').addEventListener('click', () => this.closeSidebar());
        document.getElementById('overlay').addEventListener('click', () => this.closeSidebar());

        // Theme
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('themeToggleMobile').addEventListener('click', () => this.toggleTheme());

        // Share
        document.getElementById('shareAppBtn').addEventListener('click', () => this.shareApp());

        // Install
        document.getElementById('installBtn').addEventListener('click', () => this.installApp());

        // Search
        let searchTimeout;
        document.getElementById('searchInput').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.handleSearch(e), 500);
        });

        // Study filters
        document.getElementById('studySubject').addEventListener('change', () => {
            this.populateStudyFilters();
            this.state.currentStudyPage = 1;
            this.renderStudyQuestions();
        });
        document.getElementById('studyTopic').addEventListener('change', () => {
            this.state.currentStudyPage = 1;
            this.renderStudyQuestions();
        });
        document.getElementById('studyYear').addEventListener('change', () => {
            this.state.currentStudyPage = 1;
            this.renderStudyQuestions();
        });
        document.getElementById('studySearch').addEventListener('input', () => {
            this.state.currentStudyPage = 1;
            this.renderStudyQuestions();
        });

        // Quiz
        document.getElementById('startQuizBtn').addEventListener('click', () => this.startQuiz());
        document.getElementById('nextBtn').addEventListener('click', () => this.nextQuestion());
        document.getElementById('prevBtn').addEventListener('click', () => this.prevQuestion());
        document.getElementById('finishBtn').addEventListener('click', () => this.finishQuiz());

        // Mock Exam
        document.getElementById('startMockBtn').addEventListener('click', () => this.startMockExam());
        document.getElementById('mockSubmitBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to submit the exam?')) this.submitMockExam();
        });
        document.getElementById('mockSubject').addEventListener('change', () => {});

        // Animated Lessons
        document.getElementById('lessonSubject').addEventListener('change', () => this.renderLessons());
        document.getElementById('lessonPlayBtn').addEventListener('click', () => {
            this._lessonTTS = !this._lessonTTS;
            const btn = document.getElementById('lessonPlayBtn');
            if (this._lessonTTS) {
                btn.innerHTML = '<i class="fas fa-volume-up"></i> TTS On';
                btn.className = 'btn btn-success';
                if (this._lessonSlides) this._speakLessonSlide(this._lessonIndex);
            } else {
                btn.innerHTML = '<i class="fas fa-play"></i> Play';
                btn.className = 'btn btn-primary';
                this._stopLessonSpeech();
            }
        });
        document.getElementById('lessonPrevBtn').addEventListener('click', () => {
            this._stopLessonSpeech();
            if (this._lessonIndex > 0) this._showLessonSlide(this._lessonIndex - 1);
        });
        document.getElementById('lessonNextBtn').addEventListener('click', () => {
            this._stopLessonSpeech();
            if (this._lessonIndex < this._lessonSlides.length - 1) this._showLessonSlide(this._lessonIndex + 1);
        });
        document.getElementById('lessonPauseBtn').addEventListener('click', () => {
            if (this._lessonAutoTimer) {
                this._stopAutoLesson();
                document.getElementById('lessonPauseBtn').innerHTML = '<i class="fas fa-play"></i> Play';
            } else {
                if (!this._lessonSlides || this._lessonIndex >= this._lessonSlides.length - 1) {
                    this._showLessonSlide(0);
                }
                this._startLessonAuto();
                document.getElementById('lessonPauseBtn').innerHTML = '<i class="fas fa-pause"></i> Pause';
            }
        });
        document.getElementById('lessonSpeed').addEventListener('change', () => {
            if (this._lessonAutoTimer) {
                this._startLessonAuto(); // restart with new speed
            }
        });

        // Formula Sheet
        document.getElementById('formulaSubject').addEventListener('change', () => {
            this.populateFormulaFilters();
            this.renderFormulas();
        });
        document.getElementById('formulaTopic').addEventListener('change', () => this.renderFormulas());
        document.getElementById('formulaSearch').addEventListener('input', () => this.renderFormulas());

        // Summaries
        document.getElementById('summarySubject').addEventListener('change', () => this.renderSummaries());

        // Practicals tabs
        document.getElementById('practicalTabs')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-practical]');
            if (!btn) return;
            document.querySelectorAll('.practical-tabs .btn').forEach(b => {
                b.className = 'btn btn-outline';
            });
            btn.className = 'btn btn-primary active';
            this.renderPracticalSubject(btn.dataset.practical);
        });

        // Bookmarks
        document.getElementById('clearBookmarksBtn').addEventListener('click', () => {
            if (this.state.bookmarks.length > 0 && confirm('Clear all bookmarks?')) {
                this.clearBookmarks();
            }
        });

        // Question modal
        document.querySelector('.modal-close')?.addEventListener('click', () => {
            document.getElementById('questionModal').classList.remove('show');
        });
        document.getElementById('questionModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                document.getElementById('questionModal').classList.remove('show');
            }
        });

        // Privacy modal - click outside to close
        document.getElementById('privacyModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                document.getElementById('privacyModal').classList.remove('show');
                document.body.style.overflow = '';
            }
        });

        // Courses
        document.getElementById('coursesFilter')?.addEventListener('change', () => this.renderCourses());
        document.getElementById('coursesSearch')?.addEventListener('input', () => this.renderCourses());

        // Syllabus
        document.getElementById('syllabusSubject')?.addEventListener('change', () => this.renderSyllabus());
        document.getElementById('resetSyllabusBtn')?.addEventListener('click', () => {
            if (confirm('Reset all syllabus progress?')) this.resetSyllabusProgress();
        });

        // Flashcards
        document.getElementById('flashcardSubject')?.addEventListener('change', () => this.renderFlashcards());
        document.getElementById('flashcardShuffleBtn')?.addEventListener('click', () => this.shuffleFlashcards());
        document.getElementById('flashcardCard')?.addEventListener('click', () => this.flipFlashcard());
        document.getElementById('flashcardPrevBtn')?.addEventListener('click', () => this.prevFlashcard());
        document.getElementById('flashcardNextBtn')?.addEventListener('click', () => this.nextFlashcard());

        // Study Plan
        document.getElementById('studyplanSelect')?.addEventListener('change', () => this.renderStudyPlan());

        // Glossary
        document.getElementById('glossarySearch')?.addEventListener('input', () => this.renderGlossary());

        // Registration tabs
        document.querySelector('.registration-tabs')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-regtab]');
            if (!btn) return;
            document.querySelectorAll('.registration-tabs .btn').forEach(b => {
                b.className = 'btn btn-outline';
            });
            btn.className = 'btn btn-primary active';
            this.renderRegistration();
        });

        // Animated Explainers
        document.getElementById('animSubject')?.addEventListener('change', () => this.renderAnimations());
        document.getElementById('animSelect')?.addEventListener('change', () => {
            if (document.getElementById('animSelect').value) this.showAnimation(document.getElementById('animSelect').value);
        });
        document.getElementById('animPlayBtn')?.addEventListener('click', () => {
            const btn = document.getElementById('animPlayBtn');
            const viewport = document.getElementById('animViewport');
            const paused = viewport.classList.toggle('anim-paused');
            btn.innerHTML = paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
            viewport.querySelectorAll('.anim-scene *').forEach(el => {
                const cs = getComputedStyle(el);
                if (cs.animationName && cs.animationName !== 'none') {
                    el.style.animationPlayState = paused ? 'paused' : '';
                }
            });
        });
        document.getElementById('animResetBtn')?.addEventListener('click', () => {
            const viewport = document.getElementById('animViewport');
            viewport.classList.remove('anim-paused');
            document.getElementById('animPlayBtn').innerHTML = '<i class="fas fa-pause"></i>';
            const scenes = viewport.querySelectorAll('.anim-scene');
            scenes.forEach(s => {
                s.querySelectorAll('*').forEach(el => {
                    const cs = getComputedStyle(el);
                    if (cs.animationName && cs.animationName !== 'none') {
                        el.style.animation = 'none';
                        void el.offsetHeight;
                        el.style.animation = '';
                    }
                });
            });
            const sel = document.getElementById('animSelect');
            if (sel.value) this.showAnimation(sel.value);
        });
        document.getElementById('animSpeed')?.addEventListener('input', () => {
            const speed = parseFloat(document.getElementById('animSpeed').value);
            document.getElementById('animSpeedLabel').textContent = speed + 'x';
            document.querySelectorAll('#animViewport .anim-scene *').forEach(el => {
                el.style.setProperty('--speed-factor', speed);
            });
        });

        // Keyboard shortcuts for flashcards
        document.addEventListener('keydown', (e) => {
            if (this.state.currentPage === 'flashcards' && document.getElementById('page-flashcards').classList.contains('active')) {
                if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.flipFlashcard(); }
                if (e.key === 'ArrowRight') this.nextFlashcard();
                if (e.key === 'ArrowLeft') this.prevFlashcard();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSidebar();
                document.getElementById('questionModal')?.classList.remove('show');
                document.getElementById('privacyModal')?.classList.remove('show');
                document.body.style.overflow = '';
            }
            if (e.key === 'ArrowRight' && document.getElementById('quizArea').style.display !== 'none') {
                if (!document.getElementById('nextBtn').disabled) this.nextQuestion();
            }
            if (e.key === 'ArrowLeft' && document.getElementById('quizArea').style.display !== 'none') {
                if (!document.getElementById('prevBtn').disabled) this.prevQuestion();
            }
            if (e.key === 'Enter' && document.getElementById('quizArea').style.display !== 'none') {
                if (!document.getElementById('finishBtn').disabled && document.getElementById('finishBtn').style.display !== 'none') {
                    this.finishQuiz();
                }
            }
        });

    }
};

// Global helpers for inline onclick
function navigateTo(page) { App.navigateTo(page); }
function reviewQuiz() { App.reviewQuiz(); }
function retryQuiz() { App.retryQuiz(); }
function showPrivacyPolicy() { App.showPrivacyPolicy(); }
function closePrivacyModal() { App.closePrivacyModal(); }
function showCookieSettings() { App.showCookieSettings(); }
function openCookieSettings() { App.showCookieSettings(); }
function closeCookieModal() { App.closeCookieModal(); }
function saveCookieSettings() { App.saveCookieSettings(); }
function acceptAllCookies() { App.acceptAllCookies(); }
function acceptCookies() { App.acceptCookies(); }
function declineCookies() { App.declineCookies(); }

// Initialize on load
document.addEventListener('DOMContentLoaded', () => App.init());
