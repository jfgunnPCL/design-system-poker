/* ── Constants ───────────────────────────────────────────────────────────── */
const VOTE_VALUES = [1, 2, 3, 5, 8, 13, 20, 40, 100];

/* ── Identity ────────────────────────────────────────────────────────────── */
let userId = localStorage.getItem('poker_userId');
let userName = localStorage.getItem('poker_userName');

if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('poker_userId', userId);
}

/* ── Socket ──────────────────────────────────────────────────────────────── */
const socket = io();

/* ── State ───────────────────────────────────────────────────────────────── */
let state = null; // last received session-state
let myVote = null; // currently selected card value

/* ── DOM refs ────────────────────────────────────────────────────────────── */
const nameModal = document.getElementById('name-modal');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const homeView = document.getElementById('home-view');
const createSessionBtn = document.getElementById('create-session-btn');
const sessionView = document.getElementById('session-view');

const userList = document.getElementById('user-list');

const roleDeveloper = document.getElementById('role-developer');
const roleObserver = document.getElementById('role-observer');

const copyLinkBtn = document.getElementById('copy-link-btn');
const copyConfirm = document.getElementById('copy-confirmation');

const noRoundMsg = document.getElementById('no-round-msg');
const roundInfo = document.getElementById('round-info');
const ticketDescription = document.getElementById('ticket-description');
const roundStatus = document.getElementById('round-status');

const votingArea = document.getElementById('voting-area');
const voteCardsEl = document.getElementById('vote-cards');

const resultsArea = document.getElementById('results-area');
const statAverage = document.getElementById('stat-average');
const statMin = document.getElementById('stat-min');
const statMax = document.getElementById('stat-max');
const voteBreakdown = document.getElementById('vote-breakdown');

const creatorControls = document.getElementById('creator-controls');
const ctrlStart = document.getElementById('ctrl-start-round');
const ticketInput = document.getElementById('ticket-input');
const startRoundBtn = document.getElementById('start-round-btn');
const ctrlReveal = document.getElementById('ctrl-reveal');
const revealBtn = document.getElementById('reveal-btn');
const ctrlNewRound = document.getElementById('ctrl-new-round');
const ticketInputNew = document.getElementById('ticket-input-new');
const newRoundBtn = document.getElementById('new-round-btn');
const waitingMsg = document.getElementById('waiting-for-creator');

/* ── Bootstrap ───────────────────────────────────────────────────────────── */
function boot() {
    if (!userName) {
        showModal();
    } else {
        enterApp();
    }
}

function showModal() {
    nameModal.hidden = false;
}

nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    userName = name;
    localStorage.setItem('poker_userName', userName);
    nameModal.hidden = true;
    enterApp();
});

function enterApp() {
    const sessionId = getSessionIdFromUrl();
    if (sessionId) {
        showSessionView();
        socket.emit('join-session', { sessionId, userId, name: userName });
    } else {
        showHomeView();
    }
}

function getSessionIdFromUrl() {
    const match = window.location.pathname.match(/^\/session\/([^/]+)/);
    return match ? match[1] : null;
}

/* ── View switching ──────────────────────────────────────────────────────── */
function showHomeView() {
    homeView.hidden = false;
    sessionView.hidden = true;
}

function showSessionView() {
    homeView.hidden = true;
    sessionView.hidden = false;
}

/* ── Create session ──────────────────────────────────────────────────────── */
createSessionBtn.addEventListener('click', () => {
    socket.emit('create-session', { userId, name: userName });
});

socket.on('session-created', ({ sessionId }) => {
    history.replaceState(null, '', `/session/${sessionId}`);
    showSessionView();
});

/* ── Session state ───────────────────────────────────────────────────────── */
socket.on('session-state', (newState) => {
    state = newState;
    render();
});

socket.on('error', ({ message }) => {
    alert(message);
    history.replaceState(null, '', '/');
    showHomeView();
});

