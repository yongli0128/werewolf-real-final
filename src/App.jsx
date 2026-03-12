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
  LogOut, Vote
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
const app = initializeApp(firebaseConfig);
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

const getRoleConfig = (playerCount) => {
  // 基礎配置 (可依據人數動態調整，這裡提供一個簡單的動態生成範例)
  const roles = ['狼人', '預言家', '女巫'];
  if (playerCount >= 4) roles.push('村民');
  if (playerCount >= 5) roles.push('村民');
  if (playerCount >= 6) roles.push('狼人');
  if (playerCount >= 7) roles.push('獵人');
  if (playerCount >= 8) roles.push('村民');
  
  // 補足剩下的人數為村民
  while (roles.length < playerCount) {
    roles.push('村民');
  }
  return shuffleArray(roles.slice(0, playerCount));
};

const ROLES_INFO = {
  '狼人': { desc: '夜間可與同伴討論並殺害一名玩家。', color: 'text-red-500', icon: Skull },
  '預言家': { desc: '夜間可查驗一名玩家的真實身分。', color: 'text-blue-500', icon: Eye },
  '女巫': { desc: '擁有一瓶解藥與一瓶毒藥。', color: 'text-purple-500', icon: Shield },
  '獵人': { desc: '死後可以開槍帶走一名玩家。', color: 'text-orange-500', icon: Vote },
  '村民': { desc: '沒有特殊技能，依靠推理找出狼人。', color: 'text-green-600', icon: Users },
  '未知': { desc: '等待分配...', color: 'text-gray-400', icon: Info }
};

