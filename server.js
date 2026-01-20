const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

// 1. Create the app + server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 2. Tell Express to serve the public folder
app.use(express.static("public"));

// 3. Store all running games
const games = {}; 
// {
//   "482193": {
//     hostId: "...",
//     players: { socketId: { name, score } },
//     startTime: null
//   }
// }

// 4. Helper to generate a game code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 5. Handle connections
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // HOST creates a game
  socket.on("hostGame", () => {
    const code = generateCode();

    games[code] = {
      hostId: socket.id,
      players: {},
      startTime: null
    };

    socket.join(code);
    socket.emit("gameCode", code);
  });

  // PLAYER joins a game
  socket.on("joinGame", ({ name, code }) => {
    if (!games[code]) return;

    games[code].players[socket.id] = {
      name,
      score: 0
    };

    socket.join(code);
    io.to(code).emit("playerList", games[code].players);
  });

  // HOST starts a question
  socket.on("startQuestion", (code) => {
    games[code].startTime = Date.now();
    io.to(code).emit("questionStarted");
  });

  // PLAYER answers
  socket.on("answer", ({ code, answer }) => {
  const game = games[code];
  if (!game) return;

  const player = game.players[socket.id];
  if (!player) return;

  console.log(
    `Answer from ${player.name}: ${answer}`
        );
    });


  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

// 6. Start the server
server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
