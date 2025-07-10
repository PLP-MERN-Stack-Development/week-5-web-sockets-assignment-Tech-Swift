import { useState, useRef, useEffect } from 'react';
import './index.css';
import { useSocket } from './socket/socket';

function App() {
  const [username, setUsername] = useState('');
  const [inputName, setInputName] = useState('');
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [privateRecipient, setPrivateRecipient] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState('General');
  const messageEndRef = useRef(null);

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
  } = useSocket();

  // Fetch available rooms on mount
  useEffect(() => {
    fetch('/api/rooms')
      .then((res) => res.json())
      .then((data) => setRooms(data));
  }, []);

  // Join default room on login
  useEffect(() => {
    if (username && socket) {
      socket.emit('join_room', currentRoom);
    }
    // eslint-disable-next-line
  }, [username]);

  // Handle room change
  const handleRoomChange = (room) => {
    if (room === currentRoom) return;
    if (socket) {
      socket.emit('join_room', room);
      setCurrentRoom(room);
      setPrivateRecipient(null);
    }
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
  }, [messages, currentRoom]);

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

  // File upload handler
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
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
        if (privateRecipient) {
          sendPrivateMessage(privateRecipient.id, fileMsg);
        } else {
          sendMessage(fileMsg);
        }
      }
    } catch (err) {
      alert('File upload failed');
    }
    e.target.value = '';
  };

  // Cancel private mode
  const cancelPrivate = () => setPrivateRecipient(null);

  // Filter messages and users for current room
  const filteredMessages = messages.filter((msg) => (msg.room || 'General') === currentRoom);
  const filteredUsers = users;

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
    <div className="chat-container min-h-screen flex bg-gradient-to-br from-gray-100 to-gray-300">
      <div className="sidebar w-64 bg-gray-800 text-gray-100 flex flex-col p-4 border-r border-gray-300">
        <h3 className="text-lg font-bold mb-4 text-teal-200">Rooms</h3>
        <ul className="mb-6 space-y-2">
          {rooms.map((room) => (
            <li key={room}>
              <button
                className={`w-full text-left px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${currentRoom === room ? 'bg-teal-700 text-white' : 'bg-gray-700 text-gray-100 hover:bg-teal-600 hover:text-white'}`}
                onClick={() => handleRoomChange(room)}
              >
                {room}
              </button>
            </li>
          ))}
        </ul>
        <h3 className="text-lg font-bold mb-4 text-teal-200">Online Users</h3>
        <ul className="flex-1 overflow-y-auto space-y-2">
          {filteredUsers.map((user) => (
            <li
              key={user.id}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between ${user.username === username ? 'bg-teal-700 text-white' : 'bg-gray-700 text-gray-100'}`}
            >
              <span>{user.username}</span>
              {user.username !== username && (
                <button
                  className={`ml-2 px-2 py-1 rounded text-xs font-semibold ${privateRecipient && privateRecipient.id === user.id ? 'bg-teal-800 text-white' : 'bg-teal-500 hover:bg-teal-700 text-white'}`}
                  onClick={() => setPrivateRecipient(user)}
                >
                  Private
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          onClick={disconnect}
          className="mt-4 bg-teal-600 hover:bg-teal-800 text-white py-1 rounded text-sm font-semibold shadow"
        >
          Disconnect
        </button>
      </div>
      <div className="chat-main flex-1 flex flex-col h-full">
        <div className="px-6 py-4 bg-gray-700 shadow flex items-center justify-between border-b border-gray-400">
          <span className="font-bold text-xl text-teal-100">{currentRoom} Room</span>
          <span className="text-gray-300 text-sm">Logged in as <span className="font-semibold text-teal-300">{username}</span></span>
        </div>
        <div className="messages flex-1 overflow-y-auto px-6 py-4 space-y-2 bg-gray-50">
          {filteredMessages.map((msg) => (
            <div key={msg.id} className={msg.system ? 'flex justify-center' : msg.isPrivate ? (msg.sender === username ? 'flex justify-end' : 'flex justify-start') : msg.sender === username ? 'flex justify-end' : 'flex justify-start'}>
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
                          : JSON.stringify(msg.message)
                    }
                    {msg.file && (
                      <div className="mt-2">
                        {msg.file.type && msg.file.type.startsWith('image') ? (
                          <img src={msg.file.url} alt={msg.file.name} className="max-w-xs max-h-40 rounded border border-gray-200" />
                        ) : (
                          <a href={msg.file.url} download={msg.file.name} className="text-teal-700 underline" target="_blank" rel="noopener noreferrer">
                            {msg.file.name || 'Download file'}
                          </a>
                        )}
                      </div>
                    )}
                    </div>
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
            placeholder={privateRecipient ? `Message to ${privateRecipient.username} (private)...` : `Message in ${currentRoom}...`}
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
    </div>
  );
}

export default App;
