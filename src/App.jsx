import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, updateDoc, onSnapshot, arrayUnion, getDoc
} from 'firebase/firestore';
import { 
  Moon, Sun, Users, Send, Info, Shield, Skull, Eye, MessageSquare, Play, 
  LogOut, Vote, Plus, Minus, Mic, Target, HeartPulse, ShieldAlert,
  Sword, Crown, Snowflake, Frown, CheckSquare
} from 'lucide-react';

// 👇👇👇 ⚠️ 嚴重警告：請務必將以下內容替換為你真實的 Firebase 金鑰！ ⚠️ 👇👇👇
// 如果沒有替換成真實的字串，Vercel 網頁就會當機變成白畫面！
const firebaseConfig = {
  apiKey: "AIzaSyCi7lXBAESeCpXpxZho7wz5i6KMpY9XfmA",
  authDomain: "hol-4e473.firebaseapp.com",
  projectId: "hol-4e473",
  storageBucket: "hol-4e473.firebasestorage.app",
  messagingSenderId: "665755863496",
  appId: "1:665755863496:web:7ad0698d2360fc577898fd"
};
// 👆👆👆 ⚠️ 嚴重警告：請務必將以上內容替換為你真實的 Firebase 金鑰！ ⚠️ 👆👆👆

// 系統環境判斷 (確保本地與預覽環境皆可運行)
const finalConfig = typeof __firebase_config !== 'undefined' && __firebase_config 
  ? JSON.parse(__firebase_config) 
  : myFirebaseConfig;

