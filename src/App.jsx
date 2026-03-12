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
  LogOut, Vote, Plus, Minus, Mic, Target, HeartPulse, ShieldAlert
} from 'lucide-react';

// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyCi7lXBAESeCpXpxZho7wz5i6KMpY9XfmA",
  authDomain: "hol-4e473.firebaseapp.com",
  projectId: "hol-4e473",
  storageBucket: "hol-4e473.firebasestorage.app",
  messagingSenderId: "665755863496",
  appId: "1:665755863496:web:7ad0698d2360fc577898fd"
};
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

const ROLES_INFO = {
  '狼人': { desc: '夜間可與同伴討論並殺害一名玩家。', color: 'text-red-500', icon: Skull },
  '預言家': { desc: '夜間可查驗一名玩家的真實身分。', color: 'text-blue-500', icon: Eye },
  '女巫': { desc: '擁有一瓶解藥與一瓶毒藥。', color: 'text-purple-500', icon: HeartPulse },
  '獵人': { desc: '死後可以開槍帶走一名玩家。', color: 'text-orange-500', icon: Target },
  '守衛': { desc: '每晚可守護一名玩家免受狼害(不可連守)。', color: 'text-indigo-400', icon: ShieldAlert },
  '村民': { desc: '沒有特殊技能，依靠推理找出狼人。', color: 'text-green-600', icon: Users },
  '未知': { desc: '等待分配...', color: 'text-gray-400', icon: Info }
};

const AVAILABLE_ROLES = ['狼人', '預言家', '女巫', '獵人', '守衛', '村民'];

