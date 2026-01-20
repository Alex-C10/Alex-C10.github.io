const socket = io();

let gameCode = null;
let playerName = null;

// HOST
function hostGame() {
  socket.emit("hostGame");
}

socket.on("gameCode", (code) => {
  gameCode = code;
  document.getElementById("gameCode").innerText = code;
});

// PLAYER
function joinGame() {
  playerName = document.getElementById("name").value;
  gameCode = document.getElementById("code").value;

  socket.emit("joinGame", {
    name: playerName,
    code: gameCode
  });

  window.location.href = "/player.html";
}

// QUESTION STARTED
socket.on("questionStarted", () => {
  console.log("Question started");
});

// SEND ANSWER
function sendAnswer(choice) {
  socket.emit("answer", {
    code: gameCode,
    answer: choice
  });
}
