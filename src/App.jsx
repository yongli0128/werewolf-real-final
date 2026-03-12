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
  LogOut, Vote, Plus, Minus, Mic
} from 'lucide-react';

// --- Firebase Initialization ---
// 注意：這裡保留了預覽環境的寫法，請記得在你的 VS Code 裡替換成你的 firebaseConfig！
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
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
  '女巫': { desc: '擁有一瓶解藥與一瓶毒藥(簡化版暫為好人陣營)。', color: 'text-purple-500', icon: Shield },
  '獵人': { desc: '死後可以開槍帶走一名玩家。', color: 'text-orange-500', icon: Vote },
  '村民': { desc: '沒有特殊技能，依靠推理找出狼人。', color: 'text-green-600', icon: Users },
  '未知': { desc: '等待分配...', color: 'text-gray-400', icon: Info }
};

const AVAILABLE_ROLES = ['狼人', '預言家', '女巫', '獵人', '村民'];

// --- Main Application Component ---
export default function WerewolfApp() {
  const [user, setUser] = useState(null);
  const [playerName, setPlayerName] = useState(localStorage.getItem('ww_name') || '');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [room, setRoom] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  
  // Local States for interactions
  const [seerResult, setSeerResult] = useState(null);
  const chatBottomRef = useRef(null);

  // 1. Auth & Firebase Setup
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

  // 2. Room Listener
  useEffect(() => {
    if (!user || !room?.id) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setRoom(data);
        // 清除預言家本地結果如果天亮了
        if (data.status !== 'night') setSeerResult(null);
      } else {
        setRoom(null);
        alert("房間已解散");
      }
    }, (error) => console.error("Snapshot error:", error));
    return () => unsubscribe();
  }, [user, room?.id]);

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room?.chat, room?.logs]);

  // --- Actions ---
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
      dayPhase: '', // speaking, discussing
      speakerQueue: [],
      currentSpeaker: null,
      roleConfig: { '狼人': 1, '預言家': 1, '女巫': 0, '獵人': 0, '村民': 2 }, // 預設4人配置
      players: [{ id: user.uid, name: playerName, role: '未知', isAlive: true, avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}` }],
      chat: [],
      logs: [{ type: 'system', message: `房間 ${code} 建立成功`, time: Date.now() }],
      votes: {},
      nightActions: { wolfVotes: {}, seerChecked: false }
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
      if (roomData.players.find(p => p.id === user.uid)) {
        setRoom(roomData);
        return;
      }
      await updateDoc(roomRef, {
        players: arrayUnion({ id: user.uid, name: playerName, role: '未知', isAlive: true, avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}` }),
        logs: arrayUnion({ type: 'system', message: `${playerName} 加入了房間`, time: Date.now() })
      });
      setRoom(roomData);
    } else {
      alert("找不到該房間");
    }
  };

  const leaveRoom = () => {
    setRoom(null);
    setIsCardFlipped(false);
  };

  // --- Host Customization ---
  const updateRoleConfig = async (role, delta) => {
    if (room.hostId !== user.uid || room.status !== 'waiting') return;
    const currentCount = room.roleConfig[role] || 0;
    const newCount = Math.max(0, currentCount + delta);
    
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id), {
      [`roleConfig.${role}`]: newCount
    });
  };

  // --- Game Loop & Phases ---
  const startGame = async () => {
    // 檢查職業總數是否等於人數
    const totalRoles = Object.values(room.roleConfig).reduce((a, b) => a + b, 0);
    if (totalRoles !== room.players.length) {
      return alert(`設定的職業總數 (${totalRoles}) 必須等於玩家人數 (${room.players.length})`);
    }
    
    // 生成職業池並洗牌
    let rolesPool = [];
    Object.entries(room.roleConfig).forEach(([role, count]) => {
      for(let i=0; i<count; i++) rolesPool.push(role);
    });
    rolesPool = shuffleArray(rolesPool);

    const updatedPlayers = room.players.map((p, index) => ({
      ...p,
      role: rolesPool[index],
      isAlive: true
    }));

    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id), {
      status: 'night',
      players: updatedPlayers,
      votes: {},
      nightActions: { wolfVotes: {}, seerChecked: false },
      logs: arrayUnion({ type: 'system', message: '遊戲開始！天黑請閉眼...', time: Date.now() })
    });
    setIsCardFlipped(false);
  };

  const advancePhase = async () => {
    if (user.uid !== room.hostId) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id);
    
    if (room.status === 'night') {
      // 結算黑夜 -> 白天 (產生發言順序)
      const wolfVotes = room.nightActions?.wolfVotes || {};
      const voteCounts = {};
      Object.values(wolfVotes).forEach(target => { voteCounts[target] = (voteCounts[target] || 0) + 1; });
      
      let deadTarget = null;
      let maxV = 0;
      for (const [target, count] of Object.entries(voteCounts)) {
        if (count > maxV) { maxV = count; deadTarget = target; }
      }

      let updatedPlayers = [...room.players];
      let nightLog = '昨晚是平安夜。';
      
      if (deadTarget) {
        updatedPlayers = updatedPlayers.map(p => p.id === deadTarget ? { ...p, isAlive: false } : p);
        const deadPlayer = room.players.find(p => p.id === deadTarget);
        nightLog = `昨晚，${deadPlayer?.name} 慘遭殺害。`;
      }

      // 排定存活玩家發言順序
      const aliveIds = updatedPlayers.filter(p => p.isAlive).map(p => p.id);
      
      await updateDoc(roomRef, {
        status: 'day',
        dayPhase: 'speaking',
        speakerQueue: aliveIds,
        currentSpeaker: aliveIds[0] || null,
        players: updatedPlayers,
        votes: {}, 
        logs: arrayUnion({ type: 'system', message: nightLog, time: Date.now() })
      });

    } else if (room.status === 'day' && room.dayPhase === 'speaking') {
      // 發言階段 -> 下一位 或 進入自由討論
      const nextQueue = room.speakerQueue.slice(1);
      if (nextQueue.length > 0) {
        await updateDoc(roomRef, {
          speakerQueue: nextQueue,
          currentSpeaker: nextQueue[0]
        });
      } else {
        await updateDoc(roomRef, {
          dayPhase: 'discussing',
          currentSpeaker: null,
          logs: arrayUnion({ type: 'system', message: '所有玩家發言完畢，進入自由討論與投票階段。', time: Date.now() })
        });
      }
    } else if (room.status === 'day' && room.dayPhase === 'discussing') {
      // 結算投票 -> 黑夜
      const voteCounts = {};
      Object.values(room.votes || {}).forEach(target => {
        voteCounts[target] = (voteCounts[target] || 0) + 1;
      });
      
      let maxVotes = 0;
      let exiledId = null;
      for (const [target, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
          maxVotes = count;
          exiledId = target;
        } else if (count === maxVotes) {
          exiledId = null; // 平票
        }
      }

      let updatedPlayers = [...room.players];
      let voteLog = '投票結果平局，沒有人被放逐。';
      if (exiledId) {
        updatedPlayers = updatedPlayers.map(p => p.id === exiledId ? { ...p, isAlive: false } : p);
        const exiledPlayer = room.players.find(p => p.id === exiledId);
        voteLog = `投票結束，${exiledPlayer?.name} 被放逐了。`;
      }

      await updateDoc(roomRef, {
        status: 'night',
        dayPhase: '',
        players: updatedPlayers,
        nightActions: { wolfVotes: {}, seerChecked: false },
        votes: {},
        logs: arrayUnion({ type: 'system', message: voteLog, time: Date.now() }),
        chat: arrayUnion({ id: Date.now().toString(), senderId: 'sys', senderName: '系統', text: '天黑請閉眼...', channel: 'general', time: Date.now() })
      });
    }
  };

  // --- Player Interactions ---
  const handlePlayerClick = async (targetId) => {
    const me = room.players.find(p => p.id === user.uid);
    if (!me || !me.isAlive) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id);
    
    // 黑夜行動
    if (room.status === 'night') {
      if (me.role === '狼人') {
        // 狼人投票
        await updateDoc(roomRef, { [`nightActions.wolfVotes.${user.uid}`]: targetId });
      } else if (me.role === '預言家') {
        // 預言家查驗 (每晚一次)
        if (room.nightActions?.seerChecked) return alert('今晚已經查驗過了！');
        const target = room.players.find(p => p.id === targetId);
        const isBad = target.role === '狼人';
        setSeerResult(`${target.name} 的身分是：${isBad ? '🐺 狼人' : '🧑‍🌾 好人'}`);
        await updateDoc(roomRef, { 'nightActions.seerChecked': true });
      }
    } 
    // 白天投票
    else if (room.status === 'day' && room.dayPhase === 'discussing') {
      await updateDoc(roomRef, { [`votes.${user.uid}`]: targetId });
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    let channel = 'general';
    const me = room.players.find(p => p.id === user.uid);
    
    // 權限過濾機制
    if (!me.isAlive) {
      channel = 'ghost'; 
    } else if (room.status === 'night') {
      if (me.role === '狼人') channel = 'wolf';
      else return alert('黑夜期間只有狼人可以發言！');
    } else if (room.status === 'day' && room.dayPhase === 'speaking') {
      if (room.currentSpeaker !== me.id) return alert('現在不是你的發言時間！');
    }

    const msg = {
      id: Date.now().toString(),
      senderId: user.uid,
      senderName: me.name,
      text: chatInput.trim(),
      channel,
      time: Date.now()
    };

    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id), {
      chat: arrayUnion(msg)
    });
    setChatInput('');
  };

  // --- Render Helpers ---
  if (!user) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-sans">載入中...</div>;
  }

  const isNight = room?.status === 'night';
  const themeClasses = isNight 
    ? "bg-slate-900 text-purple-200" 
    : "bg-[#fdf6e3] text-[#3e2723]";

  const me = room?.players.find(p => p.id === user.uid);
  const isHost = room?.hostId === user.uid;
  const RoleIcon = me ? ROLES_INFO[me.role]?.icon || Info : Info;

  const getChatPlaceholder = () => {
    if (!me?.isAlive) return "在靈魂頻道發言...";
    if (room.status === 'night') {
      return me?.role === '狼人' ? "與狼伴密謀..." : "黑夜降臨，請保持安靜...";
    }
    if (room.status === 'day' && room.dayPhase === 'speaking') {
      return room.currentSpeaker === me.id ? "輪到你發言了！" : "請聽別人發言...";
    }
    return "自由討論時間...";
  };

  const canChat = () => {
    if (!me?.isAlive) return true; // Ghosts can always chat
    if (room.status === 'night') return me?.role === '狼人';
    if (room.status === 'day' && room.dayPhase === 'speaking') return room.currentSpeaker === me.id;
    return true; // Day discussing
  };

  // --- Views ---
  // 1. Home View
  if (!room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-gray-100 p-4 font-sans">
        <div className="w-full max-w-md bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700">
          <div className="text-center mb-8">
            <Moon className="w-16 h-16 mx-auto text-purple-500 mb-4 animate-pulse" />
            <h1 className="text-3xl font-bold tracking-wider">血月狼人殺</h1>
            <p className="text-gray-400 mt-2 text-sm">進階機制版 (查驗/狼刀/輪流發言)</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">你的暱稱</label>
              <input 
                type="text" 
                value={playerName} 
                onChange={handleNameChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="輸入玩家名稱"
              />
            </div>
            
            <button 
              onClick={createRoom}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
            >
              建立新房間
            </button>
            
            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-gray-600"></div>
              <span className="flex-shrink-0 mx-4 text-gray-500 text-sm">或</span>
              <div className="flex-grow border-t border-gray-600"></div>
            </div>

            <div className="flex space-x-2">
              <input 
                type="text" 
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                className="flex-grow bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase"
                placeholder="輸入房間代碼"
                maxLength={4}
              />
              <button 
                onClick={joinRoom}
                className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-6 rounded-lg transition duration-200"
              >
                加入
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Lobby & Game View
  return (
    <div className={`min-h-screen transition-colors duration-1000 ease-in-out font-sans ${themeClasses} pb-20 md:pb-0`}>
      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>

      {/* Header */}
      <header className={`p-4 shadow-md flex justify-between items-center ${isNight ? 'bg-black/40' : 'bg-white/40'}`}>
        <div className="flex items-center space-x-3">
          {isNight ? <Moon className="text-purple-400" /> : <Sun className="text-orange-500" />}
          <div>
            <h2 className="font-bold text-lg leading-tight">房間: <span className="tracking-widest">{room.id}</span></h2>
            <p className="text-xs font-bold opacity-80 mt-1">
              狀態: {
                room.status === 'waiting' ? '等待玩家...' :
                room.status === 'night' ? '🌙 黑夜行動' :
                room.dayPhase === 'speaking' ? '🗣️ 輪流發言' : '⚖️ 自由討論/投票'
              }
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right hidden sm:block">
            <p className="font-bold">{me?.name}</p>
            <p className="text-xs opacity-70">{me?.isAlive ? '活著' : '已死亡 (靈魂)'}</p>
          </div>
          <button onClick={leaveRoom} className="p-2 rounded-full hover:bg-black/10 transition">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Player Status & Actions */}
        <div className="space-y-6 md:col-span-1">
          
          {/* Waiting Phase: Role Config Panel (Only Host can edit) */}
          {room.status === 'waiting' && (
            <div className="bg-white/50 rounded-xl p-4 shadow-lg border-2 border-amber-500">
              <h3 className="font-bold mb-3 flex items-center text-[#3e2723]"><Shield size={18} className="mr-2"/> 職業設定 (目前人數: {room.players.length})</h3>
              <div className="space-y-2">
                {AVAILABLE_ROLES.map(role => (
                  <div key={role} className="flex justify-between items-center bg-white/60 p-2 rounded">
                    <span className="font-semibold text-sm text-[#3e2723]">{role}</span>
                    <div className="flex items-center space-x-3">
                      {isHost && (
                        <button onClick={()=>updateRoleConfig(role, -1)} className="p-1 bg-red-100 text-red-600 rounded hover:bg-red-200"><Minus size={14}/></button>
                      )}
                      <span className="font-bold w-4 text-center text-[#3e2723]">{room.roleConfig?.[role] || 0}</span>
                      {isHost && (
                        <button onClick={()=>updateRoleConfig(role, 1)} className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200"><Plus size={14}/></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-center mt-3 font-bold text-amber-700">
                職業總數必須等於玩家人數才能開始
              </p>
            </div>
          )}

          {/* Role Card & Action Feedback */}
          {room.status !== 'waiting' && (
            <div className="space-y-4">
              <div className="perspective-1000 h-48 cursor-pointer" onClick={() => setIsCardFlipped(!isCardFlipped)}>
                <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${isCardFlipped ? 'rotate-y-180' : ''}`}>
                  <div className={`absolute w-full h-full backface-hidden rounded-xl shadow-xl flex flex-col items-center justify-center border-2 ${isNight ? 'bg-slate-800 border-purple-900' : 'bg-[#eaddc4] border-[#cbb58c]'}`}>
                    <Moon className={`w-12 h-12 mb-2 ${isNight ? 'text-purple-500' : 'text-gray-600'}`} />
                    <p className="font-bold tracking-wider">點擊翻開身分卡</p>
                  </div>
                  <div className={`absolute w-full h-full backface-hidden rotate-y-180 rounded-xl shadow-xl p-6 border-2 flex flex-col items-center justify-center text-center ${isNight ? 'bg-slate-900 border-purple-500' : 'bg-white border-[#8b5a2b]'}`}>
                    <RoleIcon className={`w-12 h-12 mb-2 ${ROLES_INFO[me?.role]?.color}`} />
                    <h3 className="text-2xl font-bold mb-1">{me?.role}</h3>
                    <p className="text-sm opacity-80">{ROLES_INFO[me?.role]?.desc}</p>
                  </div>
                </div>
              </div>

              {/* Seer Result Display */}
              {seerResult && (
                <div className="bg-blue-900/40 border border-blue-500 rounded-lg p-3 text-center text-blue-200 animate-pulse">
                  <p className="font-bold">{seerResult}</p>
                </div>
              )}
            </div>
          )}

          {/* Player List / Voting Panel */}
          <div className={`rounded-xl p-4 shadow-lg ${isNight ? 'bg-slate-800/50' : 'bg-white/50'}`}>
            <h3 className="font-bold mb-4 flex items-center">
              <Users size={18} className="mr-2"/> 存活玩家 ({room.players.filter(p=>p.isAlive).length}/{room.players.length})
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {room.players.map(p => {
                // Determine styling based on phase and actions
                const isSpeaking = room.status === 'day' && room.dayPhase === 'speaking' && room.currentSpeaker === p.id;
                
                // Show wolf votes to other wolves
                const myWolfVote = room.nightActions?.wolfVotes?.[user.uid] === p.id;
                const totalWolfVotes = Object.values(room.nightActions?.wolfVotes || {}).filter(v => v === p.id).length;
                
                const isDayTargeted = room.votes?.[user.uid] === p.id;
                
                let borderClass = 'border-transparent';
                if (isSpeaking) borderClass = 'border-green-500 bg-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.5)]';
                else if (myWolfVote) borderClass = 'border-red-500 bg-red-500/20';
                else if (isDayTargeted) borderClass = 'border-amber-500 bg-amber-500/20';

                const canInteract = me?.isAlive && p.isAlive && (
                  (room.status === 'day' && room.dayPhase === 'discussing') || 
                  (room.status === 'night' && me?.role === '狼人') ||
                  (room.status === 'night' && me?.role === '預言家' && !room.nightActions?.seerChecked)
                );

                return (
                  <div 
                    key={p.id}
                    onClick={() => canInteract && handlePlayerClick(p.id)}
                    className={`relative flex items-center p-2 rounded-lg border-2 transition-all ${
                      !p.isAlive ? 'opacity-40 grayscale border-transparent' : 
                      canInteract ? `${borderClass} hover:border-gray-400 cursor-pointer` : borderClass
                    }`}
                  >
                    {isSpeaking && <Mic className="absolute -top-2 -right-2 text-green-500 animate-bounce bg-white rounded-full p-0.5" size={20} />}
                    <img src={p.avatar} alt="avatar" className="w-10 h-10 rounded-full mr-2 bg-black/10" />
                    <div className="truncate w-full">
                      <p className={`font-semibold text-sm ${!p.isAlive && 'line-through'}`}>{p.name}</p>
                      
                      {/* Show votes */}
                      <div className="flex gap-1 mt-1">
                         {room.status === 'day' && room.dayPhase === 'discussing' && Object.values(room.votes || {}).filter(v => v === p.id).map((_, i) => (
                           <div key={`dv-${i}`} className="w-2 h-2 rounded-full bg-amber-500"></div>
                         ))}
                         {room.status === 'night' && me?.role === '狼人' && Array.from({length: totalWolfVotes}).map((_, i) => (
                           <div key={`wv-${i}`} className="w-2 h-2 rounded-full bg-red-500"></div>
                         ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Host Controls */}
          {isHost && (
            <div className={`rounded-xl p-4 shadow-lg border-2 border-dashed ${isNight ? 'bg-slate-900 border-purple-700' : 'bg-amber-100/50 border-amber-500'}`}>
              <h3 className="font-bold text-sm mb-3 opacity-80 flex items-center"><Play size={16} className="mr-1"/> 主持人控場</h3>
              {room.status === 'waiting' ? (
                <button onClick={startGame} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-bold transition">
                  開始遊戲 (分配身分)
                </button>
              ) : room.status === 'day' && room.dayPhase === 'speaking' ? (
                <button onClick={advancePhase} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-bold transition flex justify-center items-center">
                  換下一位發言 <Mic size={16} className="ml-2"/>
                </button>
              ) : (
                <button onClick={advancePhase} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-bold transition">
                  推進階段 ({
                    room.status === 'night' ? '天亮結算' : '結算投票 -> 黑夜'
                  })
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Chat & Logs */}
        <div className={`md:col-span-2 flex flex-col h-[60vh] md:h-[80vh] rounded-xl shadow-lg border ${isNight ? 'bg-slate-800 border-slate-700' : 'bg-white border-[#dcd0b8]'}`}>
          
          {/* Chat/Log Area */}
          <div className="flex-grow overflow-y-auto p-4 space-y-3">
            {room.logs.map((log, i) => (
              <div key={`log-${i}`} className="flex justify-center my-2 animate-[pulse_1s_ease-in-out]">
                <span className={`px-4 py-1 rounded-full text-xs font-bold shadow-sm ${
                  isNight ? 'bg-purple-900/60 text-purple-200' : 'bg-amber-500/20 text-amber-800'
                }`}>
                  {log.message}
                </span>
              </div>
            ))}

            {room.chat.map(msg => {
              if (msg.channel === 'wolf' && (!me || (me.role !== '狼人' && me.id !== msg.senderId))) return null;
              if (msg.channel === 'ghost' && me?.isAlive) return null;

              const isMe = msg.senderId === user.uid;
              const isSys = msg.senderId === 'sys';
              if (isSys) return null;

              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${
                    msg.channel === 'wolf' ? 'bg-red-900 text-red-100 border border-red-700' :
                    msg.channel === 'ghost' ? 'bg-gray-700 text-gray-300 border border-gray-600' :
                    isMe ? (isNight ? 'bg-purple-700 text-white' : 'bg-[#8b5a2b] text-white') : 
                    (isNight ? 'bg-slate-700 text-gray-200' : 'bg-[#f4e4bc] text-[#3e2723]')
                  }`}>
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
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={getChatPlaceholder()}
                disabled={!canChat()}
                className={`flex-grow px-4 py-2 rounded-full focus:outline-none focus:ring-2 disabled:opacity-50 ${
                  isNight 
                    ? 'bg-slate-800 border-slate-700 text-white focus:ring-purple-500 placeholder-slate-500' 
                    : 'bg-white border-[#dcd0b8] focus:ring-[#8b5a2b]'
                } border`}
              />
              <button 
                type="submit" 
                disabled={!canChat()}
                className={`p-2 rounded-full flex items-center justify-center transition disabled:opacity-50 ${
                  isNight 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white disabled:bg-slate-700' 
                    : 'bg-[#8b5a2b] hover:bg-[#6c4622] text-white disabled:bg-gray-300'
                }`}
              >
                <Send size={20} />
              </button>
            </form>
          </div>
        </div>

      </main>
    </div>
  );
}