const NIGHT_PHASE_ORDER = ['guard', 'wolf', 'witch', 'seer', 'night_calc'];
const PHASE_NAMES = {
  'guard': '守衛',
  'wolf': '狼人',
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
  
  const [seerResult, setSeerResult] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const chatBottomRef = useRef(null);

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
        if (data.status !== 'night') {
          setSeerResult(null);
          setSelectedTarget(null);
        }
      } else {
        setRoom(null);
        alert("房間已解散");
      }
    });
    return () => unsubscribe();
  }, [user, room?.id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room?.chat, room?.logs]);


  const checkWinCondition = (players) => {
    const wolves = players.filter(p => p.role === '狼人' && p.isAlive).length;
    const gods = players.filter(p => ['預言家', '女巫', '獵人', '守衛'].includes(p.role) && p.isAlive).length;
    const villagers = players.filter(p => p.role === '村民' && p.isAlive).length;

    if (wolves === 0) return 'good'; 
    if (gods === 0 || villagers === 0) return 'wolf'; 
    return null;
  };

  const getNextNightPhase = (currentSubPhase, players) => {
    let idx = NIGHT_PHASE_ORDER.indexOf(currentSubPhase);
    while (idx < NIGHT_PHASE_ORDER.length - 1) {
      idx++;
      const nextPhase = NIGHT_PHASE_ORDER[idx];
      if (nextPhase === 'guard' && players.some(p => p.role === '守衛' && p.isAlive)) return nextPhase;
      if (nextPhase === 'wolf') return nextPhase; 
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
      const winner = checkWinCondition(currentRoom.players);
      if (winner) {
        updates = { winner, status: 'ended' };
      } else {
        if (currentRoom.hunterTriggeredBy === 'vote') {
           updates = {
             status: 'night', subPhase: getNextNightPhase('start', currentRoom.players),
             votes: {}, nightActions: { sharedWolfTarget: null, wolfTarget: null, seerChecked: false, witchHeal: false, witchPoison: null, guardTarget: null },
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

    let hunterCanShoot = false;
    let hunterId = null;

    updatedPlayers = updatedPlayers.map(p => {
      if (deadIds.includes(p.id)) {
        if (p.role === '獵人') {
          hunterId = p.id;
          if (witchPoison !== p.id) hunterCanShoot = true;
        }
        return { ...p, isAlive: false };
      }
      return p;
    });

    if (deadIds.length > 0) {
      const deadNames = updatedPlayers.filter(p => deadIds.includes(p.id)).map(p => p.name).join('、');
      nightLog = `昨晚，${deadNames} 死亡了。`;
    }

    const winner = checkWinCondition(updatedPlayers);
    const newLogs = [{ type: 'sys', message: nightLog, time: Date.now() }];
    
    let updates = { 
      players: updatedPlayers, 
      'nightActions.lastGuardTarget': guardTarget || null
    };

    if (winner) {
      updates.winner = winner;
      updates.status = 'ended';
    } else if (hunterCanShoot) {
      updates.status = 'hunter_shoot';
      updates.hunterTriggeredBy = 'night';
      updates.currentSpeaker = hunterId;
      newLogs.push({ type: 'sys', message: '等待獵人發動技能...', time: Date.now() + 1 });
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

  const performVoteCalculation = async () => {
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id);
    const voteCounts = {};
    Object.values(room.votes || {}).forEach(target => { voteCounts[target] = (voteCounts[target] || 0) + 1; });
    
    let maxVotes = 0; let exiledId = null;
    for (const [target, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) { maxVotes = count; exiledId = target; } 
      else if (count === maxVotes) { exiledId = null; }
    }

    let updatedPlayers = [...room.players];
    let voteLog = '投票結果平局，沒有人被放逐。';
    let isHunterExiled = false;

    // 處理棄票邏輯
    if (exiledId === 'skip') {
      voteLog = '多數玩家選擇棄票，沒有人被放逐。';
      exiledId = null;
    } else if (exiledId) {
      updatedPlayers = updatedPlayers.map(p => {
        if (p.id === exiledId) {
          if (p.role === '獵人') isHunterExiled = true;
          return { ...p, isAlive: false };
        }
        return p;
      });
      const exiledPlayer = room.players.find(p => p.id === exiledId);
      voteLog = `投票結束，${exiledPlayer?.name} 被放逐了。`;
    }

    const winner = checkWinCondition(updatedPlayers);
    const newLogs = [{ type: 'sys', message: voteLog, time: Date.now() }];
    
    let updates = {
      players: updatedPlayers,
      votes: {}
    };

    if (winner) {
      updates.winner = winner;
      updates.status = 'ended';
    } else if (isHunterExiled) {
      updates.status = 'hunter_shoot';
      updates.hunterTriggeredBy = 'vote';
      updates.currentSpeaker = exiledId;
      newLogs.push({ type: 'sys', message: '等待獵人開槍...', time: Date.now() + 1 });
    } else {
      updates.status = 'night';
      updates.nightActions = { sharedWolfTarget: null, wolfTarget: null, seerChecked: false, witchHeal: false, witchPoison: null, guardTarget: null, lastGuardTarget: room.nightActions?.lastGuardTarget || null };
      updates.subPhase = getNextNightPhase('start', updatedPlayers);
      newLogs.push({ type: 'sys', message: '天黑請閉眼...', time: Date.now() + 2 });
    }

    updates.logs = arrayUnion(...newLogs);
    await updateDoc(roomRef, updates);
  };

  const resetGame = async () => {
    if (room.hostId !== user.uid) return;
    const resetPlayers = room.players.map(p => ({ ...p, role: '未知', isAlive: true }));
    
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id), {
      status: 'waiting',
      subPhase: '',
      speakerQueue: [],
      currentSpeaker: null,
      players: resetPlayers,
      votes: {},
      nightActions: { lastGuardTarget: null },
      witchState: { hasHeal: true, hasPoison: true },
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
      roleConfig: { '狼人': 3, '預言家': 1, '女巫': 1, '獵人': 1, '守衛': 1, '村民': 3 },
      players: [{ id: user.uid, name: playerName, role: '未知', isAlive: true, avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}` }],
      chat: [],
      logs: [{ type: 'system', message: `房間 ${code} 建立成功`, time: Date.now() }],
      votes: {},
      nightActions: { lastGuardTarget: null },
      witchState: { hasHeal: true, hasPoison: true },
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
        players: arrayUnion({ id: user.uid, name: playerName, role: '未知', isAlive: true, avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}` })
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

  const startGame = async () => {
    const totalRoles = Object.values(room.roleConfig).reduce((a, b) => a + b, 0);
    if (totalRoles !== room.players.length) return alert(`設定的職業總數 (${totalRoles}) 必須等於玩家人數 (${room.players.length})`);
    
    let rolesPool = [];
    Object.entries(room.roleConfig).forEach(([role, count]) => {
      for(let i=0; i<count; i++) rolesPool.push(role);
    });
    rolesPool = shuffleArray(rolesPool);

    const updatedPlayers = room.players.map((p, index) => ({ ...p, role: rolesPool[index], isAlive: true }));
    const initialSubPhase = getNextNightPhase('start', updatedPlayers);

    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id), {
      status: 'night',
      subPhase: initialSubPhase,
      players: updatedPlayers,
      votes: {},
      nightActions: { sharedWolfTarget: null, wolfTarget: null, seerChecked: false, witchHeal: false, witchPoison: null, guardTarget: null, lastGuardTarget: null },
      witchState: { hasHeal: true, hasPoison: true },
      winner: null,
      logs: arrayUnion(
        { type: 'sys', message: '遊戲開始！天黑請閉眼...', time: Date.now() },
        { type: 'sys', message: `系統：現在是 ${PHASE_NAMES[initialSubPhase]} 的回合`, time: Date.now() + 1 }
      )
    });
    setIsCardFlipped(false);
  };

  const handlePlayerClick = async (targetId) => {
    const me = room.players.find(p => p.id === user.uid);
    const isHunterShooting = room.status === 'hunter_shoot' && me?.id === room.currentSpeaker;
    if (!me || (!me.isAlive && !isHunterShooting)) return;

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id);
    
    if (room.status === 'night') {
      if (room.subPhase === 'guard' && me.role === '守衛') {
        if (targetId === room.nightActions?.lastGuardTarget) return alert('不能連續兩晚守護同一名玩家！');
        setSelectedTarget(targetId);
      }
      else if (room.subPhase === 'wolf' && me.role === '狼人') {
        await updateDoc(roomRef, { [`nightActions.sharedWolfTarget`]: targetId });
      } 
      else if (room.subPhase === 'witch' && me.role === '女巫') {
        setSelectedTarget(targetId);
      }
      else if (room.subPhase === 'seer' && me.role === '預言家') {
        setSelectedTarget(targetId);
      }
    } 
    else if (room.status === 'day' && room.subPhase === 'discussing') {
      // 在討論階段將目標存入 votes (包含 targetId === 'skip' 的情況)
      await updateDoc(roomRef, { [`votes.${user.uid}`]: targetId });
    }
    else if (isHunterShooting) {
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
      const isBad = target.role === '狼人';
      setSeerResult(`${target.name} 的身分是：${isBad ? '🐺 狼人' : '🧑‍🌾 好人'}`);
      updates['nightActions.seerChecked'] = true;
      await updateDoc(roomRef, updates);
      return; 
    }
    else if (room.status === 'hunter_shoot' && actionType === 'shoot') {
      const target = room.players.find(p => p.id === selectedTarget);
      updates.logs = arrayUnion({ type: 'sys', message: `獵人開槍帶走了 ${target.name}！`, time: Date.now() });
      
      let updatedPlayers = room.players.map(p => p.id === selectedTarget ? { ...p, isAlive: false } : p);
      updates.players = updatedPlayers;
      
      const winner = checkWinCondition(updatedPlayers);
      if (winner) {
        updates.winner = winner; updates.status = 'ended';
      } else {
        if (room.hunterTriggeredBy === 'vote') {
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
      if (me.role === '狼人') {
        if (room.subPhase !== 'wolf') return alert('狼人只能在刀人階段交流！');
        channel = 'wolf';
      }
      else return alert('黑夜期間只有狼人可以發言！');
    } else if (room.status === 'day' && room.subPhase === 'speaking') {
      if (room.currentSpeaker !== me.id) return alert('現在不是你的發言時間！');
    }

    setChatInput('');
    const msg = { id: Date.now().toString(), senderId: user.uid, senderName: me.name, text: textToSend, channel, time: Date.now() };
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id), { chat: arrayUnion(msg) });
  };

  const hostForceNext = async () => {
    if (room.status === 'day' && room.subPhase === 'discussing') {
      await performVoteCalculation();
    } else if (room.status === 'night' && room.subPhase === 'night_calc') {
      await performNightCalculation(room);
    } else {
      await proceedToNextPhase();
    }
  };

  // --- Render Helpers ---
  if (!user) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-sans">載入中...</div>;

  const isNight = room?.status === 'night';
  const themeClasses = isNight ? "bg-slate-900 text-purple-200" : "bg-[#fdf6e3] text-[#3e2723]";
  const me = room?.players.find(p => p.id === user.uid);
  const isHost = room?.hostId === user.uid;
  const RoleIcon = me ? ROLES_INFO[me.role]?.icon || Info : Info;
  
  const isHunterShooting = room?.status === 'hunter_shoot' && me?.id === room?.currentSpeaker;
  const isVotingPhase = room?.status === 'day' && room?.subPhase === 'discussing' && me?.isAlive;

  // 加入投票階段，讓操作面板可以在白天投票時顯示
  const myTurn = (room?.status === 'night' && room?.subPhase === 'guard' && me?.role === '守衛' && me?.isAlive) ||
                 (room?.status === 'night' && room?.subPhase === 'wolf' && me?.role === '狼人' && me?.isAlive) ||
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
            <p className="text-gray-400 mt-2 text-sm">全自動法官機制版 (屠邊局)</p>
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
            <div className="flex space-x-2">
              <input type="text" value={roomIdInput} onChange={(e) => setRoomIdInput(e.target.value)} className="flex-grow bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase" placeholder="輸入房間代碼" maxLength={4}/>
              <button onClick={joinRoom} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-6 rounded-lg transition duration-200">加入</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-1000 ease-in-out font-sans ${themeClasses} pb-20 md:pb-0`}>
      <style>{`.perspective-1000 { perspective: 1000px; } .transform-style-3d { transform-style: preserve-3d; } .backface-hidden { backface-visibility: hidden; } .rotate-y-180 { transform: rotateY(180deg); }`}</style>

      {/* 勝利結算動畫 Overlay */}
      {room.winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm transition-opacity">
          <div className="text-center">
            <h1 className={`animate-[bounce_2s_ease-in-out_infinite] text-6xl md:text-8xl font-black mb-8 drop-shadow-[0_0_20px_rgba(255,255,255,0.5)] ${room.winner === 'good' ? 'text-blue-400' : 'text-red-500'}`}>
              {room.winner === 'good' ? '好人陣營 勝利！' : '狼人陣營 勝利！'}
            </h1>
            <div className="space-y-4 md:space-y-0 md:space-x-4">
              {isHost ? (
                <button onClick={resetGame} className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-bold">再來一局</button>
              ) : (
                <p className="text-white text-xl mb-4">等待主持人重新啟動遊戲...</p>
              )}
              <button onClick={leaveRoom} className="w-full md:w-auto bg-gray-700 hover:bg-gray-600 text-white px-8 py-3 rounded-full font-bold">離開房間</button>
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
                room.subPhase === 'speaking' ? '🗣️ 輪流發言' : 
                room.status === 'hunter_shoot' ? '🎯 獵人開槍' : '⚖️ 自由討論/投票'
              }
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right hidden sm:block">
            <p className="font-bold">{me?.name}</p>
            <p className={`text-xs ${me?.isAlive ? 'text-green-500' : 'text-red-400'}`}>{me?.isAlive ? '存活' : '已淘汰 (靈魂)'}</p>
          </div>
          <button onClick={leaveRoom} className="p-2 rounded-full hover:bg-black/10 transition"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Actions & Players */}
        <div className="space-y-6 md:col-span-1">
          
          {/* Waiting Phase: Role Config */}
          {room.status === 'waiting' && (
            <div className="bg-white/50 rounded-xl p-4 shadow-lg border-2 border-amber-500">
              <h3 className="font-bold mb-3 flex items-center text-[#3e2723]"><Shield size={18} className="mr-2"/> 職業設定 (目前: {room.players.length}人)</h3>
              <div className="space-y-2">
                {AVAILABLE_ROLES.map(role => (
                  <div key={role} className="flex justify-between items-center bg-white/60 p-2 rounded">
                    <span className="font-semibold text-sm text-[#3e2723]">{role}</span>
                    <div className="flex items-center space-x-3">
                      {isHost && <button onClick={()=>updateRoleConfig(role, -1)} className="p-1 bg-red-100 text-red-600 rounded hover:bg-red-200"><Minus size={14}/></button>}
                      <span className="font-bold w-4 text-center text-[#3e2723]">{room.roleConfig?.[role] || 0}</span>
                      {isHost && <button onClick={()=>updateRoleConfig(role, 1)} className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200"><Plus size={14}/></button>}
                    </div>
                  </div>
                ))}
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
                    <h3 className={`text-xl font-bold mb-1 ${ROLES_INFO[me?.role]?.color}`}>{me?.role}</h3>
                    <p className="text-xs opacity-80">{ROLES_INFO[me?.role]?.desc}</p>
                  </div>
                </div>
              </div>

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
                      <button onClick={()=>confirmAction('guard')} disabled={!selectedTarget} className="flex-1 bg-indigo-600 text-white py-2 rounded disabled:opacity-50">確認守護</button>
                      <button onClick={()=>confirmAction('pass')} className="flex-1 bg-gray-600 text-white py-2 rounded">不守 (過)</button>
                    </div>
                  )}

                  {/* Wolf Action */}
                  {room.subPhase === 'wolf' && (
                    <div className="flex gap-2">
                      <button onClick={()=>confirmAction('wolf_confirm')} disabled={!room.nightActions?.sharedWolfTarget} className="flex-1 bg-red-600 text-white py-2 rounded disabled:opacity-50">確認擊殺</button>
                      <button onClick={()=>confirmAction('pass')} className="flex-1 bg-gray-600 text-white py-2 rounded">不殺 (過)</button>
                    </div>
                  )}

                  {/* Witch Action */}
                  {room.subPhase === 'witch' && (
                    <div className="space-y-2 text-sm">
                      <p className="text-center font-bold text-red-300">昨晚狼人刀了：{room.players.find(p=>p.id === room.nightActions?.wolfTarget)?.name || '沒人'}</p>
                      <div className="flex gap-2">
                        <button onClick={()=>confirmAction('heal')} disabled={!room.witchState?.hasHeal || !room.nightActions?.wolfTarget} className="flex-1 bg-green-600 text-white py-2 rounded disabled:opacity-50">用解藥</button>
                        <button onClick={()=>confirmAction('poison')} disabled={!room.witchState?.hasPoison || !selectedTarget} className="flex-1 bg-purple-600 text-white py-2 rounded disabled:opacity-50">用毒藥</button>
                      </div>
                      <button onClick={()=>confirmAction('pass')} className="w-full bg-gray-600 text-white py-2 rounded">什麼都不做 (過)</button>
                    </div>
                  )}

                  {/* Seer Action */}
                  {room.subPhase === 'seer' && (
                    <div className="space-y-2 text-sm">
                       {seerResult ? (
                         <>
                           <div className="bg-blue-900 p-2 rounded text-center text-blue-200 font-bold">{seerResult}</div>
                           <button onClick={()=>confirmAction('pass')} className="w-full bg-gray-600 text-white py-2 rounded">確認 (過)</button>
                         </>
                       ) : (
                         <div className="flex gap-2">
                           <button onClick={()=>confirmAction('check')} disabled={!selectedTarget} className="flex-1 bg-blue-600 text-white py-2 rounded disabled:opacity-50">確認查驗</button>
                           <button onClick={()=>confirmAction('pass')} className="flex-1 bg-gray-600 text-white py-2 rounded">不驗 (過)</button>
                         </div>
                       )}
                    </div>
                  )}

                  {/* Speaking Action */}
                  {room.subPhase === 'speaking' && (
                    <button onClick={() => proceedToNextPhase()} className="w-full bg-green-600 text-white py-2 rounded font-bold">結束發言 (過)</button>
                  )}

                  {/* Discussing / Voting Action (含棄票按鈕) */}
                  {isVotingPhase && (
                    <div className="space-y-2 text-sm">
                      <p className="text-center font-bold mb-2">請點擊玩家頭像投票，或選擇棄票</p>
                      <button 
                        onClick={() => handlePlayerClick('skip')} 
                        className={`w-full py-2 rounded font-bold transition-all ${room.votes?.[user.uid] === 'skip' ? 'bg-amber-600 text-white shadow-lg ring-2 ring-amber-300' : 'bg-gray-600 text-gray-200 hover:bg-gray-500'}`}
                      >
                        {room.votes?.[user.uid] === 'skip' ? '✔️ 已選擇：棄票' : '我要棄票'}
                      </button>
                      <div className="flex justify-center mt-2">
                         <span className="text-xs opacity-80 text-amber-900 font-bold">目前棄票數: {Object.values(room.votes || {}).filter(v => v === 'skip').length}</span>
                      </div>
                    </div>
                  )}

                  {/* Hunter Action */}
                  {room.status === 'hunter_shoot' && (
                    <div className="flex gap-2">
                      <button onClick={()=>confirmAction('shoot')} disabled={!selectedTarget} className="flex-1 bg-orange-600 text-white py-2 rounded disabled:opacity-50">開槍帶走</button>
                      <button onClick={()=>confirmAction('pass')} className="flex-1 bg-gray-600 text-white py-2 rounded">不開槍 (過)</button>
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
                
                // 狼人共享目標 UI 判斷
                const isFinalWolfTarget = room.status === 'night' && me?.role === '狼人' && room.nightActions?.wolfTarget === p.id;
                const isSharedWolfTarget = room.status === 'night' && room.subPhase === 'wolf' && me?.role === '狼人' && room.nightActions?.sharedWolfTarget === p.id;
                const wolfTargetUI = isFinalWolfTarget || isSharedWolfTarget;
                
                const isDayTargeted = room.votes?.[user.uid] === p.id;
                const isSelected = selectedTarget === p.id;
                
                let borderClass = 'border-transparent';
                if (isSpeaking) borderClass = 'border-green-500 bg-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.5)]';
                else if (isSelected) borderClass = 'border-blue-500 bg-blue-500/30'; 
                else if (wolfTargetUI) borderClass = 'border-red-500 bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.5)]';
                else if (isDayTargeted) borderClass = 'border-amber-500 bg-amber-500/20';

                // 互動權限檢查
                const canInteract = (me?.isAlive || isHunterShooting) && p.isAlive && (
                  (room.status === 'day' && room.subPhase === 'discussing') || 
                  (myTurn && ['guard', 'witch', 'seer', 'wolf'].includes(room.subPhase)) ||
                  isHunterShooting
                );

                return (
                  <div 
                    key={p.id} onClick={() => canInteract && handlePlayerClick(p.id)}
                    className={`relative flex items-center p-2 rounded-lg border-2 transition-all ${!p.isAlive ? 'opacity-40 grayscale border-transparent' : canInteract ? `${borderClass} hover:border-gray-400 cursor-pointer` : borderClass}`}
                  >
                    {isSpeaking && <Mic className="absolute -top-2 -right-2 text-green-500 animate-bounce bg-white rounded-full p-0.5" size={20} />}
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

          {/* Host Controls (Fallback/Force Tools) */}
          {isHost && (
            <div className={`rounded-xl p-3 shadow-sm border-2 border-dashed ${isNight ? 'bg-slate-900 border-slate-700' : 'bg-amber-100/50 border-amber-300'}`}>
              <h3 className="font-bold text-xs mb-2 opacity-60 flex items-center"><Play size={12} className="mr-1"/> 主持人工具</h3>
              {room.status === 'waiting' ? (
                <button onClick={startGame} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-bold transition">開始遊戲</button>
              ) : (
                <button onClick={hostForceNext} className="w-full bg-gray-600 text-white py-1 rounded text-sm transition">
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
                <span className={`px-4 py-1 rounded-full text-xs font-bold shadow-sm ${log.type === 'sys' ? (isNight ? 'bg-purple-900/80 text-purple-200' : 'bg-amber-500/30 text-amber-900') : 'bg-gray-500/20 text-gray-400'}`}>
                  {log.message}
                </span>
              </div>
            ))}
            {room.chat.map(msg => {
              if (msg.channel === 'wolf' && (!me || (me.role !== '狼人' && me.id !== msg.senderId))) return null;
              if (msg.channel === 'ghost' && me?.isAlive) return null;
              const isMe = msg.senderId === user.uid;
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${msg.channel === 'wolf' ? 'bg-red-900 text-red-100 border border-red-700' : msg.channel === 'ghost' ? 'bg-gray-700 text-gray-300 border border-gray-600' : isMe ? (isNight ? 'bg-purple-700 text-white' : 'bg-[#8b5a2b] text-white') : (isNight ? 'bg-slate-700 text-gray-200' : 'bg-[#f4e4bc] text-[#3e2723]')}`}>
                    {!isMe && <p className="text-[10px] opacity-70 mb-1 font-bold">{msg.senderName} {msg.channel==='wolf' && '(狼人)'}</p>}
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
                placeholder={!me?.isAlive ? "在靈魂頻道發言..." : room.status === 'night' ? (me?.role === '狼人' && room.subPhase === 'wolf' ? "與狼伴密謀..." : "黑夜降臨，請保持安靜...") : room.subPhase === 'speaking' ? (room.currentSpeaker === me.id ? "現在是你的發言時間！" : "請聽別人發言...") : "自由討論時間..."}
                disabled={me?.isAlive && ((room.status === 'night' && (me?.role !== '狼人' || room.subPhase !== 'wolf')) || (room.status === 'day' && room.subPhase === 'speaking' && room.currentSpeaker !== me?.id))}
                className={`flex-grow px-4 py-2 rounded-full focus:outline-none focus:ring-2 disabled:opacity-50 ${isNight ? 'bg-slate-800 border-slate-700 text-white focus:ring-purple-500 placeholder-slate-500' : 'bg-white border-[#dcd0b8] focus:ring-[#8b5a2b]'} border`}
              />
              <button type="submit" disabled={me?.isAlive && ((room.status === 'night' && (me?.role !== '狼人' || room.subPhase !== 'wolf')) || (room.status === 'day' && room.subPhase === 'speaking' && room.currentSpeaker !== me?.id))}
                className={`p-2 rounded-full flex items-center justify-center transition disabled:opacity-50 ${isNight ? 'bg-purple-600 hover:bg-purple-700 text-white disabled:bg-slate-700' : 'bg-[#8b5a2b] hover:bg-[#6c4622] text-white disabled:bg-gray-300'}`}
              ><Send size={20} /></button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}