// --- Main Application Component ---
export default function WerewolfApp() {
  const [user, setUser] = useState(null);
  const [playerName, setPlayerName] = useState(localStorage.getItem('ww_name') || '');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [room, setRoom] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [isCardFlipped, setIsCardFlipped] = useState(false);
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
        setRoom(snapshot.data());
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
      status: 'waiting', // waiting, night, day, voting, ended
      players: [{ id: user.uid, name: playerName, role: '未知', isAlive: true, avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}` }],
      chat: [],
      logs: [{ type: 'system', message: `房間 ${code} 建立成功`, time: Date.now() }],
      votes: {},
      nightActions: {}
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
        setRoom(roomData); // 已經在房間內
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

  const startGame = async () => {
    if (room.players.length < 4) return alert('最少需要 4 名玩家才能開始遊戲');
    
    const assignedRoles = getRoleConfig(room.players.length);
    const updatedPlayers = room.players.map((p, index) => ({
      ...p,
      role: assignedRoles[index],
      isAlive: true
    }));

    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id), {
      status: 'night',
      players: updatedPlayers,
      votes: {},
      nightActions: {},
      logs: arrayUnion({ type: 'system', message: '遊戲開始！天黑請閉眼...', time: Date.now() })
    });
    setIsCardFlipped(false);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    let channel = 'general';
    const me = room.players.find(p => p.id === user.uid);
    
    // 權限過濾機制
    if (!me.isAlive) channel = 'ghost'; // 靈魂頻道
    else if (room.status === 'night' && me.role === '狼人') channel = 'wolf'; // 狼人私密頻道
    else if (room.status === 'night') return alert('黑夜期間只有狼人可以發言！');

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

  const handleVote = async (targetId) => {
    if (room.status !== 'voting' && room.status !== 'night') return;
    const me = room.players.find(p => p.id === user.uid);
    if (!me || !me.isAlive) return;

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id);
    
    if (room.status === 'voting') {
      // 白天投票
      await updateDoc(roomRef, { [`votes.${user.uid}`]: targetId });
    } else if (room.status === 'night' && me.role === '狼人') {
      // 狼人夜間殺人 (簡化：最後一個投票的狼人決定)
      await updateDoc(roomRef, { 'nightActions.wolfTarget': targetId });
    }
  };

  // --- Host Controls (Game Loop) ---
  const advancePhase = async () => {
    if (user.uid !== room.hostId) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'werewolf_rooms', room.id);
    
    if (room.status === 'night') {
      // 結算黑夜 -> 進入白天
      const deadTarget = room.nightActions?.wolfTarget;
      let updatedPlayers = [...room.players];
      let nightLog = '昨晚是平安夜。';
      
      if (deadTarget) {
        updatedPlayers = updatedPlayers.map(p => p.id === deadTarget ? { ...p, isAlive: false } : p);
        const deadPlayer = room.players.find(p => p.id === deadTarget);
        nightLog = `昨晚，${deadPlayer?.name} 慘遭殺害。`;
      }

      await updateDoc(roomRef, {
        status: 'day',
        players: updatedPlayers,
        votes: {}, // 清空投票
        logs: arrayUnion({ type: 'system', message: nightLog, time: Date.now() })
      });

    } else if (room.status === 'day') {
      // 白天 -> 投票
      await updateDoc(roomRef, {
        status: 'voting',
        logs: arrayUnion({ type: 'system', message: '進入投票階段，請點擊頭像進行投票。', time: Date.now() })
      });

    } else if (room.status === 'voting') {
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
        players: updatedPlayers,
        nightActions: {},
        votes: {},
        logs: arrayUnion({ type: 'system', message: voteLog, time: Date.now() }),
        chat: arrayUnion({ id: Date.now().toString(), senderId: 'sys', senderName: '系統', text: '天黑請閉眼...', channel: 'general', time: Date.now() })
      });
    }
  };

  // --- Render Helpers ---
  if (!user) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-sans">載入中...</div>;
  }

  const isNight = room?.status === 'night';
  const themeClasses = isNight 
    ? "bg-slate-900 text-purple-200" 
    : "bg-[#fdf6e3] text-[#3e2723]"; // 羊皮紙風格

  const me = room?.players.find(p => p.id === user.uid);
  const isHost = room?.hostId === user.uid;
  const RoleIcon = me ? ROLES_INFO[me.role]?.icon || Info : Info;

  // --- Views ---
  // 1. Home View
  if (!room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-gray-100 p-4 font-sans">
        <div className="w-full max-w-md bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700">
          <div className="text-center mb-8">
            <Moon className="w-16 h-16 mx-auto text-purple-500 mb-4 animate-pulse" />
            <h1 className="text-3xl font-bold tracking-wider">血月狼人殺</h1>
            <p className="text-gray-400 mt-2">文字推理生存遊戲</p>
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
      {/* --- Style for 3D Flip Card --- */}
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
            <h2 className="font-bold text-lg leading-tight">房間代碼: <span className="tracking-widest">{room.id}</span></h2>
            <p className="text-xs opacity-70">
              狀態: {
                room.status === 'waiting' ? '等待玩家...' :
                room.status === 'night' ? '🌙 黑夜降臨' :
                room.status === 'day' ? '☀️ 自由討論' : '⚖️ 投票階段'
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
          
          {/* Role Card (Only shown if game started) */}
          {room.status !== 'waiting' && (
            <div className="perspective-1000 h-48 cursor-pointer" onClick={() => setIsCardFlipped(!isCardFlipped)}>
              <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${isCardFlipped ? 'rotate-y-180' : ''}`}>
                {/* Front of Card (Logo) */}
                <div className={`absolute w-full h-full backface-hidden rounded-xl shadow-xl flex flex-col items-center justify-center border-2 ${isNight ? 'bg-slate-800 border-purple-900' : 'bg-[#eaddc4] border-[#cbb58c]'}`}>
                  <Moon className={`w-12 h-12 mb-2 ${isNight ? 'text-purple-500' : 'text-gray-600'}`} />
                  <p className="font-bold tracking-wider">點擊翻開身分卡</p>
                </div>
                {/* Back of Card (Role) */}
                <div className={`absolute w-full h-full backface-hidden rotate-y-180 rounded-xl shadow-xl p-6 border-2 flex flex-col items-center justify-center text-center ${isNight ? 'bg-slate-900 border-purple-500' : 'bg-white border-[#8b5a2b]'}`}>
                  <RoleIcon className={`w-12 h-12 mb-2 ${ROLES_INFO[me?.role]?.color}`} />
                  <h3 className="text-2xl font-bold mb-1">{me?.role}</h3>
                  <p className="text-sm opacity-80">{ROLES_INFO[me?.role]?.desc}</p>
                </div>
              </div>
            </div>
          )}

          {/* Player List / Voting Panel */}
          <div className={`rounded-xl p-4 shadow-lg ${isNight ? 'bg-slate-800/50' : 'bg-white/50'}`}>
            <h3 className="font-bold mb-4 flex items-center"><Users size={18} className="mr-2"/> 存活玩家 ({room.players.filter(p=>p.isAlive).length}/{room.players.length})</h3>
            <div className="grid grid-cols-2 gap-3">
              {room.players.map(p => {
                const isTargeted = room.votes?.[user.uid] === p.id || (isNight && me?.role === '狼人' && room.nightActions?.wolfTarget === p.id);
                const canInteract = me?.isAlive && p.isAlive && (room.status === 'voting' || (room.status === 'night' && me?.role === '狼人'));

                return (
                  <div 
                    key={p.id}
                    onClick={() => canInteract && handleVote(p.id)}
                    className={`flex items-center p-2 rounded-lg border-2 transition-all ${
                      !p.isAlive ? 'opacity-40 grayscale border-transparent' : 
                      isTargeted ? 'border-red-500 bg-red-500/20' : 
                      canInteract ? 'border-transparent hover:border-gray-400 cursor-pointer' : 'border-transparent'
                    }`}
                  >
                    <img src={p.avatar} alt="avatar" className="w-10 h-10 rounded-full mr-2 bg-black/10" />
                    <div className="truncate">
                      <p className={`font-semibold text-sm ${!p.isAlive && 'line-through'}`}>{p.name}</p>
                      {/* Show votes received during voting phase */}
                      {room.status === 'voting' && (
                        <div className="flex gap-1 mt-1">
                           {Object.values(room.votes || {}).filter(v => v === p.id).map((_, i) => (
                             <div key={i} className="w-2 h-2 rounded-full bg-red-500"></div>
                           ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Host Controls */}
          {isHost && (
            <div className={`rounded-xl p-4 shadow-lg border-2 border-dashed ${isNight ? 'bg-slate-900 border-purple-700' : 'bg-amber-100/50 border-amber-500'}`}>
              <h3 className="font-bold text-sm mb-3 opacity-80 flex items-center"><Play size={16} className="mr-1"/> 主持人控制面板</h3>
              {room.status === 'waiting' ? (
                <button onClick={startGame} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-bold transition">
                  開始分配職業並進入黑夜
                </button>
              ) : (
                <button onClick={advancePhase} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-bold transition">
                  推進遊戲階段 ({
                    room.status === 'night' ? '結算黑夜 -> 白天' :
                    room.status === 'day' ? '進入投票階段' : '結算投票 -> 黑夜'
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
            {/* System Logs */}
            {room.logs.map((log, i) => (
              <div key={`log-${i}`} className="flex justify-center my-2 animate-[pulse_1s_ease-in-out]">
                <span className={`px-4 py-1 rounded-full text-xs font-bold shadow-sm ${
                  isNight ? 'bg-purple-900/60 text-purple-200' : 'bg-amber-500/20 text-amber-800'
                }`}>
                  {log.message}
                </span>
              </div>
            ))}

            {/* Chat Messages */}
            {room.chat.map(msg => {
              // Permission filtering for rendering
              if (msg.channel === 'wolf' && (!me || (me.role !== '狼人' && me.id !== msg.senderId))) return null;
              if (msg.channel === 'ghost' && me?.isAlive) return null; // Only ghosts see ghost chat

              const isMe = msg.senderId === user.uid;
              const isSys = msg.senderId === 'sys';
              
              if (isSys) return null; // Handled in logs mostly, but just in case.

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
                placeholder={
                  !me?.isAlive ? "在靈魂頻道發言..." :
                  room.status === 'night' && me?.role === '狼人' ? "與狼伴密謀..." :
                  room.status === 'night' ? "黑夜期間禁止發言" : "輸入訊息參與討論..."
                }
                disabled={room.status === 'night' && me?.role !== '狼人' && me?.isAlive}
                className={`flex-grow px-4 py-2 rounded-full focus:outline-none focus:ring-2 ${
                  isNight 
                    ? 'bg-slate-800 border-slate-700 text-white focus:ring-purple-500 placeholder-slate-500' 
                    : 'bg-white border-[#dcd0b8] focus:ring-[#8b5a2b]'
                } border`}
              />
              <button 
                type="submit" 
                disabled={room.status === 'night' && me?.role !== '狼人' && me?.isAlive}
                className={`p-2 rounded-full flex items-center justify-center transition ${
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