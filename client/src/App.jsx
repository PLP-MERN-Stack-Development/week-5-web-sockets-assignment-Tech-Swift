import { useState, useRef, useEffect, useCallback } from 'react';
import './index.css';
import { useSocket } from './socket/socket';
import EmojiPicker from 'emoji-picker-react';
import inroomSound from './assets/sounds/inroom.wav';
import indmSound from './assets/sounds/indm.wav';

function App() {
  const [username, setUsername] = useState('');
  const [inputName, setInputName] = useState('');
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [privateRecipient, setPrivateRecipient] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [showPrivateModal, setShowPrivateModal] = useState(false);
  const [selectedPrivateUser, setSelectedPrivateUser] = useState(null);
  const [newRoomName, setNewRoomName] = useState('');
  const messageEndRef = useRef(null);
  const [showEmojiPickerFor, setShowEmojiPickerFor] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({}); // { roomName: count, private_userId: count }
  const inroomAudio = useRef(null);
  const indmAudio = useRef(null);
  const messagesContainerRef = useRef(null);
  const [paginatedMessages, setPaginatedMessages] = useState([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Connected');

  const {
    isConnected,
    messages,
    users,
    typingUsers,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    setTyping,
    socket,
    createRoom,
  } = useSocket(setRooms);

  // Fetch available rooms on login (when username is set)
  useEffect(() => {
    if (username) {
      console.log('Fetching rooms from http://localhost:5000/api/rooms after login...');
      fetch('http://localhost:5000/api/rooms')
        .then((res) => res.json())
        .then((data) => {
          console.log('Rooms fetched from backend:', data);
          setRooms(data);
        });
    }
  }, [username]);

  // Join selected room
  useEffect(() => {
    if (username && socket && currentRoom) {
      socket.emit('join_room', currentRoom);
    }
  }, [username, currentRoom, socket]);

  // Handle room change
  const handleRoomChange = (room) => {
    if (room === currentRoom) return;
    setCurrentRoom(room);
    setPrivateRecipient(null);
  };

  // Listen for joined_room event to update currentRoom
  useEffect(() => {
    if (!socket) return;
    const onJoinedRoom = (room) => setCurrentRoom(room);
    socket.on('joined_room', onJoinedRoom);
    return () => socket.off('joined_room', onJoinedRoom);
  }, [socket]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    // Emit read receipts for all unread messages in the current room
    if (username && messages && users && currentRoom) {
      const roomUsernames = users.map(u => u.username);
      messages.forEach((msg) => {
        if (msg.readBy && !msg.readBy.includes(username)) {
          socket.emit('message_read', { messageId: msg.id, username, room: currentRoom });
        }
      });
    }
  }, [messages, currentRoom, username, users]);

  // Typing indicator logic
  useEffect(() => {
    if (!username) return;
    if (isTyping) setTyping(true);
    const timeout = setTimeout(() => {
      setTyping(false);
      setTyping(false);
    }, 1500);
    return () => clearTimeout(timeout);
  }, [isTyping, username, setTyping]);

  // Request notification permission after login
  useEffect(() => {
    if (username && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [username]);

  // Play sound, update unread counts, and show browser notification on new message
  useEffect(() => {
    if (!username || !messages.length) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.sender === username) return;
    // Private message
    if (lastMsg.isPrivate) {
      if (!(showPrivateModal && selectedPrivateUser && (lastMsg.sender === selectedPrivateUser.username || lastMsg.senderId === selectedPrivateUser.id))) {
        setUnreadCounts(prev => ({ ...prev, ['private_' + lastMsg.senderId]: (prev['private_' + lastMsg.senderId] || 0) + 1 }));
        if (indmAudio.current) indmAudio.current.play();
        // Show browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`New private message from ${lastMsg.sender}`, {
            body: typeof lastMsg.message === 'string' ? lastMsg.message : (lastMsg.message && lastMsg.message.message) || '[File]'
          });
        }
      }
    } else {
      if (lastMsg.room !== currentRoom) {
        setUnreadCounts(prev => ({ ...prev, [lastMsg.room]: (prev[lastMsg.room] || 0) + 1 }));
        if (inroomAudio.current) inroomAudio.current.play();
        // Show browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`New message in ${lastMsg.room} from ${lastMsg.sender}`, {
            body: typeof lastMsg.message === 'string' ? lastMsg.message : (lastMsg.message && lastMsg.message.message) || '[File]'
          });
        }
      }
    }
  }, [messages, username, currentRoom, showPrivateModal, selectedPrivateUser]);

  // Reset unread count when viewing a room
  useEffect(() => {
    if (currentRoom) {
      setUnreadCounts(prev => ({ ...prev, [currentRoom]: 0 }));
    }
  }, [currentRoom]);
  // Reset unread count when opening private chat
  useEffect(() => {
    if (showPrivateModal && selectedPrivateUser) {
      setUnreadCounts(prev => ({ ...prev, ['private_' + selectedPrivateUser.id]: 0 }));
    }
  }, [showPrivateModal, selectedPrivateUser]);

  // Handle login
  const handleLogin = (e) => {
    e.preventDefault();
    if (inputName.trim()) {
      setUsername(inputName.trim());
      connect(inputName.trim());
    }
  };

  // Handle message send
  const handleSend = (e) => {
    e.preventDefault();
    if (message.trim()) {
      if (privateRecipient) {
        sendPrivateMessage(privateRecipient.id, message.trim());
      } else {
        sendMessage({ message: message.trim(), room: currentRoom });
      }
      setMessage('');
      setTyping(false);
    }
  };

  // Handle typing
  const handleTyping = (e) => {
    setMessage(e.target.value);
    setIsTyping(true);
  };

  // Cancel private mode
  const cancelPrivate = () => setPrivateRecipient(null);

  // File upload handler
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    console.log('File selected:', file.name, file.type, file.size);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      console.log('Uploading file to backend...');
      const res = await fetch('http://localhost:5000/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json();
      console.log('Upload response:', data);
      
      if (data.url) {
        // Send file message
        const fileMsg = {
          file: {
            url: data.url,
            name: data.name,
            type: data.type,
          },
          room: currentRoom,
        };
        
        console.log('Sending file message:', fileMsg);
        
        if (privateRecipient) {
          sendPrivateMessage(privateRecipient.id, fileMsg);
        } else {
          sendMessage(fileMsg);
        }
      }
    } catch (err) {
      console.error('File upload error:', err);
      alert(`File upload failed: ${err.message}`);
    }
    
    e.target.value = '';
  };

  // Handle private chat selection
  const handlePrivateChat = (user) => {
    setSelectedPrivateUser(user);
    setShowPrivateModal(true);
  };

  // Close private chat modal
  const closePrivateModal = () => {
    setShowPrivateModal(false);
    setSelectedPrivateUser(null);
  };

  // Handle new room creation (REST API and socket)
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    const name = newRoomName.trim();
    if (!name) return;
    // Try REST API first
    try {
      const res = await fetch('http://localhost:5000/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setNewRoomName('');
        return;
      }
    } catch (err) {}
    // Fallback to socket event
    createRoom(name);
    setNewRoomName('');
  };

  // Filter messages for main room (exclude private messages)
  const filteredMessages = paginatedMessages;
  // Filter messages for private chat
  const privateMessages = messages.filter(
    (msg) =>
      msg.isPrivate &&
      ((msg.sender === username && msg.recipientId === selectedPrivateUser?.id) ||
       (msg.sender === selectedPrivateUser?.username && msg.recipientId === socket.id))
  );
  const filteredUsers = users;

  // Update paginatedMessages for read receipts and reactions
  useEffect(() => {
    if (!messages.length) return;
    // No need to update paginatedMessages, we use messages directly now.
  }, [messages]);

  // Fetch initial messages when joining a room
  useEffect(() => {
    if (currentRoom) {
      setPaginatedMessages([]);
      setHasMoreMessages(true);
      fetchInitialMessages();
    }
    // eslint-disable-next-line
  }, [currentRoom]);

  const fetchInitialMessages = async () => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`http://localhost:5000/api/messages?room=${encodeURIComponent(currentRoom || 'General')}&limit=20`);
      const data = await res.json();
      setPaginatedMessages(data); // keep order: oldest to newest
      setHasMoreMessages(data.length === 20);
    } catch (err) {
      setHasMoreMessages(false);
    }
    setIsLoadingMessages(false);
  };

  // Fetch older messages (pagination)
  const fetchOlderMessages = async () => {
    if (!paginatedMessages.length || isLoadingMessages || !hasMoreMessages) return;
    setIsLoadingMessages(true);
    const oldest = paginatedMessages[0];
    try {
      const res = await fetch(`http://localhost:5000/api/messages?room=${encodeURIComponent(currentRoom || 'General')}&limit=20&before=${encodeURIComponent(oldest.timestamp)}`);
      const data = await res.json();
      // Deduplicate by id
      setPaginatedMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newMessages = data.filter(m => !existingIds.has(m.id));
        return [...newMessages, ...prev]; // prepend older messages
      });
      setHasMoreMessages(data.length === 20);
    } catch (err) {
      setHasMoreMessages(false);
    }
    setIsLoadingMessages(false);
  };

  // Scroll handler for loading older messages
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    if (messagesContainerRef.current.scrollTop === 0 && hasMoreMessages && !isLoadingMessages) {
      fetchOlderMessages();
    }
  };

  // Attach scroll event
  useEffect(() => {
    const ref = messagesContainerRef.current;
    if (ref) {
      ref.addEventListener('scroll', handleScroll);
      return () => ref.removeEventListener('scroll', handleScroll);
    }
  }, [paginatedMessages, hasMoreMessages, isLoadingMessages]);

  // When new real-time messages arrive, append to paginatedMessages if in current room
  useEffect(() => {
    if (!messages.length) return;
    const lastMsg = messages[messages.length - 1];
    if ((lastMsg.room || 'General') === currentRoom && !lastMsg.isPrivate) {
      setPaginatedMessages(prev => {
        if (prev.some(m => m.id === lastMsg.id)) return prev;
        return [...prev, lastMsg];
      });
    }
  }, [messages, currentRoom]);

  // Handle disconnect and reset UI
  const handleDisconnect = () => {
    disconnect();
    setMessage('');
    setPrivateRecipient(null);
    setShowPrivateModal(false);
    setSelectedPrivateUser(null);
    setCurrentRoom(null);
    // Optionally clear rooms, users, etc. if you want a full reset
  };

  const handleAddReaction = (messageId, emoji) => {
    socket.emit('add_reaction', { messageId, emoji, username });
    setShowEmojiPickerFor(null);
  };

  // Listen for socket connection events and update connectionStatus
  useEffect(() => {
    if (!socket) return;
    const handleConnect = () => setConnectionStatus('Connected');
    const handleDisconnect = () => setConnectionStatus('Disconnected');
    const handleReconnectAttempt = () => setConnectionStatus('Reconnecting...');
    const handleConnectError = () => setConnectionStatus('Connection Error');
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('reconnect_attempt', handleReconnectAttempt);
    socket.on('connect_error', handleConnectError);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('reconnect_attempt', handleReconnectAttempt);
      socket.off('connect_error', handleConnectError);
    };
  }, [socket]);

  if (!username) {
  return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-300">
        <div className="login-container bg-white border border-gray-200 rounded-lg shadow-lg p-8 w-full max-w-sm flex flex-col items-center">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Enter your username to join the chat</h2>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
            <input
              type="text"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="Username"
              required
              className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-400 bg-gray-50 text-gray-800"
            />
            <button
              type="submit"
              className="bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 rounded transition-colors shadow"
            >
              Join
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Connection status banner */}
      {connectionStatus !== 'Connected' && (
        <div className={`w-full text-center py-2 text-white ${connectionStatus === 'Reconnecting...' ? 'bg-yellow-500' : 'bg-red-600'}`}>
          {connectionStatus}
        </div>
      )}
      <div className="chat-container min-h-screen flex bg-gradient-to-br from-gray-100 to-gray-300">
        <div className="sidebar w-64 bg-gray-800 text-gray-100 flex flex-col p-4 border-r border-gray-300">
          {/* Rooms section */}
          <h3 className="text-lg font-bold mb-4 text-teal-200">Rooms</h3>
          <form onSubmit={handleCreateRoom} className="mb-6 flex flex-col gap-2">
            <input
              type="text"
              value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
              placeholder="New room name"
              className="px-2 py-1 rounded border border-gray-400 text-gray-900"
            />
            <button
              type="submit"
              className="bg-teal-600 hover:bg-teal-700 text-white w-full py-2 rounded font-semibold"
            >
              Create
            </button>
          </form>
          <ul className="mb-6 space-y-2">
            {rooms.map((room) => (
              <li key={room} className="relative">
                <button
                  className={`w-full text-left px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${currentRoom === room ? 'bg-teal-700 text-white' : 'bg-gray-700 text-gray-100 hover:bg-teal-600 hover:text-white'}`}
                  onClick={() => handleRoomChange(room)}
                >
                  {room}
                  {unreadCounts[room] > 0 && (
                    <span className="absolute right-2 top-2 bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{unreadCounts[room]}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {/* Online Users section */}
          <h3 className="text-lg font-bold mb-4 text-teal-200">Online Users</h3>
          <ul className="flex-1 overflow-y-auto space-y-2">
            {filteredUsers
              .filter(user => user.username !== username)
              .map((user) => (
                <li
                  key={user.id}
                  className="px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between bg-gray-700 text-gray-100 relative"
                >
                  <span>{user.username}</span>
                  <button
                    className="ml-2 px-2 py-1 rounded text-xs font-semibold bg-teal-500 hover:bg-teal-700 text-white"
                    onClick={() => handlePrivateChat(user)}
                  >
                    Private
                  </button>
                  {unreadCounts['private_' + user.id] > 0 && (
                    <span className="absolute right-2 top-2 bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{unreadCounts['private_' + user.id]}</span>
                  )}
                </li>
              ))}
          </ul>
          <button
            onClick={handleDisconnect}
            className="mt-4 bg-teal-600 hover:bg-teal-800 text-white py-1 rounded text-sm font-semibold shadow"
          >
            Disconnect
          </button>
        </div>
        {currentRoom ? (
          <div className="chat-main flex-1 flex flex-col h-full">
            <div className="px-6 py-4 bg-gray-700 shadow flex items-center justify-between border-b border-gray-400">
              <span className="font-bold text-xl text-teal-100">{currentRoom} Room</span>
              <span className="text-gray-300 text-sm">Logged in as <span className="font-semibold text-teal-300">{username}</span></span>
            </div>
            {/* Message list rendering */}
            <div className="messages flex-1 overflow-y-auto px-6 py-4 space-y-2 bg-gray-50" ref={messagesContainerRef}>
              {privateRecipient
                ? privateMessages.map((msg, idx) => (
                    <div key={msg.id} className={msg.sender === username ? 'flex justify-end' : 'flex justify-start'}>
                      <div
                        className={
                          msg.sender === username
                            ? 'bg-teal-600 text-white rounded-lg px-4 py-2 max-w-xs shadow-md'
                            : 'bg-gray-200 text-gray-900 rounded-lg px-4 py-2 max-w-xs shadow-md'
                        }
                      >
                        <span className={`sender font-semibold text-xs mr-2 ${msg.sender === username ? 'text-teal-200' : 'text-teal-700'}`}>{msg.sender}</span>
                        <span className="timestamp text-[10px] text-gray-400">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <div className="text break-words text-sm mt-1">{
                          typeof msg.message === 'string'
                            ? msg.message
                            : (msg.message && typeof msg.message.message === 'string')
                              ? msg.message.message
                              : (msg.message && msg.message.file)
                                ? '' // Don't show JSON for file messages
                                : JSON.stringify(msg.message)
                        }
                        {(msg.file || (msg.message && msg.message.file)) && (
                          <div className="mt-2">
                            {(() => {
                              const fileData = msg.file || msg.message.file;
                              return fileData.type && fileData.type.startsWith('image') ? (
                                <img 
                                  src={`http://localhost:5000${fileData.url}`} 
                                  alt={fileData.name} 
                                  className="max-w-xs max-h-40 rounded border border-gray-200"
                                  onError={(e) => {
                                    console.error('Image failed to load:', fileData.url);
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <a 
                                  href={`http://localhost:5000${fileData.url}`} 
                                  download={fileData.name} 
                                  className="text-teal-700 underline hover:text-teal-900" 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  📎 {fileData.name || 'Download file'}
                                </a>
                              );
                            })()}
                          </div>
                        )}
                        </div>
                        {/* Reactions */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className="mt-1 flex gap-2">
                            {msg.reactions.map(r => (
                              <span key={r.emoji} className={r.users.includes(username) ? 'font-bold' : ''}>
                                {r.emoji} {r.users.length}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Emoji Picker Button */}
                        <button onClick={() => setShowEmojiPickerFor(msg.id)} className="ml-2 text-xs text-gray-500 hover:text-teal-600">😊</button>
                        {showEmojiPickerFor === msg.id && (
                          <div className="absolute z-50">
                            <EmojiPicker
                              onEmojiClick={(emojiData) => handleAddReaction(msg.id, emojiData.emoji)}
                              height={350}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                : filteredMessages.map((msg, idx) => (
                    <div key={msg.id + '-' + msg.timestamp + '-' + idx} className={msg.sender === username ? 'flex justify-end' : 'flex justify-start'}>
                      <div
                        className={
                          msg.system
                            ? 'text-xs italic text-gray-500'
                            : msg.isPrivate
                            ? 'bg-teal-900 text-white rounded-lg px-4 py-2 max-w-xs shadow-md border-2 border-teal-400'
                            : msg.sender === username
                            ? 'bg-teal-600 text-white rounded-lg px-4 py-2 max-w-xs shadow-md'
                            : 'bg-gray-200 text-gray-900 rounded-lg px-4 py-2 max-w-xs shadow-md'
                        }
                      >
                        {msg.system ? (
                          <em>{msg.message}</em>
                        ) : (
                          <>
                            <span className="sender font-semibold text-xs mr-2 text-teal-700">{msg.sender}</span>
                            <span className="timestamp text-[10px] text-gray-400">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {msg.isPrivate && <span className="ml-2 text-xs text-teal-200 font-bold">(private)</span>}
                            <div className="text break-words text-sm mt-1">{
                              typeof msg.message === 'string'
                                ? msg.message
                                : (msg.message && typeof msg.message.message === 'string')
                                  ? msg.message.message
                                  : (msg.message && msg.message.file)
                                    ? '' // Don't show JSON for file messages
                                    : JSON.stringify(msg.message)
                            }
                            {(msg.file || (msg.message && msg.message.file)) && (
                              <div className="mt-2">
                                {(() => {
                                  const fileData = msg.file || msg.message.file;
                                  return fileData.type && fileData.type.startsWith('image') ? (
                                    <img 
                                      src={`http://localhost:5000${fileData.url}`} 
                                      alt={fileData.name} 
                                      className="max-w-xs max-h-40 rounded border border-gray-200"
                                      onError={(e) => {
                                        console.error('Image failed to load:', fileData.url);
                                        e.target.style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <a 
                                      href={`http://localhost:5000${fileData.url}`} 
                                      download={fileData.name} 
                                      className="text-teal-700 underline hover:text-teal-900" 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                    >
                                      📎 {fileData.name || 'Download file'}
                                    </a>
                                  );
                                })()}
                              </div>
                            )}
                            </div>
                            {/* Read receipt indicator */}
                            {msg.readBy && msg.readBy.length > 0 && (
                              <div className="mt-1 flex items-center gap-1 text-xs text-teal-700">
                                <span title={`Read by: ${msg.readBy.join(', ')}`}>{msg.readBy.length === users.length ? '✓✓ All read' : `✓ ${msg.readBy.length} read`}</span>
                              </div>
                            )}
                            {/* Reactions */}
                            {msg.reactions && msg.reactions.length > 0 && (
                              <div className="mt-1 flex gap-2">
                                {msg.reactions.map(r => (
                                  <span key={r.emoji} className={r.users.includes(username) ? 'font-bold' : ''}>
                                    {r.emoji} {r.users.length}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Emoji Picker Button */}
                            <button onClick={() => setShowEmojiPickerFor(msg.id)} className="ml-2 text-xs text-gray-500 hover:text-teal-600">😊</button>
                            {showEmojiPickerFor === msg.id && (
                              <div className="absolute z-50">
                                <EmojiPicker
                                  onEmojiClick={(emojiData) => handleAddReaction(msg.id, emojiData.emoji)}
                                  height={350}
                                />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              <div ref={messageEndRef} />
            </div>
            <form className="input-form flex items-center px-6 py-4 bg-gray-100 border-t border-gray-300 gap-2" onSubmit={handleSend}>
              {privateRecipient && (
                <div className="mr-2 flex items-center gap-2 bg-teal-100 text-teal-900 px-2 py-1 rounded text-xs font-semibold">
                  <span>To: {privateRecipient.username} (private)</span>
                  <button type="button" onClick={cancelPrivate} className="ml-1 text-teal-700 hover:text-teal-900">✕</button>
                </div>
              )}
              <input
                type="text"
                value={message}
                onChange={handleTyping}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                placeholder={`Message in ${currentRoom}...`}
                autoComplete="off"
                required
                className="flex-1 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white text-gray-800"
              />
              <input
                type="file"
                onChange={handleFileChange}
                className="ml-2 text-sm text-gray-600"
                title="Attach file"
              />
              <button
                type="submit"
                className="bg-teal-600 hover:bg-teal-800 text-white font-semibold px-4 py-2 rounded transition-colors shadow"
              >
                Send
              </button>
            </form>
            <div className="typing-indicator h-6 px-6 text-sm text-teal-700 bg-gray-100">
              {typingUsers.length > 0 && (
                <span>
                  {typingUsers.filter((u) => u !== username).join(', ')}
                  {typingUsers.length === 1 ? ' is typing...' : ' are typing...'}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-2xl text-gray-400">Select a room from the sidebar to join</span>
          </div>
        )}
        
        {/* Private Chat Modal */}
        {showPrivateModal && selectedPrivateUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-11/12 max-w-2xl h-5/6 flex flex-col">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-teal-600 text-white rounded-t-lg flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">Private Chat with {selectedPrivateUser.username}</h3>
                  <p className="text-sm text-teal-100">Logged in as {username}</p>
                </div>
                <button
                  onClick={closePrivateModal}
                  className="text-white hover:text-gray-200 text-xl font-bold"
                >
                  ✕
                </button>
              </div>
              
              {/* Private Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 bg-gray-50" ref={messageEndRef}>
                {privateMessages.map((msg) => (
                  <div key={msg.id} className={msg.sender === username ? 'flex justify-end' : 'flex justify-start'}>
                    <div
                      className={
                        msg.sender === username
                          ? 'bg-teal-600 text-white rounded-lg px-4 py-2 max-w-xs shadow-md'
                          : 'bg-gray-200 text-gray-900 rounded-lg px-4 py-2 max-w-xs shadow-md'
                      }
                    >
                      <span className={`sender font-semibold text-xs mr-2 ${msg.sender === username ? 'text-teal-200' : 'text-teal-700'}`}>{msg.sender}</span>
                      <span className="timestamp text-[10px] text-gray-400">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <div className="text break-words text-sm mt-1">{
                        typeof msg.message === 'string'
                          ? msg.message
                          : (msg.message && typeof msg.message.message === 'string')
                            ? msg.message.message
                            : (msg.message && msg.message.file)
                              ? '' // Don't show JSON for file messages
                              : JSON.stringify(msg.message)
                      }
                      {(msg.file || (msg.message && msg.message.file)) && (
                        <div className="mt-2">
                          {(() => {
                            const fileData = msg.file || msg.message.file;
                            return fileData.type && fileData.type.startsWith('image') ? (
                              <img 
                                src={`http://localhost:5000${fileData.url}`} 
                                alt={fileData.name} 
                                className="max-w-xs max-h-40 rounded border border-gray-200"
                                onError={(e) => {
                                  console.error('Image failed to load:', fileData.url);
                                  e.target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <a 
                                href={`http://localhost:5000${fileData.url}`} 
                                download={fileData.name} 
                                className="text-teal-700 underline hover:text-teal-900" 
                                target="_blank" 
                                rel="noopener noreferrer"
                              >
                                📎 {fileData.name || 'Download file'}
                              </a>
                            );
                          })()}
                        </div>
                      )}
                      </div>
                      {/* Reactions */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="mt-1 flex gap-2">
                          {msg.reactions.map(r => (
                            <span key={r.emoji} className={r.users.includes(username) ? 'font-bold' : ''}>
                              {r.emoji} {r.users.length}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Emoji Picker Button */}
                      <button onClick={() => setShowEmojiPickerFor(msg.id)} className="ml-2 text-xs text-gray-500 hover:text-teal-600">😊</button>
                      {showEmojiPickerFor === msg.id && (
                        <div className="absolute z-50">
                          <EmojiPicker
                            onEmojiClick={(emojiData) => handleAddReaction(msg.id, emojiData.emoji)}
                            height={350}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Private Message Input */}
              <form className="px-6 py-4 bg-gray-100 border-t border-gray-300 flex items-center gap-2" onSubmit={(e) => {
                e.preventDefault();
                if (message.trim()) {
                  sendPrivateMessage(selectedPrivateUser.id, message.trim());
                  setMessage('');
                  setTyping(false);
                }
              }}>
                <input
                  type="text"
                  value={message}
                  onChange={handleTyping}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                  placeholder={`Message to ${selectedPrivateUser.username} (private)...`}
                  autoComplete="off"
                  required
                  className="flex-1 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white text-gray-800"
                />
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    console.log('File selected for private:', file.name, file.type, file.size);
                    
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    fetch('http://localhost:5000/upload', {
                      method: 'POST',
                      body: formData,
                    })
                    .then(res => res.json())
                    .then(data => {
                      if (data.url) {
                        const fileMsg = {
                          file: {
                            url: data.url,
                            name: data.name,
                            type: data.type,
                          },
                        };
                        sendPrivateMessage(selectedPrivateUser.id, fileMsg);
                      }
                    })
                    .catch(err => {
                      console.error('Private file upload error:', err);
                      alert(`File upload failed: ${err.message}`);
                    });
                    
                    e.target.value = '';
                  }}
                  className="ml-2 text-sm text-gray-600"
                  title="Attach file"
                />
                <button
                  type="submit"
                  className="bg-teal-600 hover:bg-teal-800 text-white font-semibold px-4 py-2 rounded transition-colors shadow"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        )}
        {/* Add audio elements for notification sounds */}
        <audio ref={inroomAudio} src={inroomSound} preload="auto" />
        <audio ref={indmAudio} src={indmSound} preload="auto" />
      </div>
    </div>
  );
}

export default App;
