import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc,
  updateDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// STATE
let roomId, role, game = {};
let setup = [];
let timer;

// DOM
const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");
const timerEl = document.getElementById("timer");
const bingoEl = document.getElementById("bingo");

// UI
function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ROOM
function genCode() {
  return Math.random().toString(36).substring(2,7).toUpperCase();
}

document.getElementById("btn-create").onclick = async () => {
  roomId = genCode();
  role = "P1";

  await setDoc(doc(db,"rooms",roomId), {
    players:[{id:"P1"}],
    boards:{P1:[],P2:[]},
    marked:[],
    turn:"P1",
    gameState:"waiting",
    miss:{P1:0,P2:0}
  });

  document.getElementById("room-code").innerText = roomId;
  show("screen-wait");
  listen();
};

document.getElementById("btn-join").onclick = async () => {
  roomId = document.getElementById("room-code-input").value;
  const ref = doc(db,"rooms",roomId);
  const snap = await getDoc(ref);

  if(!snap.exists()) return alert("Invalid");

  role = "P2";
  await updateDoc(ref,{
    players:[{id:"P1"},{id:"P2"}],
    gameState:"setup",
    setupStart:Date.now()
  });

  listen();
};

// LISTENER
function listen() {
  onSnapshot(doc(db,"rooms",roomId),(snap)=>{
    game = snap.data();

    if(game.gameState==="setup") setupPhase();
    if(game.gameState==="play") renderGame();
    if(game.gameState==="end") endGame();
  });
}

// SETUP
function setupPhase() {
  show("screen-game");
  grid.innerHTML="";
  setup=[];

  for(let i=0;i<25;i++){
    const c=document.createElement("div");
    c.className="cell";
    c.onclick=()=>clickSetup(i);
    grid.appendChild(c);
  }

  startTimer(game.setupStart,60,finishSetup);
}

function clickSetup(i){
  if(setup[i]) return;
  setup[i]=setup.filter(Boolean).length+1;
  renderSetup();
}

function renderSetup(){
  [...grid.children].forEach((c,i)=>{
    c.innerText=setup[i]||"";
  });
}

async function finishSetup(){
  for(let i=0;i<25;i++){
    if(!setup[i]){
      let nums=[...Array(25)].map((_,i)=>i+1)
        .filter(n=>!setup.includes(n));
      setup[i]=nums[Math.floor(Math.random()*nums.length)];
    }
  }

  const ref=doc(db,"rooms",roomId);
  await updateDoc(ref,{[`boards.${role}`]:setup});

  const snap=await getDoc(ref);
  const d=snap.data();

  if(d.boards.P1.length && d.boards.P2.length){
    await updateDoc(ref,{
      gameState:"play",
      turnStart:Date.now()
    });
  }
}

// GAME
function renderGame(){
  const board=game.boards[role];

  if(!grid.children.length){
    grid.innerHTML="";
    board.forEach(n=>{
      const c=document.createElement("div");
      c.className="cell";
      c.innerText=n;
      c.onclick=()=>play(n);
      grid.appendChild(c);
    });
  }

  [...grid.children].forEach(c=>{
    if(game.marked.includes(parseInt(c.innerText))){
      c.classList.add("marked");
    }
  });

  const myTurn = game.turn===role;
  statusEl.innerText = myTurn ? "Your Turn" : "Opponent Turn";

  startTimer(game.turnStart,20,()=>missTurn());

  const lines=countLines(board,game.marked);
  bingoEl.innerText="BINGO".slice(0,lines);

  if(lines>=5){
    win(role);
  }
}

async function play(n){
  if(game.turn!==role || game.marked.includes(n)) return;

  const ref=doc(db,"rooms",roomId);
  const next=role==="P1"?"P2":"P1";

  await updateDoc(ref,{
    marked:[...game.marked,n],
    turn:next,
    turnStart:Date.now()
  });
}

// MISS
async function missTurn(){
  const ref=doc(db,"rooms",roomId);
  const m=game.miss[role]+1;

  if(m>2){
    win(role==="P1"?"P2":"P1");
    return;
  }

  await updateDoc(ref,{
    [`miss.${role}`]:m,
    turn:role==="P1"?"P2":"P1",
    turnStart:Date.now()
  });
}

// BINGO
function countLines(b,m){
  const chk=i=>m.includes(b[i]);
  let l=0;

  for(let i=0;i<5;i++)
    if(chk(i*5)&&chk(i*5+1)&&chk(i*5+2)&&chk(i*5+3)&&chk(i*5+4)) l++;

  for(let i=0;i<5;i++)
    if(chk(i)&&chk(i+5)&&chk(i+10)&&chk(i+15)&&chk(i+20)) l++;

  if(chk(0)&&chk(6)&&chk(12)&&chk(18)&&chk(24)) l++;
  if(chk(4)&&chk(8)&&chk(12)&&chk(16)&&chk(20)) l++;

  return l;
}

// WIN
async function win(r){
  await updateDoc(doc(db,"rooms",roomId),{
    gameState:"end",
    winner:r
  });
}

function endGame(){
  show("screen-end");
  document.getElementById("result").innerText =
    game.winner===role ? "You Win 🎉" : "You Lose 💀";
}

// TIMER
function startTimer(start,duration,callback){
  clearInterval(timer);

  timer=setInterval(()=>{
    let t=Math.floor((Date.now()-start)/1000);
    let r=duration-t;

    timerEl.innerText=r;

    if(r<=0){
      clearInterval(timer);
      callback();
    }
  },500);
}