/* ── Full render ─────────────────────────────────────────────────────────── */
function render() {
    if (!state) return;

    const isCreator = state.creatorUserId === userId;
    const me = state.users.find(u => u.userId === userId);
    const myRole = me ? me.role : 'developer';
    const round = state.round;
    const hasRound = !!round;
    const isRevealed = hasRound && round.revealed;

    renderUserList(isCreator, round);
    renderRoleButtons(myRole);
    renderRoundHeader(round);
    renderVotingArea(round, myRole, isCreator);
    renderResults(round);
    renderCreatorControls(isCreator, round);
}

/* ── User list ───────────────────────────────────────────────────────────── */
function renderUserList(isCreator, round) {
    const voterMap = {};
    if (round) {
        round.voterStatuses.forEach(v => { voterMap[v.userId] = v; });
    }

    userList.innerHTML = '';
    state.users
        .slice()
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .forEach(user => {
            const li = document.createElement('li');
            const isMe = user.userId === userId;
            const isCreatorUser = user.userId === state.creatorUserId;

            const dot = document.createElement('span');
            dot.className = `dot ${user.connected ? 'dot-connected' : 'dot-disconnected'}`;
            dot.title = user.connected ? 'Connected' : 'Disconnected';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'user-name';
            nameSpan.textContent = user.name + (isMe ? ' (you)' : '');

            li.appendChild(dot);
            li.appendChild(nameSpan);

            if (isCreatorUser) {
                li.appendChild(makeBadge('Host', 'creator'));
            }

            if (user.role === 'observer') {
                li.appendChild(makeBadge('Observer', 'observer'));
            } else if (round && !round.revealed) {
                const voterInfo = voterMap[user.userId];
                if (voterInfo !== undefined) {
                    li.appendChild(makeBadge(voterInfo.hasVoted ? 'Voted' : 'Waiting', voterInfo.hasVoted ? 'voted' : 'waiting'));
                }
            }

            userList.appendChild(li);
        });
}

function makeBadge(text, type) {
    const span = document.createElement('span');
    span.className = `badge badge-${type}`;
    span.textContent = text;
    return span;
}

/* ── Role buttons ────────────────────────────────────────────────────────── */
function renderRoleButtons(myRole) {
    roleDeveloper.classList.toggle('active', myRole === 'developer');
    roleObserver.classList.toggle('active', myRole === 'observer');
}

/* ── Round header ────────────────────────────────────────────────────────── */
function renderRoundHeader(round) {
    if (!round) {
        noRoundMsg.hidden = false;
        roundInfo.hidden = true;
        return;
    }
    noRoundMsg.hidden = true;
    roundInfo.hidden = false;
    ticketDescription.textContent = round.ticketDescription || 'Untitled round';

    if (round.revealed) {
        const totalVotes = round.voterStatuses.filter(v => v.vote !== null).length;
        roundStatus.textContent = `Voting complete — ${totalVotes} vote${totalVotes === 1 ? '' : 's'}`;
    } else {
        const voted = round.voterStatuses.filter(v => v.hasVoted).length;
        const total = round.voterStatuses.length;
        roundStatus.textContent = `Voting in progress — ${voted}/${total} voted`;
    }
}

/* ── Voting area ─────────────────────────────────────────────────────────── */
function renderVotingArea(round, myRole, isCreator) {
    const showCards = round && !round.revealed && myRole === 'developer';
    votingArea.hidden = !showCards;

    if (!showCards) return;

    // Build cards only once
    if (voteCardsEl.children.length !== VOTE_VALUES.length) {
        voteCardsEl.innerHTML = '';
        VOTE_VALUES.forEach(val => {
            const card = document.createElement('button');
            card.className = 'vote-card';
            card.textContent = val;
            card.dataset.value = val;
            card.addEventListener('click', () => castVote(val));
            voteCardsEl.appendChild(card);
        });
    }

    // Reset revealed state — round is not revealed here
    // Sync selected state with myVote
    Array.from(voteCardsEl.children).forEach(card => {
        card.classList.toggle('selected', Number(card.dataset.value) === myVote);
    });
}

