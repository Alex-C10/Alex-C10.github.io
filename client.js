const socket = io();
let gameCode = null;
let playerName = null;
const path = window.location.pathname;

// =====================
// JOIN PAGE
// =====================
if (path.endsWith("join.html")) {
  function joinGame() {
    playerName = document.getElementById("name").value.trim();
    gameCode = document.getElementById("code").value.trim();

    if (!playerName || !gameCode) {
      alert("Enter your name and game code");
      return;
    }

    localStorage.setItem("playerName", playerName);
    localStorage.setItem("gameCode", gameCode);

    socket.emit("joinGame", { name: playerName, code: gameCode });
  }

  window.joinGame = joinGame;

  socket.on("joinAccepted", () => {
    window.location.href = "/player.html";
  });

  socket.on("joinDenied", () => alert("Invalid game code"));
}

// =====================
// HOST PAGE
// =====================
if (path.endsWith("host.html")) {
  function hostGame() { 
    socket.emit("hostGame"); 
  }

  // Start the quiz
  function startGame() {
    if (!gameCode) return;
    socket.emit("startGame", gameCode); 
  }

  function startNextQuestion() {
    if (!gameCode) return;
    socket.emit("nextQuestion", gameCode);
  }

  function approveQuestion(questionText) {
    if (!gameCode) return;
    socket.emit("approveQuestion", { questionText, code: gameCode });
  }

  window.hostGame = hostGame;
  window.startGame = startGame;
  window.startNextQuestion = startNextQuestion;
  window.approveQuestion = approveQuestion;

  socket.on("gameCode", (code) => {
    gameCode = code;
    document.getElementById("gameCode").innerText = code;
  });

  socket.on("newPendingQuestion", (q) => {
    const list = document.getElementById("pendingList");
    const div = document.createElement("div");
    div.className = "pending-question";
    const safeText = q.text.replace(/'/g, "\\'");
    div.innerHTML = `<strong>${q.author}:</strong> ${q.text} <button onclick="approveQuestion('${safeText}')">Approve</button>`;
    list.appendChild(div);
  });

  socket.on("pendingUpdated", (pending) => {
    const list = document.getElementById("pendingList");
    list.innerHTML = "";
    pending.forEach(q => {
      const div = document.createElement("div");
      div.className = "pending-question";
      const safeText = q.text.replace(/'/g, "\\'");
      div.innerHTML = `<strong>${q.author}:</strong> ${q.text} <button onclick="approveQuestion('${safeText}')">Approve</button>`;
      list.appendChild(div);
    });
  });

  socket.on("playerJoined", ({ name }) => {
    const list = document.getElementById("playerList");
    const li = document.createElement("li");
    li.innerText = name;
    list.appendChild(li);
  });

  socket.on("questionApproved", ({ count }) => {
    const qCount = document.getElementById("questionCount");
    if (qCount) qCount.innerText = count;
  });

  socket.on("questionStarted", (q) => {
    const display = document.getElementById("currentQuestion");
    if (display) {
      display.innerHTML = `<strong>Current:</strong> ${q.text}`;
    }
  });

  socket.on("leaderboard", (players) => {
    const lb = document.getElementById("leaderboard");
    if (!lb) return;
    lb.innerHTML = "";
    players.forEach((p, i) => {
      const li = document.createElement("li");
      li.innerText = `${i + 1}. ${p.name}: ${Math.round(p.score)} pts`;
      lb.appendChild(li);
    });
  });

  socket.on("noQuestions", () => {
    alert("No approved questions! Approve some questions before starting.");
  });

  socket.on("gameOver", () => {
    const display = document.getElementById("currentQuestion");
    if (display) {
      display.innerHTML = "<strong>Game Over!</strong>";
    }
    alert("Game Over! All questions completed.");
  });
}

// =====================
// PLAYER PAGE
// =====================
if (path.endsWith("player.html")) {
  const btnA = document.getElementById("btnA");
  const btnB = document.getElementById("btnB");
  const btnC = document.getElementById("btnC");
  const btnD = document.getElementById("btnD");
  const buttons = [btnA, btnB, btnC, btnD];
  const submitSection = document.getElementById("submitSection");
  const quizSection = document.getElementById("quizSection");
  const resultSection = document.getElementById("resultSection");
  const mainContainer = document.querySelector(".container");
  const timerDisplay = document.getElementById("timerDisplay");

  let timerInterval = null;
  let timeLeft = 20;
  let hasAnswered = false;
  let currentOptions = [];

  playerName = localStorage.getItem("playerName");
  gameCode = localStorage.getItem("gameCode");

  if (!playerName || !gameCode) {
    alert("No player info found. Go back and join a game first.");
    window.location.href = "/index.html";
  } else {
    // Rejoin the game room after page redirect
    socket.emit("rejoinGame", { name: playerName, code: gameCode });
  }

  buttons.forEach(btn => btn.disabled = true);

  function startTimer(duration) {
    timeLeft = Math.ceil(duration / 1000);
    timerDisplay.innerText = timeLeft;
    timerDisplay.className = "timer";
    
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
      timeLeft--;
      timerDisplay.innerText = timeLeft;
      
      // Visual warnings
      if (timeLeft <= 5) {
        timerDisplay.className = "timer danger";
      } else if (timeLeft <= 10) {
        timerDisplay.className = "timer warning";
      }
      
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        // Time's up - if not answered, auto-submit wrong
        if (!hasAnswered) {
          hasAnswered = true;
          buttons.forEach(btn => btn.disabled = true);
          // Server will handle timeout via its own timer
        }
      }
    }, 1000);
  }

  socket.on("questionStarted", (q) => {
    hasAnswered = false;
    currentOptions = q.options;
    
    // Switch to fullscreen quiz mode
    mainContainer.classList.add("hidden");
    resultSection.classList.add("hidden");
    quizSection.classList.remove("hidden");
    
    document.getElementById("questionText").innerText = q.text;
    btnA.innerText = q.options[0];
    btnB.innerText = q.options[1];
    btnC.innerText = q.options[2];
    btnD.innerText = q.options[3];
    buttons.forEach(btn => {
      btn.disabled = false;
      btn.classList.remove("selected");
    });
    
    // Start the countdown timer
    startTimer(q.timeLimit || 20000);
  });

  socket.on("questionResult", (result) => {
    // Stop timer
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    
    // Show result screen
    quizSection.classList.add("hidden");
    resultSection.classList.remove("hidden");
    
    const resultIcon = document.getElementById("resultIcon");
    const resultText = document.getElementById("resultText");
    const resultDetails = document.getElementById("resultDetails");
    const resultScoreDisplay = document.getElementById("resultScoreDisplay");
    
    // Map letter to actual answer text
    const answerMap = { A: 0, B: 1, C: 2, D: 3 };
    const correctAnswerText = currentOptions[answerMap[result.correctAnswer]] || result.correctAnswer;
    
    if (result.correct) {
      resultSection.className = "result-fullscreen correct";
      resultIcon.innerText = "✓";
      resultText.innerText = "Correct!";
      resultDetails.innerText = `The answer was ${result.correctAnswer}: ${correctAnswerText}`;
    } else {
      resultSection.className = "result-fullscreen incorrect";
      resultIcon.innerText = "✗";
      if (result.yourAnswer) {
        resultText.innerText = "Incorrect!";
        resultDetails.innerText = `You answered ${result.yourAnswer}. The correct answer was ${result.correctAnswer}: ${correctAnswerText}`;
      } else {
        resultText.innerText = "Time's Up!";
        resultDetails.innerText = `The correct answer was ${result.correctAnswer}: ${correctAnswerText}`;
      }
    }
    
    resultScoreDisplay.innerText = `${Math.round(result.score)} pts`;
  });

  socket.on("gameOver", () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    quizSection.classList.add("hidden");
    resultSection.classList.remove("hidden");
    resultSection.className = "result-fullscreen correct";
    document.getElementById("resultIcon").innerText = "🏆";
    document.getElementById("resultText").innerText = "Game Over!";
    document.getElementById("resultDetails").innerText = "Thanks for playing!";
    document.getElementById("waitingText").innerText = "Final scores are in!";
    document.getElementById("newGameBtn").classList.remove("hidden");
  });

  socket.on("yourScore", (score) => {
    const scoreDisplay = document.getElementById("scoreDisplay");
    const scoreDisplayQuiz = document.getElementById("scoreDisplayQuiz");
    const resultScoreDisplay = document.getElementById("resultScoreDisplay");
    const rounded = Math.round(score);
    if (scoreDisplay) scoreDisplay.innerText = `Your Score: ${rounded}`;
    if (scoreDisplayQuiz) scoreDisplayQuiz.innerText = `${rounded} pts`;
    if (resultScoreDisplay) resultScoreDisplay.innerText = `${rounded} pts`;
  });

  function sendAnswer(choice) {
    if (hasAnswered) return;
    hasAnswered = true;
    buttons.forEach(btn => btn.disabled = true);
    document.getElementById(`btn${choice}`).classList.add("selected");
    socket.emit("answer", { code: gameCode, answer: choice });
  }

  btnA.addEventListener("click", () => sendAnswer("A"));
  btnB.addEventListener("click", () => sendAnswer("B"));
  btnC.addEventListener("click", () => sendAnswer("C"));
  btnD.addEventListener("click", () => sendAnswer("D"));

  function submitQuestion() {
    const text = document.getElementById("questionTextInput").value.trim();
    const options = [
      document.getElementById("optA").value.trim(),
      document.getElementById("optB").value.trim(),
      document.getElementById("optC").value.trim(),
      document.getElementById("optD").value.trim()
    ];
    const correct = document.getElementById("correctOpt").value;

    if (!text || options.some(o => !o)) {
      alert("Please fill in all fields");
      return;
    }

    socket.emit("submitQuestion", { text, options, correct, code: gameCode });
    
    // Clear form
    document.getElementById("questionTextInput").value = "";
    document.getElementById("optA").value = "";
    document.getElementById("optB").value = "";
    document.getElementById("optC").value = "";
    document.getElementById("optD").value = "";
    
    alert("Question submitted! Waiting for host approval.");
  }

  window.submitQuestion = submitQuestion;
}