const app = initializeApp(finalConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'werewolf-web-app';

// --- Helper Functions ---
const generateRoomCode = () => Math.random().toString(36).substring(2, 6).toUpperCase();

const shuffleArray = (array) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

// 陣營與身分定義
const WOLF_ROLES = ['狼人', '狼王', '雪狼'];
const GOD_ROLES = ['預言家', '女巫', '獵人', '守衛', '騎士', '白癡'];
const VILLAGER_ROLES = ['村民'];

const ROLES_INFO = {
  '狼人': { desc: '夜間可與同伴討論並殺害一名玩家。', color: 'text-red-500', icon: Skull },
  '狼王': { desc: '死後可以開槍帶走一名玩家(被毒除外)。', color: 'text-red-700', icon: Crown },
  '雪狼': { desc: '無法被預言家查出狼人身分，參與夜間擊殺。', color: 'text-blue-300', icon: Snowflake },
  '預言家': { desc: '夜間可查驗一名玩家的真實身分。', color: 'text-blue-500', icon: Eye },
  '女巫': { desc: '擁有一瓶解藥與一瓶毒藥。', color: 'text-purple-500', icon: HeartPulse },
  '獵人': { desc: '死後可以開槍帶走一名玩家。', color: 'text-orange-500', icon: Target },
  '守衛': { desc: '每晚可守護一名玩家免受狼害(不可連守)。', color: 'text-indigo-400', icon: ShieldAlert },
  '騎士': { desc: '白天隨時可決鬥查驗一人，若為狼則狼死，否則自盡。', color: 'text-yellow-600', icon: Sword },
  '白癡': { desc: '被投票出局可翻牌免死，但失去投票與被投票權。', color: 'text-green-800', icon: Frown },
  '村民': { desc: '沒有特殊技能，依靠推理找出狼人。', color: 'text-green-600', icon: Users },
  '未知': { desc: '等待分配...', color: 'text-gray-400', icon: Info }
};

const AVAILABLE_ROLES = ['狼人', '狼王', '雪狼', '預言家', '女巫', '獵人', '守衛', '騎士', '白癡', '村民'];

const NIGHT_PHASE_ORDER = ['guard', 'wolf', 'witch', 'seer', 'night_calc'];
const PHASE_NAMES = {
  'guard': '守衛',
  'wolf': '狼人/狼王/雪狼',
  'witch': '女巫',
  'seer': '預言家'
};

// --- Main Application Component ---
export default function WerewolfApp() {
  const [user, setUser] = useState(null);
  const [playerName, setPlayerName] = useState(localStorage.getItem('ww_name') || '');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [room, setRoom] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [initError, setInitError] = useState(null);
  
  const [showRoleModal, setShowRoleModal] = useState(false);
  const prevStatusRef = useRef(null);

  const [seerResult, setSeerResult] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const chatBottomRef = useRef(null);

  const [showIdiotReveal, setShowIdiotReveal] = useState(false);
  const [idiotRevealData, setIdiotRevealData] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
        setInitError(error.message);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !room?.id) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setRoom(data);
        
        if (data.status === 'idiot_reveal' && !showIdiotReveal) {
          setIdiotRevealData(data.idiotRevealInfo);
          setShowIdiotReveal(true);
        }
      } else {
        setRoom(null);
        alert("房間已解散");
      }
    });
    return () => unsubscribe();
  }, [user, room?.id, showIdiotReveal]);

  useEffect(() => {
    if (room?.status === 'day') {
      setSeerResult(null);
    }
  }, [room?.status]);

  const chatLength = room?.chat?.length || 0;
  const logsLength = room?.logs?.length || 0;
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLength, logsLength]);

  useEffect(() => {
    if (prevStatusRef.current === 'waiting' && room?.status === 'night') {
      setShowRoleModal(true);
      setIsCardFlipped(false); 
    }
    prevStatusRef.current = room?.status;
  }, [room?.status]);

  useEffect(() => {
    if (room && room.status === 'day' && room.subPhase === 'discussing' && room.hostId === user?.uid) {
      const validVotersCount = room.players.filter(p => p.isAlive && !p.isIdiotRevealed).length;
      const currentVotesCount = Object.keys(room.votes || {}).length;
      
      if (validVotersCount > 0 && currentVotesCount === validVotersCount) {
        const timer = setTimeout(() => {
          performVoteCalculation(room);
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [room?.votes, room?.status, room?.subPhase, room?.hostId, user?.uid]);

  const checkWinCondition = (players, roleConfig) => {
    let aliveWolves = 0;
    let aliveGods = 0;
    let aliveVillagers = 0;
    
    let totalGods = 0;
    let totalVillagers = 0;

    players.forEach(p => {
      if (WOLF_ROLES.includes(p.role)) {
        if (p.isAlive) aliveWolves++;
      } else if (GOD_ROLES.includes(p.role)) {
        totalGods++;
        if (p.isAlive) aliveGods++;
      } else if (VILLAGER_ROLES.includes(p.role)) {
        totalVillagers++;
        if (p.isAlive) aliveVillagers++;
      }
    });

    if (aliveWolves === 0) return 'good'; 
    if (totalGods > 0 && aliveGods === 0) return 'wolf'; 
    if (totalVillagers > 0 && aliveVillagers === 0) return 'wolf'; 
    
    return null;
  };

  const getNextNightPhase = (currentSubPhase, players) => {
    let idx = NIGHT_PHASE_ORDER.indexOf(currentSubPhase);
    while (idx < NIGHT_PHASE_ORDER.length - 1) {
      idx++;
      const nextPhase = NIGHT_PHASE_ORDER[idx];
      if (nextPhase === 'guard' && players.some(p => p.role === '守衛' && p.isAlive)) return nextPhase;
      if (nextPhase === 'wolf' && players.some(p => WOLF_ROLES.includes(p.role) && p.isAlive)) return nextPhase; 
      if (nextPhase === 'witch' && players.some(p => p.role === '女巫' && p.isAlive)) return nextPhase;
      if (nextPhase === 'seer' && players.some(p => p.role === '預言家' && p.isAlive)) return nextPhase;
      if (nextPhase === 'night_calc') return nextPhase;
    }
    return 'night_calc';
  };

  const proceedToNextPhase = async (customRoomState = null) => {
    const isEvent = customRoomState && customRoomState.nativeEvent;
    const currentRoom = (!isEvent && customRoomState) ? customRoomState : room;
    
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', currentRoom.id);
    let updates = {};

    if (currentRoom.status === 'night' && currentRoom.subPhase !== 'night_calc') {
      const nextSub = getNextNightPhase(currentRoom.subPhase, currentRoom.players);
      updates = { subPhase: nextSub };
      
      if (nextSub !== 'night_calc') {
        updates.logs = arrayUnion({ type: 'sys', message: `系統：現在是 ${PHASE_NAMES[nextSub]} 的回合`, time: Date.now() });
      } else {
        await updateDoc(roomRef, updates);
        return performNightCalculation({ ...currentRoom, ...updates });
      }
    } 
    else if (currentRoom.status === 'day' && currentRoom.subPhase === 'speaking') {
      const nextQueue = currentRoom.speakerQueue.slice(1);
      if (nextQueue.length > 0) {
        updates = { speakerQueue: nextQueue, currentSpeaker: nextQueue[0] };
      } else {
        updates = { 
          subPhase: 'discussing', 
          currentSpeaker: null,
          logs: arrayUnion({ type: 'sys', message: '發言完畢，進入自由討論與投票階段。', time: Date.now() })
        };
      }
    }
    else if (currentRoom.status === 'hunter_shoot') {
      const winner = checkWinCondition(currentRoom.players, currentRoom.roleConfig);
      if (winner) {
        updates = { winner, status: 'ended' };
      } else {
        if (currentRoom.hunterTriggeredBy === 'vote' || currentRoom.hunterTriggeredBy === 'knight') {
           updates = {
             status: 'night', subPhase: getNextNightPhase('start', currentRoom.players),
             votes: {}, nightActions: { sharedWolfTarget: null, wolfTarget: null, seerChecked: false, witchHeal: false, witchPoison: null, guardTarget: null, lastGuardTarget: currentRoom.nightActions?.lastGuardTarget || null },
             logs: arrayUnion({ type: 'sys', message: '天黑請閉眼...', time: Date.now() })
           };
        } else {
           const aliveIds = currentRoom.players.filter(p => p.isAlive).map(p => p.id);
           updates = {
             status: 'day', subPhase: 'speaking', speakerQueue: aliveIds, currentSpeaker: aliveIds[0] || null
           };
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateDoc(roomRef, updates);
    }
  };

  const performNightCalculation = async (currentRoom) => {
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', currentRoom.id);
    const actions = currentRoom.nightActions || {};
    const { wolfTarget, guardTarget, witchHeal, witchPoison } = actions;
    
    let updatedPlayers = [...currentRoom.players];
    let deadIds = [];
    let nightLog = '昨晚是平安夜。';

    let wolfKillSuccess = false;
    if (wolfTarget) {
      const isGuarded = (wolfTarget === guardTarget);
      const isHealed = witchHeal;
      if (isGuarded && isHealed) wolfKillSuccess = true;
      else if (!isGuarded && !isHealed) wolfKillSuccess = true;
    }

    if (wolfKillSuccess) deadIds.push(wolfTarget);
    if (witchPoison && !deadIds.includes(witchPoison)) deadIds.push(witchPoison);

    let skillCanShoot = false;
    let shooterId = null;

    updatedPlayers = updatedPlayers.map(p => {
      if (deadIds.includes(p.id)) {
        if (['獵人', '狼王'].includes(p.role)) {
          shooterId = p.id;
          if (witchPoison !== p.id) skillCanShoot = true; 
        }
        return { ...p, isAlive: false };
      }
      return p;
    });

    if (deadIds.length > 0) {
      const deadNames = updatedPlayers.filter(p => deadIds.includes(p.id)).map(p => p.name).join('、');
      nightLog = `昨晚，${deadNames} 死亡了。`;
    }

    const winner = checkWinCondition(updatedPlayers, currentRoom.roleConfig);
    const newLogs = [{ type: 'sys', message: nightLog, time: Date.now() }];
    
    let updates = { 
      players: updatedPlayers, 
      'nightActions.lastGuardTarget': guardTarget || null
    };

    if (skillCanShoot) {
      updates.status = 'hunter_shoot';
      updates.hunterTriggeredBy = 'night';
      updates.currentSpeaker = shooterId;
      newLogs.push({ type: 'sys', message: '等待技能(獵人/狼王)發動...', time: Date.now() + 1 });
    } else if (winner) {
      updates.winner = winner;
      updates.status = 'ended';
    } else {
      const aliveIds = updatedPlayers.filter(p => p.isAlive).map(p => p.id);
      updates.status = 'day';
      updates.subPhase = 'speaking';
      updates.speakerQueue = aliveIds;
      updates.currentSpeaker = aliveIds[0] || null;
      updates.votes = {};
    }

    updates.logs = arrayUnion(...newLogs);
    await updateDoc(roomRef, updates);
  };

  const performVoteCalculation = async (currentRoom) => {
    const targetRoom = currentRoom || room;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', targetRoom.id);
    const voteCounts = {};
    Object.values(targetRoom.votes || {}).forEach(target => { voteCounts[target] = (voteCounts[target] || 0) + 1; });
    
    let maxVotes = 0; let exiledId = null;
    for (const [target, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) { maxVotes = count; exiledId = target; } 
      else if (count === maxVotes) { exiledId = null; } 
    }

    let updatedPlayers = [...targetRoom.players];
    let voteLog = '投票結果平局，沒有人被放逐。';
    let skillCanShoot = false;
    let triggerIdiotReveal = false;
    let idiotPlayerInfo = null;

    const validVotersCount = updatedPlayers.filter(p => p.isAlive && !p.isIdiotRevealed).length;
    const requiredVotes = Math.floor(validVotersCount / 2);

    if (exiledId === 'skip') {
      voteLog = '多數玩家選擇棄票，沒有人被放逐。';
      exiledId = null;
    } else if (exiledId) {
      if (maxVotes > requiredVotes) {
        const exiledPlayer = targetRoom.players.find(p => p.id === exiledId);
        
        if (exiledPlayer.role === '白癡' && !exiledPlayer.isIdiotRevealed) {
          updatedPlayers = updatedPlayers.map(p => p.id === exiledId ? { ...p, isIdiotRevealed: true } : p);
          voteLog = `投票結束，最高票 ${exiledPlayer?.name}(${maxVotes}票)。`; 
          triggerIdiotReveal = true;
          idiotPlayerInfo = { id: exiledPlayer.id, name: exiledPlayer.name };
          exiledId = null; 
        } else {
          updatedPlayers = updatedPlayers.map(p => {
            if (p.id === exiledId) {
              if (['獵人', '狼王'].includes(p.role)) skillCanShoot = true;
              return { ...p, isAlive: false };
            }
            return p;
          });
          voteLog = `投票結束，${exiledPlayer?.name} 獲得 ${maxVotes} 票被放逐了。`;
        }
      } else {
        const targetPlayer = targetRoom.players.find(p => p.id === exiledId);
        voteLog = `投票結束，最高票 ${targetPlayer?.name}(${maxVotes}票) 未達半數(${requiredVotes+1}票)，沒有人被放逐。`;
        exiledId = null; 
      }
    }

    const winner = checkWinCondition(updatedPlayers, targetRoom.roleConfig);
    const newLogs = [{ type: 'sys', message: voteLog, time: Date.now() }];
    
    let updates = {
      players: updatedPlayers,
      votes: {}
    };

    if (triggerIdiotReveal) {
        updates.status = 'idiot_reveal';
        updates.idiotRevealInfo = idiotPlayerInfo;
        updates.logs = arrayUnion(...newLogs, { type: 'sys', message: `系統：${idiotPlayerInfo.name} 翻牌為【白癡】，免除放逐並失去投票權！`, time: Date.now() + 1 });
        await updateDoc(roomRef, updates);
        return; 
    }

    if (skillCanShoot) {
      updates.status = 'hunter_shoot';
      updates.hunterTriggeredBy = 'vote';
      updates.currentSpeaker = exiledId;
      newLogs.push({ type: 'sys', message: '等待技能(獵人/狼王)開槍...', time: Date.now() + 1 });
    } else if (winner) {
      updates.winner = winner;
      updates.status = 'ended';
    } else {
      updates.status = 'night';
      updates.nightActions = { sharedWolfTarget: null, wolfTarget: null, seerChecked: false, witchHeal: false, witchPoison: null, guardTarget: null, lastGuardTarget: targetRoom.nightActions?.lastGuardTarget || null };
      updates.subPhase = getNextNightPhase('start', updatedPlayers);
      newLogs.push({ type: 'sys', message: '天黑請閉眼...', time: Date.now() + 2 });
    }

    updates.logs = arrayUnion(...newLogs);
    await updateDoc(roomRef, updates);
  };

  const finishIdiotReveal = async () => {
      setShowIdiotReveal(false);
      if (room.hostId !== user.uid) return;
      
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id);
      let updates = {
          status: 'night',
          nightActions: { sharedWolfTarget: null, wolfTarget: null, seerChecked: false, witchHeal: false, witchPoison: null, guardTarget: null, lastGuardTarget: room.nightActions?.lastGuardTarget || null },
          subPhase: getNextNightPhase('start', room.players),
          logs: arrayUnion({ type: 'sys', message: '天黑請閉眼...', time: Date.now() })
      };
      await updateDoc(roomRef, updates);
  };

  const resetGame = async () => {
    if (room.hostId !== user.uid) return;
    const resetPlayers = room.players.map(p => ({ ...p, role: '未知', isAlive: true, isIdiotRevealed: false }));
    
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id), {
      status: 'waiting',
      subPhase: '',
      speakerQueue: [],
      currentSpeaker: null,
      players: resetPlayers,
      votes: {},
      nightActions: { lastGuardTarget: null },
      witchState: { hasHeal: true, hasPoison: true },
      knightUsed: false,
      winner: null,
      logs: arrayUnion({ type: 'sys', message: '主持人已重新啟動遊戲，請等待分配職業。', time: Date.now() })
    });
  };

  const handleNameChange = (e) => {
    setPlayerName(e.target.value);
    localStorage.setItem('ww_name', e.target.value);
  };

  const createRoom = async () => {
    if (!playerName.trim() || !user) return;
    const code = generateRoomCode();
    const newRoom = {
      id: code,
      hostId: user.uid,
      status: 'waiting', 
      subPhase: '', 
      speakerQueue: [],
      currentSpeaker: null,
      roleConfig: { '狼人': 2, '狼王': 1, '預言家': 1, '女巫': 1, '獵人': 1, '守衛': 1, '騎士': 1, '白癡': 1, '村民': 3, '雪狼': 0 },
      advancedSettings: { knightCanDuelDuringVote: true }, 
      players: [{ id: user.uid, name: playerName, role: '未知', isAlive: true, isIdiotRevealed: false, avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}` }],
      chat: [],
      logs: [{ type: 'system', message: `房間 ${code} 建立成功`, time: Date.now() }],
      votes: {},
      nightActions: { lastGuardTarget: null },
      witchState: { hasHeal: true, hasPoison: true },
      knightUsed: false,
      winner: null
    };
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', code), newRoom);
    setRoom(newRoom);
  };

  const joinRoom = async () => {
    if (!playerName.trim() || !user || !roomIdInput.trim()) return;
    const code = roomIdInput.trim().toUpperCase();
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', code);
    const snapshot = await getDoc(roomRef);
    if (snapshot.exists()) {
      const roomData = snapshot.data();
      if (roomData.status !== 'waiting') return alert('遊戲已開始，無法加入！');
      if (roomData.players.find(p => p.id === user.uid)) { setRoom(roomData); return; }
      await updateDoc(roomRef, {
        players: arrayUnion({ id: user.uid, name: playerName, role: '未知', isAlive: true, isIdiotRevealed: false, avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}` })
      });
      setRoom(roomData);
    } else alert("找不到該房間");
  };

  const leaveRoom = () => { setRoom(null); setIsCardFlipped(false); };

  const updateRoleConfig = async (role, delta) => {
    if (room.hostId !== user.uid || room.status !== 'waiting') return;
    const currentCount = room.roleConfig[role] || 0;
    const newCount = Math.max(0, currentCount + delta);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id), { [`roleConfig.${role}`]: newCount });
  };
  
  const toggleAdvancedSetting = async (settingKey) => {
    if (room.hostId !== user.uid || room.status !== 'waiting') return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id), { 
        [`advancedSettings.${settingKey}`]: !room.advancedSettings?.[settingKey] 
    });
  };

  const startGame = async () => {
    const totalRoles = Object.values(room.roleConfig).reduce((a, b) => a + b, 0);
    if (totalRoles !== room.players.length) return alert(`設定的職業總數 (${totalRoles}) 必須等於玩家人數 (${room.players.length})`);
    
    let rolesPool = [];
    Object.entries(room.roleConfig).forEach(([role, count]) => {
      for(let i=0; i<count; i++) rolesPool.push(role);
    });
    rolesPool = shuffleArray(rolesPool);

    const updatedPlayers = room.players.map((p, index) => ({ ...p, role: rolesPool[index], isAlive: true, isIdiotRevealed: false }));
    const initialSubPhase = getNextNightPhase('start', updatedPlayers);

    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id), {
      status: 'night',
      subPhase: initialSubPhase,
      players: updatedPlayers,
      votes: {},
      nightActions: { sharedWolfTarget: null, wolfTarget: null, seerChecked: false, witchHeal: false, witchPoison: null, guardTarget: null, lastGuardTarget: null },
      witchState: { hasHeal: true, hasPoison: true },
      knightUsed: false,
      winner: null,
      logs: arrayUnion(
        { type: 'sys', message: '遊戲開始！天黑請閉眼...', time: Date.now() },
        { type: 'sys', message: `系統：現在是 ${PHASE_NAMES[initialSubPhase]} 的回合`, time: Date.now() + 1 }
      )
    });
  };

  const handlePlayerClick = async (targetId) => {
    const me = room.players.find(p => p.id === user.uid);
    const isHunterShooting = room.status === 'hunter_shoot' && me?.id === room.currentSpeaker;
    
    const canDuelNow = room.status === 'day' && (!room.advancedSettings?.knightCanDuelDuringVote ? room.subPhase !== 'discussing' : true);
    const isKnightDuelling = canDuelNow && me?.role === '騎士' && !room.knightUsed;
    
    if (!me || (!me.isAlive && !isHunterShooting)) return;

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id);
    
    if (room.status === 'night') {
      if (room.subPhase === 'guard' && me.role === '守衛') {
        if (targetId === room.nightActions?.lastGuardTarget) return alert('不能連續兩晚守護同一名玩家！');
        setSelectedTarget(targetId);
      }
      else if (room.subPhase === 'wolf' && WOLF_ROLES.includes(me.role)) {
        await updateDoc(roomRef, { [`nightActions.sharedWolfTarget`]: targetId });
      } 
      else if (room.subPhase === 'witch' && me.role === '女巫') {
        setSelectedTarget(targetId);
      }
      else if (room.subPhase === 'seer' && me.role === '預言家') {
        setSelectedTarget(targetId);
      }
    } 
    else if (room.status === 'day' && room.subPhase === 'discussing' && !me.isIdiotRevealed) {
      await updateDoc(roomRef, { [`votes.${user.uid}`]: targetId });
      if (isKnightDuelling && targetId !== 'skip') {
        setSelectedTarget(targetId);
      }
    }
    else if (isHunterShooting || isKnightDuelling) {
      setSelectedTarget(targetId);
    }
  };

  const confirmAction = async (actionType) => {
    const me = room.players.find(p => p.id === user.uid);
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id);
    let updates = {};
    let localNightActions = { ...(room.nightActions || {}) };

    if (actionType === 'pass') {
      setSelectedTarget(null);
      return proceedToNextPhase();
    }

    if (room.subPhase === 'guard' && actionType === 'guard') {
      updates['nightActions.guardTarget'] = selectedTarget;
      localNightActions.guardTarget = selectedTarget;
    }
    else if (room.subPhase === 'wolf' && actionType === 'wolf_confirm') {
      updates['nightActions.wolfTarget'] = room.nightActions?.sharedWolfTarget || null;
      localNightActions.wolfTarget = room.nightActions?.sharedWolfTarget || null;
    }
    else if (room.subPhase === 'witch') {
      if (actionType === 'heal') {
        if (room.nightActions?.wolfTarget === me.id) return alert('女巫不可自救！');
        updates['nightActions.witchHeal'] = true;
        updates['witchState.hasHeal'] = false;
        localNightActions.witchHeal = true;
      } else if (actionType === 'poison') {
        updates['nightActions.witchPoison'] = selectedTarget;
        updates['witchState.hasPoison'] = false;
        localNightActions.witchPoison = selectedTarget;
      }
    }
    else if (room.subPhase === 'seer' && actionType === 'check') {
      const target = room.players.find(p => p.id === selectedTarget);
      const isBad = target.role === '狼人' || target.role === '狼王';
      setSeerResult(`${target.name} 的身分是：${isBad ? '🐺 狼人' : '🧑‍🌾 好人'}`);
      updates['nightActions.seerChecked'] = true;
      await updateDoc(roomRef, updates);
      return; 
    }
    else if (room.status === 'hunter_shoot' && actionType === 'shoot') {
      const target = room.players.find(p => p.id === selectedTarget);
      updates.logs = arrayUnion({ type: 'sys', message: `${me.role} 開槍帶走了 ${target.name}！`, time: Date.now() });
      
      let updatedPlayers = room.players.map(p => p.id === selectedTarget ? { ...p, isAlive: false } : p);
      updates.players = updatedPlayers;
      
      const winner = checkWinCondition(updatedPlayers, room.roleConfig);
      if (winner) {
        updates.winner = winner; updates.status = 'ended';
      } else {
        if (room.hunterTriggeredBy === 'vote' || room.hunterTriggeredBy === 'knight') {
           updates.status = 'night'; 
           updates.subPhase = getNextNightPhase('start', updatedPlayers);
           updates.nightActions = { sharedWolfTarget: null, wolfTarget: null, seerChecked: false, witchHeal: false, witchPoison: null, guardTarget: null, lastGuardTarget: room.nightActions?.lastGuardTarget };
        } else {
           const aliveIds = updatedPlayers.filter(p => p.isAlive).map(p => p.id);
           updates.status = 'day'; updates.subPhase = 'speaking';
           updates.speakerQueue = aliveIds; updates.currentSpeaker = aliveIds[0] || null;
        }
      }
      setSelectedTarget(null);
      await updateDoc(roomRef, updates);
      return;
    }
    else if (actionType === 'knight_duel') {
      const target = room.players.find(p => p.id === selectedTarget);
      let updatedPlayers = [...room.players];
      let isTargetWolf = WOLF_ROLES.includes(target.role); 
      let sysLog = '';
      
      if (isTargetWolf) {
        updatedPlayers = updatedPlayers.map(p => p.id === target.id ? { ...p, isAlive: false } : p);
        sysLog = `【騎士決鬥】騎士 ${me.name} 翻牌查驗了 ${target.name}，對方是狼人！${target.name} 遭到擊殺。`;
      } else {
        updatedPlayers = updatedPlayers.map(p => p.id === me.id ? { ...p, isAlive: false } : p);
        sysLog = `【騎士決鬥】騎士 ${me.name} 翻牌查驗了 ${target.name}，對方是好人！騎士 ${me.name} 判斷失誤，以死謝罪。`;
      }

      const winner = checkWinCondition(updatedPlayers, room.roleConfig);
      updates = { 
          players: updatedPlayers, 
          knightUsed: true,
          logs: arrayUnion({ type: 'sys', message: sysLog, time: Date.now() }) 
      };

      if (winner) {
         updates.winner = winner;
         updates.status = 'ended';
      } else if (isTargetWolf) {
         if (target.role === '狼王') {
             updates.status = 'hunter_shoot';
             updates.hunterTriggeredBy = 'knight';
             updates.currentSpeaker = target.id;
             updates.logs = arrayUnion({ type: 'sys', message: sysLog, time: Date.now() }, { type: 'sys', message: '等待狼王發動技能...', time: Date.now() + 1 });
         } else {
             updates.status = 'night';
             updates.subPhase = getNextNightPhase('start', updatedPlayers);
             updates.nightActions = { sharedWolfTarget: null, wolfTarget: null, seerChecked: false, witchHeal: false, witchPoison: null, guardTarget: null, lastGuardTarget: room.nightActions?.lastGuardTarget };
         }
      } else {
         let newQueue = room.speakerQueue.filter(id => id !== me.id);
         updates.speakerQueue = newQueue;
         if (room.currentSpeaker === me.id) {
             updates.currentSpeaker = newQueue.length > 0 ? newQueue[0] : null;
             if (newQueue.length === 0) updates.subPhase = 'discussing';
         }
      }
      setSelectedTarget(null);
      await updateDoc(roomRef, updates);
      return;
    }

    if (Object.keys(updates).length > 0) {
      await updateDoc(roomRef, updates);
    }
    setSelectedTarget(null);
    proceedToNextPhase({ ...room, nightActions: localNightActions });
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const textToSend = chatInput.trim();
    if (!textToSend) return;

    let channel = 'general';
    const me = room.players.find(p => p.id === user.uid);
    
    if (!me.isAlive) channel = 'ghost'; 
    else if (room.status === 'night') {
      if (WOLF_ROLES.includes(me.role)) {
        if (room.subPhase !== 'wolf') return alert('狼人只能在刀人階段交流！');
        channel = 'wolf';
      }
      else return alert('黑夜期間只有狼人陣營可以發言！');
    } else if (room.status === 'day' && room.subPhase === 'speaking') {
      if (room.currentSpeaker !== me.id) return alert('現在不是你的發言時間！');
    }

    setChatInput('');
    const msg = { id: Date.now().toString(), senderId: user.uid, senderName: me.name, text: textToSend, channel, time: Date.now() };
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id), { chat: arrayUnion(msg) });
  };

  const hostForceNext = async () => {
    if (room.status === 'day' && room.subPhase === 'discussing') {
      await performVoteCalculation(room);
    } else if (room.status === 'night' && room.subPhase === 'night_calc') {
      await performNightCalculation(room);
    } else {
      await proceedToNextPhase();
    }
  };

  // 若 Firebase 初始失敗顯示錯誤畫面
  if (initError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-red-400 p-4 text-center">
        <ShieldAlert size={64} className="mb-4" />
        <h2 className="text-2xl font-bold mb-2">資料庫連線失敗</h2>
        <p>請確認你已經在 <code>App.jsx</code> 中貼上了真實的 Firebase API Key！</p>
        <p className="text-sm mt-4 opacity-70">錯誤詳情: {initError}</p>
      </div>
    );
  }

  if (!user) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-sans">載入中...</div>;

  const isNight = room?.status === 'night' || room?.status === 'idiot_reveal';
  const themeClasses = isNight ? "bg-slate-900 text-purple-200" : "bg-[#fdf6e3] text-[#3e2723]";
  const me = room?.players.find(p => p.id === user.uid);
  const isHost = room?.hostId === user.uid;
  const RoleIcon = me ? ROLES_INFO[me.role]?.icon || Info : Info;
  
  const isHunterShooting = room?.status === 'hunter_shoot' && me?.id === room?.currentSpeaker;
  const isVotingPhase = room?.status === 'day' && room?.subPhase === 'discussing' && me?.isAlive && !me?.isIdiotRevealed;
  
  const canDuelNow = room?.status === 'day' && (!room?.advancedSettings?.knightCanDuelDuringVote ? room?.subPhase !== 'discussing' : true);
  const canUseKnightSkill = me?.role === '騎士' && me?.isAlive && canDuelNow && !room?.knightUsed;

  const myTurn = (room?.status === 'night' && room?.subPhase === 'guard' && me?.role === '守衛' && me?.isAlive) ||
                 (room?.status === 'night' && room?.subPhase === 'wolf' && WOLF_ROLES.includes(me?.role) && me?.isAlive) ||
                 (room?.status === 'night' && room?.subPhase === 'witch' && me?.role === '女巫' && me?.isAlive) ||
                 (room?.status === 'night' && room?.subPhase === 'seer' && me?.role === '預言家' && me?.isAlive) ||
                 (room?.status === 'day' && room?.subPhase === 'speaking' && room?.currentSpeaker === me?.id) ||
                 isVotingPhase ||
                 isHunterShooting;

  // --- Views ---
  if (!room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-gray-100 p-4 font-sans">
        <div className="w-full max-w-md bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700">
          <div className="text-center mb-8">
            <Moon className="w-16 h-16 mx-auto text-purple-500 mb-4 animate-pulse" />
            <h1 className="text-3xl font-bold tracking-wider">血月狼人殺</h1>
            <p className="text-gray-400 mt-2 text-sm">全自動法官版 (新增: 狼王/雪狼/騎士/白癡)</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">你的暱稱</label>
              <input type="text" value={playerName} onChange={handleNameChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="輸入玩家名稱"/>
            </div>
            <button onClick={createRoom} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200">建立新房間</button>
            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-gray-600"></div><span className="flex-shrink-0 mx-4 text-gray-500 text-sm">或</span><div className="flex-grow border-t border-gray-600"></div>
            </div>
            {/* 【優化】完美解決手機版加入按鈕被擠壓的問題 */}
            <div className="flex space-x-3">
              <input 
                type="text" 
                value={roomIdInput} 
                onChange={(e) => setRoomIdInput(e.target.value)} 
                className="w-full flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase" 
                placeholder="輸入房間代碼" 
                maxLength={4}
              />
              <button 
                onClick={joinRoom} 
                className="shrink-0 whitespace-nowrap bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-6 rounded-lg transition duration-200"
              >
                加入
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-1000 ease-in-out font-sans ${themeClasses} pb-20 md:pb-0`}>
      <style>{`
        .perspective-1000 { perspective: 1000px; } 
        .transform-style-3d { transform-style: preserve-3d; } 
        .backface-hidden { backface-visibility: hidden; } 
        .rotate-y-180 { transform: rotateY(180deg); }
        @keyframes scaleIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes bounceWobble { 
          0%, 100% { transform: translateY(0) rotate(0deg); } 
          25% { transform: translateY(-20px) rotate(-5deg); } 
          50% { transform: translateY(0) rotate(5deg); } 
          75% { transform: translateY(-10px) rotate(-2deg); } 
        }
      `}</style>

      {/* 身分揭曉動畫 Modal */}
      {showRoleModal && me && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-sm transition-opacity">
          <div className="bg-slate-800 p-8 rounded-3xl shadow-[0_0_50px_rgba(168,85,247,0.3)] border-4 border-purple-500 text-center max-w-sm w-[90%] transform transition-all animate-[scaleIn_0.4s_ease-out]">
            <h2 className="text-gray-300 text-xl mb-4 font-bold tracking-widest">你的真實身分是...</h2>
            <div className="flex justify-center mb-6">
              {React.createElement(ROLES_INFO[me.role].icon, { size: 90, className: `${ROLES_INFO[me.role].color} animate-[pulse_2s_ease-in-out_infinite]` })}
            </div>
            <h1 className={`text-5xl font-black mb-4 ${ROLES_INFO[me.role].color}`}>{me.role}</h1>
            <p className="text-gray-300 mb-8 leading-relaxed font-semibold">{ROLES_INFO[me.role].desc}</p>
            <button 
              onClick={() => setShowRoleModal(false)}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 px-6 rounded-full text-lg shadow-[0_0_20px_rgba(147,51,234,0.6)] transition-all active:scale-95"
            >
              確認身分，進入黑夜
            </button>
          </div>
        </div>
      )}

      {/* 白癡翻牌動畫 Modal */}
      {showIdiotReveal && idiotRevealData && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-green-900/90 backdrop-blur-sm transition-opacity">
           <div className="bg-white p-8 rounded-3xl shadow-[0_0_80px_rgba(34,197,94,0.5)] border-8 border-green-500 text-center max-w-md w-[90%] transform transition-all animate-[scaleIn_0.5s_ease-out]">
              <div className="flex justify-center mb-4 animate-[bounceWobble_1s_ease-in-out_infinite]">
                 <Frown size={100} className="text-green-600" />
              </div>
              <h2 className="text-3xl font-black text-gray-800 mb-2">我是白癡！</h2>
              <h3 className="text-xl font-bold text-green-700 mb-4">玩家：{idiotRevealData.name}</h3>
              <p className="text-gray-600 mb-8 font-semibold leading-relaxed">
                 被最高票放逐，觸發【白癡】被動技能！<br/>
                 免除本次放逐死亡，但從此失去所有投票與被投票權利。
              </p>
              <button 
                 onClick={finishIdiotReveal}
                 className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 px-6 rounded-full text-lg shadow-lg transition-all active:scale-95"
              >
                 {isHost ? '確認並進入黑夜' : '等待主持人確認...'}
              </button>
           </div>
        </div>
      )}

      {/* 勝利結算動畫 Overlay */}
      {room.winner && !showIdiotReveal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm transition-opacity">
          <div className="text-center p-4">
            <h1 className={`animate-[bounce_2s_ease-in-out_infinite] text-5xl md:text-8xl font-black mb-8 drop-shadow-[0_0_20px_rgba(255,255,255,0.5)] ${room.winner === 'good' ? 'text-blue-400' : 'text-red-500'}`}>
              {room.winner === 'good' ? '好人陣營 勝利！' : '狼人陣營 勝利！'}
            </h1>
            <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4 justify-center items-center">
              {isHost ? (
                <button onClick={resetGame} className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-bold shadow-lg">再來一局</button>
              ) : (
                <p className="text-white text-xl mb-4 font-bold">等待主持人重新啟動遊戲...</p>
              )}
              <button onClick={leaveRoom} className="w-full md:w-auto bg-gray-700 hover:bg-gray-600 text-white px-8 py-3 rounded-full font-bold shadow-lg">離開房間</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`p-4 shadow-md flex justify-between items-center ${isNight ? 'bg-black/40' : 'bg-white/40'}`}>
        <div className="flex items-center space-x-3">
          {isNight ? <Moon className="text-purple-400" /> : <Sun className="text-orange-500" />}
          <div>
            <h2 className="font-bold text-lg leading-tight">房間: <span className="tracking-widest">{room.id}</span></h2>
            <p className="text-xs font-bold opacity-80 mt-1">
              狀態: {
                room.status === 'waiting' ? '等待玩家...' :
                room.status === 'night' ? `🌙 黑夜 (${PHASE_NAMES[room.subPhase] || '結算'}回合)` :
                room.status === 'idiot_reveal' ? '🤪 白癡翻牌' :
                room.subPhase === 'speaking' ? '🗣️ 輪流發言' : 
                room.status === 'hunter_shoot' ? '🎯 技能發動中' : '⚖️ 自由討論/投票'
              }
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right hidden sm:block">
            <p className="font-bold">{me?.name}</p>
            <p className={`text-xs font-bold ${me?.isAlive ? 'text-green-500' : 'text-red-400'}`}>{me?.isAlive ? '存活' : '已淘汰 (靈魂)'}</p>
          </div>
          <button onClick={leaveRoom} className="p-2 rounded-full hover:bg-black/10 transition"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Actions & Players */}
        <div className="space-y-6 md:col-span-1">
          
          {/* Waiting Phase: Role Config & Advanced Settings */}
          {room.status === 'waiting' && (
            <div className="bg-white/50 rounded-xl p-4 shadow-lg border-2 border-amber-500 flex flex-col max-h-[60vh]">
              <h3 className="font-bold mb-3 flex items-center text-[#3e2723] shrink-0"><Shield size={18} className="mr-2"/> 職業設定 (目前: {room.players.length}人)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto pr-2 mb-4 shrink">
                {AVAILABLE_ROLES.map(role => (
                  <div key={role} className="flex justify-between items-center bg-white/70 p-2 rounded-lg shadow-sm border border-gray-200">
                    <span className={`font-bold text-sm ${ROLES_INFO[role].color}`}>{role}</span>
                    <div className="flex items-center space-x-1">
                      {isHost && <button onClick={()=>updateRoleConfig(role, -1)} className="p-1.5 bg-red-100 text-red-600 rounded-md hover:bg-red-200 active:bg-red-300"><Minus size={16}/></button>}
                      <span className="font-bold w-5 text-center text-gray-800">{room.roleConfig?.[role] || 0}</span>
                      {isHost && <button onClick={()=>updateRoleConfig(role, 1)} className="p-1.5 bg-green-100 text-green-600 rounded-md hover:bg-green-200 active:bg-green-300"><Plus size={16}/></button>}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="shrink-0 border-t border-amber-300 pt-3 mt-auto">
                 <h4 className="font-bold text-sm mb-2 flex items-center text-amber-800"><CheckSquare size={16} className="mr-1"/> 主持人進階設定</h4>
                 <div className="flex items-center justify-between bg-white/60 p-2 rounded-lg border border-amber-200">
                    <span className="text-sm font-semibold text-gray-700">騎士可於投票階段決鬥</span>
                    <button 
                      disabled={!isHost}
                      onClick={() => toggleAdvancedSetting('knightCanDuelDuringVote')}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${room.advancedSettings?.knightCanDuelDuringVote ? 'bg-green-500' : 'bg-gray-300'} ${!isHost && 'opacity-50 cursor-not-allowed'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${room.advancedSettings?.knightCanDuelDuringVote ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                 </div>
              </div>
            </div>
          )}

          {/* Player Cards & Role Skills Panel */}
          {room.status !== 'waiting' && !room.winner && (
            <div className="space-y-4">
              <div className="perspective-1000 h-32 cursor-pointer" onClick={() => setIsCardFlipped(!isCardFlipped)}>
                <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${isCardFlipped ? 'rotate-y-180' : ''}`}>
                  <div className={`absolute w-full h-full backface-hidden rounded-xl shadow-md flex flex-col items-center justify-center border-2 ${isNight ? 'bg-slate-800 border-purple-900' : 'bg-[#eaddc4] border-[#cbb58c]'}`}>
                    <Moon className={`w-8 h-8 mb-1 ${isNight ? 'text-purple-500' : 'text-gray-600'}`} />
                    <p className="font-bold text-sm tracking-wider">點擊翻開身分卡</p>
                  </div>
                  <div className={`absolute w-full h-full backface-hidden rotate-y-180 rounded-xl shadow-md p-4 border-2 flex flex-col items-center justify-center text-center ${isNight ? 'bg-slate-900 border-purple-500' : 'bg-white border-[#8b5a2b]'}`}>
                    <h3 className={`text-2xl font-black mb-1 ${ROLES_INFO[me?.role]?.color}`}>
                      {me?.role} {me?.isIdiotRevealed && '(已翻牌)'}
                    </h3>
                    <p className="text-xs font-semibold opacity-80">{ROLES_INFO[me?.role]?.desc}</p>
                  </div>
                </div>
              </div>

              {/* 騎士專屬發動技能區塊 (判斷是否開啟進階設定) */}
              {canUseKnightSkill && (
                <div className={`p-4 rounded-xl shadow-lg border-2 mt-4 animate-[pulse_2s_ease-in-out_infinite] bg-amber-100 border-amber-500 text-amber-900`}>
                  <h4 className="font-bold text-center mb-2 flex items-center justify-center">
                    <Sword size={16} className="mr-2"/> 騎士專屬技能
                  </h4>
                  <p className="text-xs text-center mb-3 font-bold opacity-80">點選目標後點擊按鈕進行決鬥 (整局限用一次)</p>
                  <button 
                    onClick={()=>confirmAction('knight_duel')} 
                    disabled={!selectedTarget} 
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white py-2 rounded-lg disabled:opacity-50 font-bold shadow-md transition"
                  >
                    {selectedTarget ? '對選中玩家發動決鬥！' : '請先點選玩家頭像'}
                  </button>
                </div>
              )}

              {/* Action Panel based on turn */}
              {myTurn && (
                <div className={`p-4 rounded-xl shadow-lg border-2 animate-[pulse_2s_ease-in-out_infinite] ${isNight ? 'bg-purple-900/40 border-purple-500' : 'bg-green-100 border-green-500 text-green-900'}`}>
                  <h4 className="font-bold text-center mb-2 flex items-center justify-center">
                    <Play size={16} className="mr-2"/> 
                    {isVotingPhase ? '投票階段' : '你的回合，請操作'}
                  </h4>
                  
                  {/* Guard Action */}
                  {room.subPhase === 'guard' && (
                    <div className="flex gap-2">
                      <button onClick={()=>confirmAction('guard')} disabled={!selectedTarget} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold disabled:opacity-50">確認守護</button>
                      <button onClick={()=>confirmAction('pass')} className="flex-1 bg-gray-600 text-white py-2 rounded-lg font-bold">不守 (過)</button>
                    </div>
                  )}

                  {/* Wolf Action */}
                  {room.subPhase === 'wolf' && (
                    <div className="flex gap-2">
                      <button onClick={()=>confirmAction('wolf_confirm')} disabled={!room.nightActions?.sharedWolfTarget} className="flex-1 bg-red-600 text-white py-2 rounded-lg font-bold disabled:opacity-50">確認擊殺</button>
                      <button onClick={()=>confirmAction('pass')} className="flex-1 bg-gray-600 text-white py-2 rounded-lg font-bold">不殺 (過)</button>
                    </div>
                  )}

                  {/* Witch Action */}
                  {room.subPhase === 'witch' && (
                    <div className="space-y-2 text-sm">
                      <p className="text-center font-bold text-red-300">昨晚狼人刀了：{room.players.find(p=>p.id === room.nightActions?.wolfTarget)?.name || '沒人'}</p>
                      <div className="flex gap-2">
                        <button onClick={()=>confirmAction('heal')} disabled={!room.witchState?.hasHeal || !room.nightActions?.wolfTarget} className="flex-1 bg-green-600 text-white py-2 rounded-lg font-bold disabled:opacity-50">用解藥</button>
                        <button onClick={()=>confirmAction('poison')} disabled={!room.witchState?.hasPoison || !selectedTarget} className="flex-1 bg-purple-600 text-white py-2 rounded-lg font-bold disabled:opacity-50">用毒藥</button>
                      </div>
                      <button onClick={()=>confirmAction('pass')} className="w-full bg-gray-600 text-white py-2 rounded-lg font-bold">什麼都不做 (過)</button>
                    </div>
                  )}

                  {/* Seer Action */}
                  {room.subPhase === 'seer' && (
                    <div className="space-y-2 text-sm">
                       {seerResult ? (
                         <>
                           <div className="bg-blue-900 p-3 rounded-lg text-center text-blue-200 text-lg font-bold">{seerResult}</div>
                           <button onClick={()=>confirmAction('pass')} className="w-full bg-gray-600 text-white py-2 rounded-lg font-bold">確認 (過)</button>
                         </>
                       ) : (
                         <div className="flex gap-2">
                           <button onClick={()=>confirmAction('check')} disabled={!selectedTarget} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold disabled:opacity-50">確認查驗</button>
                           <button onClick={()=>confirmAction('pass')} className="flex-1 bg-gray-600 text-white py-2 rounded-lg font-bold">不驗 (過)</button>
                         </div>
                       )}
                    </div>
                  )}

                  {/* Speaking Action */}
                  {room.subPhase === 'speaking' && (
                    <button onClick={() => proceedToNextPhase()} className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-bold shadow-md transition-all">結束發言 (過)</button>
                  )}

                  {/* Discussing / Voting Action (含棄票按鈕) */}
                  {isVotingPhase && (
                    <div className="space-y-2 text-sm">
                      <p className="text-center font-bold mb-2 text-amber-900">請點擊玩家頭像投票，或選擇棄票</p>
                      <button 
                        onClick={() => handlePlayerClick('skip')} 
                        className={`w-full py-3 rounded-lg font-bold transition-all shadow-md ${room.votes?.[user.uid] === 'skip' ? 'bg-amber-600 text-white ring-4 ring-amber-300' : 'bg-gray-600 text-gray-200 hover:bg-gray-500'}`}
                      >
                        {room.votes?.[user.uid] === 'skip' ? '✔️ 已選擇：棄票' : '我要棄票'}
                      </button>
                      <div className="flex justify-center mt-2 bg-amber-100/50 p-2 rounded">
                         <span className="text-xs font-bold text-amber-900">
                           投票進度: {Object.keys(room.votes || {}).length} / {room.players.filter(p=>p.isAlive && !p.isIdiotRevealed).length}
                         </span>
                      </div>
                    </div>
                  )}

                  {/* Hunter/Wolf King Action */}
                  {room.status === 'hunter_shoot' && (
                    <div className="flex gap-2">
                      <button onClick={()=>confirmAction('shoot')} disabled={!selectedTarget} className="flex-1 bg-orange-600 text-white py-2 rounded-lg font-bold disabled:opacity-50">開槍帶走</button>
                      <button onClick={()=>confirmAction('pass')} className="flex-1 bg-gray-600 text-white py-2 rounded-lg font-bold">不開槍 (過)</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Player Grid */}
          <div className={`rounded-xl p-4 shadow-lg ${isNight ? 'bg-slate-800/50' : 'bg-white/50'}`}>
            <h3 className="font-bold mb-3 flex items-center">
              <Users size={18} className="mr-2"/> 存活玩家 ({room.players.filter(p=>p.isAlive).length}/{room.players.length})
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {room.players.map(p => {
                const isSpeaking = (room.status === 'day' && room.subPhase === 'speaking' && room.currentSpeaker === p.id) || (room.status === 'hunter_shoot' && room.currentSpeaker === p.id);
                
                const isFinalWolfTarget = room.status === 'night' && WOLF_ROLES.includes(me?.role) && room.nightActions?.wolfTarget === p.id;
                const isSharedWolfTarget = room.status === 'night' && room.subPhase === 'wolf' && WOLF_ROLES.includes(me?.role) && room.nightActions?.sharedWolfTarget === p.id;
                const wolfTargetUI = isFinalWolfTarget || isSharedWolfTarget;
                
                const isDayTargeted = room.votes?.[user.uid] === p.id;
                const isSelected = selectedTarget === p.id;
                
                let borderClass = 'border-transparent';
                if (isSpeaking) borderClass = 'border-green-500 bg-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.5)]';
                else if (isSelected) borderClass = 'border-blue-500 bg-blue-500/30'; 
                else if (wolfTargetUI) borderClass = 'border-red-500 bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.5)]';
                else if (isDayTargeted) borderClass = 'border-amber-500 bg-amber-500/20';

                // 白天投票時，翻牌的白癡不能被投票
                const isIdiotUnvotable = isVotingPhase && p.isIdiotRevealed;

                const canInteract = (me?.isAlive || isHunterShooting) && p.isAlive && (
                  (isVotingPhase && !isIdiotUnvotable) || 
                  (myTurn && ['guard', 'witch', 'seer', 'wolf'].includes(room.subPhase)) ||
                  isHunterShooting ||
                  canUseKnightSkill
                );

                return (
                  <div 
                    key={p.id} onClick={() => canInteract && handlePlayerClick(p.id)}
                    className={`relative flex items-center p-2 rounded-lg border-2 transition-all ${!p.isAlive ? 'opacity-40 grayscale border-transparent' : canInteract ? `${borderClass} hover:border-gray-400 cursor-pointer` : borderClass}`}
                  >
                    {isSpeaking && <Mic className="absolute -top-2 -right-2 text-green-500 animate-bounce bg-white rounded-full p-0.5" size={20} />}
                    {p.isIdiotRevealed && p.isAlive && <Frown className="absolute -top-2 -left-2 text-green-700 bg-white rounded-full p-0.5 shadow-md" size={18} />}
                    <img src={p.avatar} alt="avatar" className="w-10 h-10 rounded-full mr-2 bg-black/10" />
                    <div className="truncate w-full">
                      <p className={`font-semibold text-sm ${!p.isAlive && 'line-through'}`}>{p.name}</p>
                      <div className="flex gap-1 mt-1 h-2">
                         {room.status === 'day' && room.subPhase === 'discussing' && Object.values(room.votes || {}).filter(v => v === p.id).map((_, i) => <div key={`dv-${i}`} className="w-2 h-2 rounded-full bg-amber-500"></div>)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Host Controls */}
          {isHost && (
            <div className={`rounded-xl p-3 shadow-sm border-2 border-dashed ${isNight ? 'bg-slate-900 border-slate-700' : 'bg-amber-100/50 border-amber-300'}`}>
              <h3 className="font-bold text-xs mb-2 opacity-60 flex items-center"><Play size={12} className="mr-1"/> 主持人工具</h3>
              {room.status === 'waiting' ? (
                <button onClick={startGame} className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-bold transition shadow-md">開始遊戲 (派發身分)</button>
              ) : (
                <button onClick={hostForceNext} className="w-full bg-gray-600 text-white py-2 rounded-lg text-sm font-bold transition">
                  {room.status === 'day' && room.subPhase === 'discussing' ? '強制結算投票' : '強制推進階段 (防卡死)'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Chat & Logs */}
        <div className={`md:col-span-2 flex flex-col h-[60vh] md:h-[80vh] rounded-xl shadow-lg border ${isNight ? 'bg-slate-800 border-slate-700' : 'bg-white border-[#dcd0b8]'}`}>
          <div className="flex-grow overflow-y-auto p-4 space-y-3">
            {room.logs.map((log, i) => (
              <div key={`log-${i}`} className="flex justify-center my-2 animate-[fadeIn_0.5s_ease-in-out]">
                <span className={`px-4 py-1.5 rounded-full text-xs font-bold shadow-sm ${log.type === 'sys' ? (isNight ? 'bg-purple-900/80 text-purple-200' : 'bg-amber-500/30 text-amber-900') : 'bg-gray-500/20 text-gray-400'}`}>
                  {log.message}
                </span>
              </div>
            ))}
            {room.chat.map(msg => {
              // 狼隊專用頻道 (狼人、狼王、雪狼 皆可看見)
              if (msg.channel === 'wolf' && (!me || (!WOLF_ROLES.includes(me.role) && me.id !== msg.senderId))) return null;
              if (msg.channel === 'ghost' && me?.isAlive) return null;
              const isMe = msg.senderId === user.uid;
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${msg.channel === 'wolf' ? 'bg-red-900 text-red-100 border border-red-700' : msg.channel === 'ghost' ? 'bg-gray-700 text-gray-300 border border-gray-600' : isMe ? (isNight ? 'bg-purple-700 text-white' : 'bg-[#8b5a2b] text-white') : (isNight ? 'bg-slate-700 text-gray-200' : 'bg-[#f4e4bc] text-[#3e2723]')}`}>
                    {!isMe && <p className="text-[10px] opacity-70 mb-1 font-bold">{msg.senderName} {msg.channel==='wolf' && '(狼伴)'}</p>}
                    <p className="text-sm">{msg.text}</p>
                  </div>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>

          {/* Input Area */}
          <div className={`p-3 border-t ${isNight ? 'border-slate-700 bg-slate-900 rounded-b-xl' : 'border-[#dcd0b8] bg-[#fdf6e3] rounded-b-xl'}`}>
            <form onSubmit={sendMessage} className="flex space-x-2">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                placeholder={!me?.isAlive ? "在靈魂頻道發言..." : room.status === 'night' ? (WOLF_ROLES.includes(me?.role) && room.subPhase === 'wolf' ? "與狼伴密謀..." : "黑夜降臨，請保持安靜...") : room.subPhase === 'speaking' ? (room.currentSpeaker === me.id ? "現在是你的發言時間！" : "請聽別人發言...") : "自由討論時間..."}
                disabled={me?.isAlive && ((room.status === 'night' && (!WOLF_ROLES.includes(me?.role) || room.subPhase !== 'wolf')) || (room.status === 'day' && room.subPhase === 'speaking' && room.currentSpeaker !== me?.id))}
                className={`flex-grow px-4 py-2 rounded-full focus:outline-none focus:ring-2 disabled:opacity-50 ${isNight ? 'bg-slate-800 border-slate-700 text-white focus:ring-purple-500 placeholder-slate-500' : 'bg-white border-[#dcd0b8] focus:ring-[#8b5a2b]'} border`}
              />
              <button type="submit" disabled={me?.isAlive && ((room.status === 'night' && (!WOLF_ROLES.includes(me?.role) || room.subPhase !== 'wolf')) || (room.status === 'day' && room.subPhase === 'speaking' && room.currentSpeaker !== me?.id))}
                className={`p-2 rounded-full flex items-center justify-center transition disabled:opacity-50 ${isNight ? 'bg-purple-600 hover:bg-purple-700 text-white disabled:bg-slate-700' : 'bg-[#8b5a2b] hover:bg-[#6c4622] text-white disabled:bg-gray-300'}`}
              ><Send size={20} /></button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}