/* ── Results ─────────────────────────────────────────────────────────────── */
function renderResults(round) {
    const showResults = round && round.revealed;
    resultsArea.hidden = !showResults;

    if (!showResults) return;

    const { stats, voterStatuses } = round;

    if (stats) {
        statAverage.textContent = stats.average;
        statMin.textContent = stats.min;
        statMax.textContent = stats.max;
    } else {
        statAverage.textContent = 'N/A';
        statMin.textContent = 'N/A';
        statMax.textContent = 'N/A';
    }

    // Group voters by value
    const groups = {};
    voterStatuses.forEach(v => {
        if (v.vote !== null) {
            if (!groups[v.vote]) groups[v.vote] = [];
            groups[v.vote].push(v.name);
        }
    });

    voteBreakdown.innerHTML = '';
    Object.keys(groups)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach(val => {
            const names = groups[val];
            const card = document.createElement('div');
            card.className = 'breakdown-card';
            card.innerHTML = `
        <span class="breakdown-value">${val}</span>
        <span class="breakdown-names">${names.join(', ')}</span>
      `;
            voteBreakdown.appendChild(card);
        });

    // Also show voters who didn't vote
    const abstained = voterStatuses.filter(v => v.vote === null).map(v => v.name);
    if (abstained.length > 0) {
        const card = document.createElement('div');
        card.className = 'breakdown-card';
        card.innerHTML = `
      <span class="breakdown-value" style="font-size:1rem;color:#aaa">—</span>
      <span class="breakdown-names" style="color:#aaa">${abstained.join(', ')}<br><em>No vote</em></span>
    `;
        voteBreakdown.appendChild(card);
    }
}

/* ── Creator controls ────────────────────────────────────────────────────── */
function renderCreatorControls(isCreator, round) {
    creatorControls.hidden = !isCreator;
    waitingMsg.hidden = isCreator;

    if (!isCreator) return;

    const hasRound = !!round;
    const isRevealed = hasRound && round.revealed;
    const isActive = hasRound && !isRevealed;

    // Start: show when no round
    ctrlStart.hidden = hasRound;
    // Reveal: show during active round
    ctrlReveal.hidden = !isActive;
    // New round: show after reveal
    ctrlNewRound.hidden = !isRevealed;
}

/* ── Actions ─────────────────────────────────────────────────────────────── */
roleDeveloper.addEventListener('click', () => socket.emit('set-role', { role: 'developer' }));
roleObserver.addEventListener('click', () => socket.emit('set-role', { role: 'observer' }));

startRoundBtn.addEventListener('click', () => {
    socket.emit('start-new-round', { ticketDescription: ticketInput.value.trim() });
    ticketInput.value = '';
    myVote = null;
});

revealBtn.addEventListener('click', () => socket.emit('reveal-votes'));

newRoundBtn.addEventListener('click', () => {
    socket.emit('start-new-round', { ticketDescription: ticketInputNew.value.trim() });
    ticketInputNew.value = '';
    myVote = null;
});

function castVote(value) {
    myVote = value;
    socket.emit('cast-vote', { value });
    // Optimistically update card selection
    Array.from(voteCardsEl.children).forEach(card => {
        card.classList.toggle('selected', Number(card.dataset.value) === value);
    });
}

/* ── Copy link ───────────────────────────────────────────────────────────── */
copyLinkBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(window.location.href);
        copyConfirm.hidden = false;
        setTimeout(() => { copyConfirm.hidden = true; }, 2000);
    } catch {
        // Fallback for http without permissions
        prompt('Copy this link:', window.location.href);
    }
});

/* ── Reconnection handling ───────────────────────────────────────────────── */
socket.on('connect', () => {
    const sessionId = getSessionIdFromUrl();
    if (sessionId && userName) {
        socket.emit('join-session', { sessionId, userId, name: userName });
    }
});

socket.on('disconnect', () => {
    // State will update automatically on reconnect via 'connect' handler
});

/* ── Start ───────────────────────────────────────────────────────────────── */
boot();
