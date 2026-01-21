const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const PORT = 3000;

app.use(express.static("public"));

const games = {};

// Scoring constants
const MAX_POINTS = 1000;      // Maximum points for instant correct answer
const MIN_POINTS = 500;       // Minimum points for correct answer
const TIME_LIMIT = 20000;     // Time in ms after which points hit minimum (20 seconds)
const ORDER_PENALTY = 50;     // Points deducted per person who answered before you

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // HOST CREATES GAME
  socket.on("hostGame", () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    games[code] = {
      hostId: socket.id,
      players: {},
      answers: {},
      startTime: null,
      questions: [],
      pendingQuestions: [],
      currentQuestionIndex: -1
    };
    socket.emit("gameCode", code);
    console.log(`Host ${socket.id} created game ${code}`);
  });
// HOST STARTS THE GAME
socket.on("startGame", (code) => {
  const game = games[code];
  if (!game) return;

  if (game.questions.length === 0) {
    socket.emit("noQuestions");
    return; // nothing to start
  }

  game.currentQuestionIndex = -1; // reset
  startNextQuestion(code);
});

function startNextQuestion(code) {
  const game = games[code];
  if (!game) return;

  game.currentQuestionIndex++;
  const q = game.questions[game.currentQuestionIndex];

  if (!q) {
    io.to(game.hostId).emit("gameOver");
    io.to(code).emit("gameOver");
    console.log(`Game ${code} finished`);
    return;
  }

  game.startTime = Date.now();
  game.answers = {};
  game.questionEnded = false;

  io.to(code).emit("questionStarted", { ...q, timeLimit: TIME_LIMIT });
  io.to(game.hostId).emit("questionStarted", { ...q, timeLimit: TIME_LIMIT });
  console.log(`Question started: ${q.text}`);

  // Auto-end question after TIME_LIMIT
  game.timer = setTimeout(() => {
    endQuestion(code);
  }, TIME_LIMIT);
}

function endQuestion(code) {
  const game = games[code];
  if (!game || game.questionEnded) return;
  
  game.questionEnded = true;
  if (game.timer) {
    clearTimeout(game.timer);
    game.timer = null;
  }

  const currentQ = game.questions[game.currentQuestionIndex];
  
  // Send result to each player
  for (const [socketId, player] of Object.entries(game.players)) {
    const answer = game.answers[socketId];
    const isCorrect = answer && answer.answer === currentQ.correct;
    io.to(socketId).emit("questionResult", { 
      correct: isCorrect, 
      correctAnswer: currentQ.correct,
      yourAnswer: answer ? answer.answer : null,
      score: player.score
    });
  }

  // Notify host that question ended
  io.to(game.hostId).emit("questionEnded", { correctAnswer: currentQ.correct });
  console.log(`Question ended: ${currentQ.text}`);
}

socket.on("nextQuestion", (code) => {
  startNextQuestion(code);
});

  // PLAYER JOINS
  socket.on("joinGame", ({ name, code }) => {
    const game = games[code];
    if (!game) {
      socket.emit("joinDenied");
      return;
    }
    game.players[socket.id] = { name, score: 0 };
    socket.join(code);
    socket.emit("joinAccepted");
    io.to(game.hostId).emit("playerJoined", { name });
    console.log(`${name} joined game ${code}`);
  });

  // PLAYER REJOINS (after page redirect)
  socket.on("rejoinGame", ({ name, code }) => {
    const game = games[code];
    if (!game) {
      socket.emit("joinDenied");
      return;
    }
    // Check if player already exists (by name) and update socket id
    let existingPlayer = null;
    for (const [oldId, player] of Object.entries(game.players)) {
      if (player.name === name) {
        existingPlayer = player;
        delete game.players[oldId];
        break;
      }
    }
    game.players[socket.id] = existingPlayer || { name, score: 0 };
    socket.join(code);
    console.log(`${name} rejoined game ${code}`);
  });

  // STUDENT SUBMITS QUESTION
  socket.on("submitQuestion", ({ text, options, correct, code }) => {
    const game = games[code];
    if (!game) return;
    const author = game.players[socket.id]?.name || "Unknown";
    const question = { text, options, correct, author };
    game.pendingQuestions.push(question);
    io.to(game.hostId).emit("newPendingQuestion", question);
    console.log(`${author} submitted question: ${text}`);
  });

  // HOST APPROVES QUESTION
  socket.on("approveQuestion", ({ questionText, code }) => {
    const game = games[code];
    if (!game) return;
    const index = game.pendingQuestions.findIndex(q => q.text === questionText);
    if (index === -1) return;
    const q = game.pendingQuestions.splice(index, 1)[0];
    game.questions.push(q);
    io.to(game.hostId).emit("pendingUpdated", game.pendingQuestions);
    io.to(game.hostId).emit("questionApproved", { count: game.questions.length });
    console.log(`Question approved: ${q.text}`);
  });

  // PLAYER SENDS ANSWER
  socket.on("answer", ({ code, answer }) => {
    const game = games[code];
    if (!game || !game.players[socket.id]) return;
    if (game.questionEnded) return; // Question already ended
    if (game.answers[socket.id]) return; // Already answered

    const time = Date.now() - game.startTime;
    const order = Object.keys(game.answers).length; // 0-indexed (0 = first)

    game.answers[socket.id] = { answer, time, order };

    const player = game.players[socket.id];
    const currentQ = game.questions[game.currentQuestionIndex];
    let earnedPoints = 0;

    if (answer === currentQ.correct) {
      // Calculate time-based score (decreases over time)
      // Points decay linearly from MAX to MIN over TIME_LIMIT
      const timeRatio = Math.min(time / TIME_LIMIT, 1); // 0 to 1
      const timePoints = MAX_POINTS - (timeRatio * (MAX_POINTS - MIN_POINTS));
      
      // Apply order penalty (each person before you costs ORDER_PENALTY points)
      const orderPenalty = order * ORDER_PENALTY;
      
      // Calculate final score with min/max bounds
      earnedPoints = Math.max(MIN_POINTS, Math.min(MAX_POINTS, timePoints - orderPenalty));
      player.score += earnedPoints;
      
      console.log(`${player.name} answered correctly! Time: ${time}ms, Order: ${order + 1}, Points: ${Math.round(earnedPoints)}`);
    } else {
      console.log(`${player.name} answered wrong (${answer} vs ${currentQ.correct})`);
    }

    // Send updated score to the player
    socket.emit("yourScore", player.score);

    // Send leaderboard to host
    const leaderboard = Object.values(game.players)
      .map(p => ({ name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);
    io.to(game.hostId).emit("leaderboard", leaderboard);

    // Check if all players have answered
    const totalPlayers = Object.keys(game.players).length;
    const totalAnswers = Object.keys(game.answers).length;
    if (totalAnswers >= totalPlayers) {
      endQuestion(code);
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    // Optionally handle removing player from game
  });
});

http.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
