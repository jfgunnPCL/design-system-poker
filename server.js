const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ─── In-memory state ─────────────────────────────────────────────────────────

// Map<sessionId, Session>
// Session: {
//   creatorUserId: string,
//   users: Map<userId, { name, role, connected, socketId, joinedAt }>,
//   currentRound: { ticketDescription, votes: Map<userId, value>, revealed } | null
// }
const sessions = new Map();

// Reverse lookup: Map<socketId, { sessionId, userId }>
const socketToSession = new Map();

// Disconnect grace timers: Map<`${sessionId}:${userId}`, TimeoutId>
const disconnectTimers = new Map();

const DISCONNECT_GRACE_MS = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSessionState(session) {
    const users = Array.from(session.users.entries()).map(([userId, user]) => ({
        userId,
        name: user.name,
        role: user.role,
        connected: user.connected,
        joinedAt: user.joinedAt,
    }));

    let round = null;
    if (session.currentRound) {
        const { ticketDescription, votes, revealed } = session.currentRound;
        const voterStatuses = [];
        session.users.forEach((user, userId) => {
            if (user.role === 'developer') {
                voterStatuses.push({
                    userId,
                    name: user.name,
                    hasVoted: votes.has(userId),
                    // Only reveal values when round is revealed
                    vote: revealed ? (votes.get(userId) ?? null) : null,
                });
            }
        });

        let stats = null;
        if (revealed && votes.size > 0) {
            const values = Array.from(votes.values());
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            stats = {
                average: Math.round(avg * 10) / 10,
                min: Math.min(...values),
                max: Math.max(...values),
            };
        }

        round = { ticketDescription, revealed, voterStatuses, stats };
    }

    return {
        sessionId: session.sessionId,
        creatorUserId: session.creatorUserId,
        users,
        round,
    };
}

function broadcastState(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    io.to(sessionId).emit('session-state', getSessionState(session));
}

function promoteCreator(session) {
    // Find connected user with earliest joinedAt
    let earliest = null;
    session.users.forEach((user, userId) => {
        if (user.connected) {
            if (!earliest || user.joinedAt < session.users.get(earliest).joinedAt) {
                earliest = userId;
            }
        }
    });
    if (earliest) {
        session.creatorUserId = earliest;
    }
}

// ─── Express routes ───────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

// Catch-all: serve SPA for /session/:id routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Socket.io events ─────────────────────────────────────────────────────────

io.on('connection', (socket) => {
    // ── create-session ──────────────────────────────────────────────────────────
    socket.on('create-session', ({ userId, name }) => {
        const sessionId = nanoid(8);
        const session = {
            sessionId,
            creatorUserId: userId,
            users: new Map([
                [
                    userId,
                    {
                        name,
                        role: 'developer',
                        connected: true,
                        socketId: socket.id,
                        joinedAt: Date.now(),
                    },
                ],
            ]),
            currentRound: null,
        };
        sessions.set(sessionId, session);
        socketToSession.set(socket.id, { sessionId, userId });
        socket.join(sessionId);
        socket.emit('session-created', { sessionId });
        broadcastState(sessionId);
    });

    // ── join-session ─────────────────────────────────────────────────────────────
    socket.on('join-session', ({ sessionId, userId, name }) => {
        const session = sessions.get(sessionId);
        if (!session) {
            socket.emit('error', { message: 'Session not found.' });
            return;
        }

        const timerKey = `${sessionId}:${userId}`;

        if (session.users.has(userId)) {
            // Reconnect: restore existing user
            const user = session.users.get(userId);
            user.connected = true;
            user.socketId = socket.id;
            // Cancel pending removal timer
            if (disconnectTimers.has(timerKey)) {
                clearTimeout(disconnectTimers.get(timerKey));
                disconnectTimers.delete(timerKey);
            }
        } else {
            // New user joining
            session.users.set(userId, {
                name,
                role: 'developer',
                connected: true,
                socketId: socket.id,
                joinedAt: Date.now(),
            });
        }

        socketToSession.set(socket.id, { sessionId, userId });
        socket.join(sessionId);
        broadcastState(sessionId);
    });

    // ── set-role ─────────────────────────────────────────────────────────────────
    socket.on('set-role', ({ role }) => {
        const context = socketToSession.get(socket.id);
        if (!context) return;
        const { sessionId, userId } = context;
        const session = sessions.get(sessionId);
        if (!session) return;

        const user = session.users.get(userId);
        if (!user) return;

        // If switching away from developer, remove their vote from current round
        if (role !== 'developer' && session.currentRound) {
            session.currentRound.votes.delete(userId);
        }

        user.role = role;
        broadcastState(sessionId);
    });

    // ── cast-vote ─────────────────────────────────────────────────────────────────
    socket.on('cast-vote', ({ value }) => {
        const context = socketToSession.get(socket.id);
        if (!context) return;
        const { sessionId, userId } = context;
        const session = sessions.get(sessionId);
        if (!session || !session.currentRound || session.currentRound.revealed) return;

        const user = session.users.get(userId);
        if (!user || user.role !== 'developer') return;

        session.currentRound.votes.set(userId, value);
        broadcastState(sessionId);
    });

    // ── reveal-votes ──────────────────────────────────────────────────────────────
    socket.on('reveal-votes', () => {
        const context = socketToSession.get(socket.id);
        if (!context) return;
        const { sessionId, userId } = context;
        const session = sessions.get(sessionId);
        if (!session || !session.currentRound || session.currentRound.revealed) return;
        if (session.creatorUserId !== userId) return;

        session.currentRound.revealed = true;
        broadcastState(sessionId);
    });

    // ── start-new-round ───────────────────────────────────────────────────────────
    socket.on('start-new-round', ({ ticketDescription }) => {
        const context = socketToSession.get(socket.id);
        if (!context) return;
        const { sessionId, userId } = context;
        const session = sessions.get(sessionId);
        if (!session) return;
        if (session.creatorUserId !== userId) return;

        session.currentRound = {
            ticketDescription: ticketDescription || '',
            votes: new Map(),
            revealed: false,
        };
        broadcastState(sessionId);
    });

    // ── end-round (alias for reveal) already handled by reveal-votes ──────────────

    // ── disconnect ────────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        const context = socketToSession.get(socket.id);
        if (!context) return;
        const { sessionId, userId } = context;
        socketToSession.delete(socket.id);

        const session = sessions.get(sessionId);
        if (!session) return;

        const user = session.users.get(userId);
        if (!user) return;

        user.connected = false;
        broadcastState(sessionId);

        // Grace period before fully removing the user
        const timerKey = `${sessionId}:${userId}`;
        const timer = setTimeout(() => {
            disconnectTimers.delete(timerKey);
            const sess = sessions.get(sessionId);
            if (!sess) return;

            const wasCreator = sess.creatorUserId === userId;
            sess.users.delete(userId);

            // If session is now empty, clean it up
            if (sess.users.size === 0) {
                sessions.delete(sessionId);
                return;
            }

            // Transfer creator role if needed
            if (wasCreator) {
                promoteCreator(sess);
            }

            broadcastState(sessionId);
        }, DISCONNECT_GRACE_MS);

        disconnectTimers.set(timerKey, timer);
    });
});

// ─── Start server ─────────────────────────────────────────────────────────────

server.listen(PORT, () => {
    console.log(`Planning Poker running at http://localhost:${PORT}`);
});
