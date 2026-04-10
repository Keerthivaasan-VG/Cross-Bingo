import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// ⚠️ INSERT YOUR FIREBASE CONFIG HERE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCWXLu7jwG-Q3XMMAVVaYgx-A552wssTkA",
    authDomain: "cross-bingo.firebaseapp.com",
    projectId: "cross-bingo",
    storageBucket: "cross-bingo.firebasestorage.app",
    messagingSenderId: "123369608964",
    appId: "1:123369608964:web:b961a37d74d98b752fa251",
    measurementId: "G-ZPH536V7YQ"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// STATE & VARIABLES
// ==========================================
let myName = localStorage.getItem("playerName") || "Player";
let myRole = null; // "P1" or "P2"
let currentRoomId = null;
let roomUnsubscribe = null;
let setupNumbers = [];
let localGameState = {};
let timerInterval = null;

// DOM Elements
const els = {
    nameInput: document.getElementById('player-name'),
    menuBtn: document.getElementById('menu-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    closeSettings: document.getElementById('close-settings'),
    screens: document.querySelectorAll('.screen'),
    createBtn: document.getElementById('btn-create'),
    joinBtn: document.getElementById('btn-join'),
    roomInput: document.getElementById('room-code-input'),
    errorMsg: document.getElementById('home-error'),
    roomCodeDisplay: document.getElementById('display-room-code'),
    grid: document.getElementById('bingo-grid'),
    status: document.getElementById('game-status'),
    timer: document.getElementById('timer-display'),
    bingoProgress: document.getElementById('bingo-progress'),
    undoBtn: document.getElementById('btn-undo'),
    winnerMsg: document.getElementById('winner-msg'),
    p1Name: document.getElementById('p1-name'),
    p2Name: document.getElementById('p2-name')
};

// ==========================================
// INITIALIZATION & UI
// ==========================================
els.nameInput.value = myName;
els.nameInput.addEventListener('input', (e) => {
    myName = e.target.value || "Player";
    localStorage.setItem("playerName", myName);
});

els.menuBtn.addEventListener('click', () => els.settingsPanel.classList.add('open'));
els.closeSettings.addEventListener('click', () => els.settingsPanel.classList.remove('open'));

function showScreen(screenId) {
    els.screens.forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function triggerVibration() {
    if (document.getElementById('vib-toggle').checked && navigator.vibrate) {
        navigator.vibrate(50);
    }
}

// ==========================================
// ROOM LOGIC
// ==========================================
els.createBtn.addEventListener('click', async () => {
    currentRoomId = generateRoomCode();
    myRole = "P1";
    
    const roomData = {
        roomId: currentRoomId,
        players: [{ id: "P1", name: myName, connected: true }],
        gameState: "waiting",
        boards: { P1: [], P2: [] },
        marked: [],
        turn: "P1",
        setupStartTime: null,
        turnStartTime: null,
        missCount: { P1: 0, P2: 0 },
        winner: null
    };

    await setDoc(doc(db, "rooms", currentRoomId), roomData);
    els.roomCodeDisplay.innerText = currentRoomId;
    showScreen('screen-waiting');
    listenToRoom();
});

els.joinBtn.addEventListener('click', async () => {
    const code = els.roomInput.value.trim().toUpperCase();
    if (code.length !== 5) return (els.errorMsg.innerText = "Invalid code format");

    const roomRef = doc(db, "rooms", code);
    const roomSnap = await getDoc(roomRef);

    if (!roomSnap.exists()) return (els.errorMsg.innerText = "Room not found");
    const data = roomSnap.data();
    if (data.players.length >= 2) return (els.errorMsg.innerText = "Room is full");

    currentRoomId = code;
    myRole = "P2";

    await updateDoc(roomRef, {
        players: [...data.players, { id: "P2", name: myName, connected: true }],
        gameState: "setup",
        setupStartTime: Date.now() // Simple client-time sync for demo purposes
    });

    listenToRoom();
});

// ==========================================
// REAL-TIME SYNC
// ==========================================
function listenToRoom() {
    if (roomUnsubscribe) roomUnsubscribe();
    
    roomUnsubscribe = onSnapshot(doc(db, "rooms", currentRoomId), (doc) => {
        if (!doc.exists()) return;
        const data = doc.data();
        localGameState = data;
        
        handleStateChange(data);
    });
}

function handleStateChange(data) {
    // Update Names
    if (data.players[0]) els.p1Name.innerText = data.players[0].name;
    if (data.players[1]) els.p2Name.innerText = data.players[1].name;

    if (data.gameState === "setup" && document.getElementById('screen-waiting').classList.contains('active')) {
        initSetupPhase();
    } else if (data.gameState === "playing") {
        renderPlayingGrid(data);
        updateGameUI(data);
    } else if (data.gameState === "finished") {
        showEndScreen(data);
    }
}

// ==========================================
// SETUP PHASE (Grid Filling)
// ==========================================
function initSetupPhase() {
    showScreen('screen-game');
    els.status.innerText = "Fill your board!";
    els.undoBtn.classList.remove('hidden');
    els.grid.innerHTML = "";
    setupNumbers = [];
    
    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.addEventListener('click', () => handleSetupClick(i, cell));
        els.grid.appendChild(cell);
    }

    els.undoBtn.onclick = () => {
        if (setupNumbers.length === 0) return;
        setupNumbers.pop();
        renderSetupGrid();
    };

    // 60 Sec Timer Mock
    let timeLeft = 60;
    timerInterval = setInterval(() => {
        timeLeft--;
        els.timer.innerText = `${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            finalizeSetup();
        }
    }, 1000);
}

function handleSetupClick(index, cellDiv) {
    if (setupNumbers.length >= 25 || setupNumbers[index]) return;
    const nextNum = setupNumbers.filter(Boolean).length + 1;
    setupNumbers[index] = nextNum;
    triggerVibration();
    renderSetupGrid();
    if (setupNumbers.filter(Boolean).length === 25) finalizeSetup();
}

function renderSetupGrid() {
    const cells = els.grid.children;
    for (let i = 0; i < 25; i++) {
        cells[i].innerText = setupNumbers[i] || "";
        cells[i].classList.toggle('active', !!setupNumbers[i]);
    }
}

async function finalizeSetup() {
    clearInterval(timerInterval);
    els.undoBtn.classList.add('hidden');
    
    // Auto-fill missing
    let available = Array.from({length: 25}, (_, i) => i + 1).filter(n => !setupNumbers.includes(n));
    for (let i = 0; i < 25; i++) {
        if (!setupNumbers[i]) {
            const rIdx = Math.floor(Math.random() * available.length);
            setupNumbers[i] = available.splice(rIdx, 1)[0];
        }
    }

    const roomRef = doc(db, "rooms", currentRoomId);
    await updateDoc(roomRef, {
        [`boards.${myRole}`]: setupNumbers
    });

    // Check if both ready
    const snap = await getDoc(roomRef);
    const data = snap.data();
    if (data.boards.P1.length === 25 && data.boards.P2.length === 25 && data.gameState === "setup") {
        await updateDoc(roomRef, {
            gameState: "playing",
            turnStartTime: Date.now()
        });
    }
}

// ==========================================
// GAME PHASE
// ==========================================
function renderPlayingGrid(data) {
    if (els.grid.children.length === 0 || !els.grid.children[0].innerText) {
        els.grid.innerHTML = "";
        const myBoard = data.boards[myRole];
        for (let i = 0; i < 25; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.innerText = myBoard[i];
            cell.addEventListener('click', () => handleGameClick(myBoard[i]));
            els.grid.appendChild(cell);
        }
    }

    // Apply marks
    const cells = Array.from(els.grid.children);
    cells.forEach(cell => {
        if (data.marked.includes(parseInt(cell.innerText))) {
            cell.classList.add('marked');
        }
    });
}

function updateGameUI(data) {
    const isMyTurn = data.turn === myRole;
    els.status.innerText = isMyTurn ? "Your Turn!" : "Opponent's Turn";
    
    // Calculate BINGO progress
    const lines = calculateLines(data.boards[myRole], data.marked);
    const word = "BINGO";
    els.bingoProgress.innerText = word.substring(0, lines).split('').join(' ') + " _".repeat(5 - lines);

    if (lines >= 5 && !data.winner) {
        declareWinner(myRole);
    }
}

async function handleGameClick(number) {
    if (localGameState.turn !== myRole || localGameState.marked.includes(number)) return;
    triggerVibration();

    const newMarked = [...localGameState.marked, number];
    const nextTurn = myRole === "P1" ? "P2" : "P1";

    await updateDoc(doc(db, "rooms", currentRoomId), {
        marked: newMarked,
        turn: nextTurn,
        turnStartTime: Date.now()
    });
}

// ==========================================
// BINGO LOGIC
// ==========================================
function calculateLines(board, marked) {
    if (!board || board.length !== 25) return 0;
    const isMarked = (idx) => marked.includes(board[idx]);
    let lines = 0;

    // Rows
    for (let i = 0; i < 5; i++) {
        if (isMarked(i*5) && isMarked(i*5+1) && isMarked(i*5+2) && isMarked(i*5+3) && isMarked(i*5+4)) lines++;
    }
    // Cols
    for (let i = 0; i < 5; i++) {
        if (isMarked(i) && isMarked(i+5) && isMarked(i+10) && isMarked(i+15) && isMarked(i+20)) lines++;
    }
    // Diagonals
    if (isMarked(0) && isMarked(6) && isMarked(12) && isMarked(18) && isMarked(24)) lines++;
    if (isMarked(4) && isMarked(8) && isMarked(12) && isMarked(16) && isMarked(20)) lines++;

    return lines;
}

async function declareWinner(role) {
    await updateDoc(doc(db, "rooms", currentRoomId), {
        gameState: "finished",
        winner: role
    });
}

function showEndScreen(data) {
    showScreen('screen-end');
    const won = data.winner === myRole;
    els.winnerMsg.innerText = won ? "🎉 You Won!" : "💀 You Lost!";
    
    document.getElementById('btn-play-again').onclick = () => location.reload();
}