import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Paperclip, Send, Trash2, User, Users } from 'lucide-react';
import './MessengerPage.css';

import { API_BASE, API_DIRECT, apiFetch, parseApiResponse } from '../config/api';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmContext';
import UserProfileModal from '../components/UserProfileModal';
const ALLOWED_FILE_TYPES = '.pdf,.docx,.jpeg,.jpg,.png';
const IMAGE_EXTENSIONS = ['.jpeg', '.jpg', '.png'];

function RoomUnreadBadge({ count }) {
  if (!count) return null;
  const label = count > 99 ? '99+' : count;
  return <span className="room-unread-badge">{label}</span>;
}

function isImageFile(fileName) {
  if (!fileName) return false;
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

function fileUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE || API_DIRECT}${path}`;
}

function UserAvatar({ user, className = '' }) {
  if (user?.avatarUrl) {
    return <img src={fileUrl(user.avatarUrl)} alt="" className={className} />;
  }
  return <User size={14} className={className} />;
}

function MessageContent({ msg }) {
  if (msg.messageType === 'file') {
    const url = fileUrl(msg.fileUrl);
    return (
      <div className="message-file">
        {msg.content && <p className="message-caption">{msg.content}</p>}
        {isImageFile(msg.fileName) ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img src={url} alt={msg.fileName} className="message-image" />
          </a>
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer" className="message-file-link">
            <Paperclip size={12} /> {msg.fileName}
          </a>
        )}
      </div>
    );
  }

  return <p>{msg.content}</p>;
}

function formatTime(value, locale) {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

async function parseResponse(response) {
  return parseApiResponse(response);
}

function MessengerPage() {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const confirm = useConfirm();
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastMessageIdRef = useRef(0);
  const userIdRef = useRef(null);
  const activeRoomIdRef = useRef(null);

  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [roomLoading, setRoomLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [profileUserId, setProfileUserId] = useState(null);

  const loadRooms = useCallback(async (userId) => {
    const response = await apiFetch(`/api/messenger/rooms?userId=${userId}`);
    const data = await parseResponse(response);
    if (data.success) {
      setRooms(data.rooms);
      return data.rooms;
    }
    throw new Error(t('msg_load_rooms_fail'));
  }, [t]);

  const loadUsers = useCallback(async (userId) => {
    const response = await apiFetch('/api/users');
    const data = await parseResponse(response);
    if (data.success) {
      const currentId = Number(userId);
      setUsers(
        (data.users || []).filter((item) => Number(item.id) !== currentId)
      );
      return data.users;
    }
    throw new Error(t('msg_load_users_fail'));
  }, [t]);

  const markRoomRead = useCallback(async (roomId, userId, lastMessageId = 0) => {
    try {
      await apiFetch(
        `/api/messenger/rooms/${roomId}/read?userId=${userId}&lastMessageId=${lastMessageId}`,
        { method: 'POST' }
      );
      setRooms((prev) => prev.map((room) => (
        room.id === roomId ? { ...room, unreadCount: 0 } : room
      )));
    } catch {
      // ignore mark-read errors
    }
  }, []);

  const loadMessages = useCallback(async (roomId, userId, reset = false) => {
    const after = reset ? 0 : lastMessageIdRef.current;
    const response = await apiFetch(
      `/api/messenger/rooms/${roomId}/messages?userId=${userId}&after=${after}`
    );
    const data = await parseResponse(response);
    if (!data.success) return;
    if (activeRoomIdRef.current !== roomId) return;

    if (reset) {
      setMessages(data.messages);
      const lastId = data.messages.length
        ? data.messages[data.messages.length - 1].id
        : 0;
      lastMessageIdRef.current = lastId;
      await markRoomRead(roomId, userId, lastId);
      return;
    }

    if (data.messages.length > 0) {
      setMessages((prev) => [...prev, ...data.messages]);
      const lastId = data.messages[data.messages.length - 1].id;
      lastMessageIdRef.current = lastId;
      await markRoomRead(roomId, userId, lastId);
    }
  }, [markRoomRead]);

  const selectRoom = useCallback(async (room, userId) => {
    if (!room?.id || !userId) {
      setError(t('msg_open_chat_fail'));
      return;
    }

    setRoomLoading(true);
    setError('');
    setShowUsers(false);
    setActiveRoom(room);
    activeRoomIdRef.current = room.id;
    lastMessageIdRef.current = 0;
    setMessages([]);

    try {
      await loadMessages(room.id, userId, true);
    } catch (err) {
      setError(err.message || t('msg_load_messages_fail'));
      setMessages([]);
    } finally {
      setRoomLoading(false);
    }
  }, [loadMessages, t]);

  const openGeneralChat = useCallback(async (userId) => {
    setRoomLoading(true);
    setError('');

    try {
      let roomList = rooms;
      if (!roomList.length) {
        roomList = await loadRooms(userId);
      }

      const generalRoom = roomList.find((room) => room.type === 'general');
      if (!generalRoom) {
        throw new Error(t('msg_general_not_found'));
      }

      await selectRoom(generalRoom, userId);
    } catch (err) {
      setError(err.message || t('msg_open_general_fail'));
    } finally {
      setRoomLoading(false);
    }
  }, [rooms, loadRooms, selectRoom, t]);

  const openPrivateChat = useCallback(async (targetUser, userId) => {
    setRoomLoading(true);
    setError('');
    setShowUsers(false);

    try {
      const response = await apiFetch('/api/messenger/rooms/private', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          targetUserId: Number(targetUser.id),
        }),
      });
      const data = await parseResponse(response);

      if (!data.success || !data.room) {
        throw new Error(t('msg_open_dm_fail'));
      }

      await loadRooms(userId);
      await selectRoom(data.room, userId);
    } catch (err) {
      setError(err.message || t('toast_connection_error'));
    } finally {
      setRoomLoading(false);
    }
  }, [loadRooms, selectRoom, t]);

  const handleSendFile = async (file) => {
    const userId = userIdRef.current;
    if (!file || !activeRoom || !userId || uploading) return;

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.pdf', '.docx', '.jpeg', '.jpg', '.png'].includes(ext)) {
      setError(t('msg_file_types'));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError(t('msg_file_size'));
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('userId', String(userId));
      formData.append('file', file);
      if (input.trim()) {
        formData.append('caption', input.trim());
        setInput('');
      }

      const response = await apiFetch(
        `/api/messenger/rooms/${activeRoom.id}/files`,
        { method: 'POST', body: formData }
      );
      const data = await parseResponse(response);

      if (data.success && data.message) {
        setMessages((prev) => [...prev, data.message]);
        lastMessageIdRef.current = data.message.id;
        markRoomRead(activeRoom.id, userId, data.message.id);
        loadRooms(userId);
      } else {
        throw new Error(t('msg_send_file_fail'));
      }
    } catch (err) {
      setError(err.message || t('file_upload_fail'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFilePick = (event) => {
    const file = event.target.files?.[0];
    if (file) handleSendFile(file);
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const userId = userIdRef.current;
    if (!input.trim() || !activeRoom || !userId || sending) return;

    setSending(true);
    const text = input.trim();
    setInput('');
    setError('');

    try {
      const response = await apiFetch(
        `/api/messenger/rooms/${activeRoom.id}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: Number(userId), content: text }),
        }
      );
      const data = await parseResponse(response);

      if (data.success && data.message) {
        setMessages((prev) => [...prev, data.message]);
        lastMessageIdRef.current = data.message.id;
        markRoomRead(activeRoom.id, userId, data.message.id);
        loadRooms(userId);
      } else {
        throw new Error(t('msg_send_fail'));
      }
    } catch (err) {
      setError(err.message || t('msg_send_fail'));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      navigate('/login');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(stored);
    } catch {
      localStorage.removeItem('user');
      navigate('/login');
      return;
    }

    const userId = Number(parsed?.id);
    if (!userId) {
      localStorage.removeItem('user');
      navigate('/login');
      return;
    }

    userIdRef.current = userId;
    setUser({ ...parsed, id: userId });

    Promise.all([loadRooms(userId), loadUsers(userId)]).catch((err) => {
      setError(err.message || t('msg_load_fail'));
    }).finally(() => {
      setLoading(false);
    });
  }, [navigate, loadRooms, loadUsers, t]);

  const toggleUsersPicker = useCallback(async () => {
    const next = !showUsers;
    setShowUsers(next);
    if (next && userIdRef.current) {
      try {
        await loadUsers(userIdRef.current);
      } catch (err) {
        setError(err.message || t('msg_refresh_users_fail'));
      }
    }
  }, [showUsers, loadUsers, t]);

  useEffect(() => {
    if (!activeRoom?.id || !userIdRef.current) return undefined;

    const interval = setInterval(() => {
      loadMessages(activeRoom.id, userIdRef.current, false).catch(() => {});
    }, 3000);

    return () => clearInterval(interval);
  }, [activeRoom, loadMessages]);

  useEffect(() => {
    if (!userIdRef.current) return undefined;

    const interval = setInterval(() => {
      loadRooms(userIdRef.current).catch(() => {});
    }, 6000);

    return () => clearInterval(interval);
  }, [loadRooms]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const backToChats = () => {
    setActiveRoom(null);
    activeRoomIdRef.current = null;
    setMessages([]);
    setError('');
  };

  const openProfile = useCallback((targetUserId) => {
    if (!targetUserId) return;
    setProfileUserId(Number(targetUserId));
  }, []);

  const closeProfile = useCallback(() => {
    setProfileUserId(null);
  }, []);

  const handleProfileMessage = useCallback(async (profileUser) => {
    closeProfile();
    const userId = userIdRef.current;
    if (!profileUser?.id || !userId) return;
    await openPrivateChat(profileUser, userId);
  }, [closeProfile, openPrivateChat]);

  const deletePrivateChat = useCallback(async (room) => {
    const userId = userIdRef.current;
    if (!room?.id || room.type !== 'private' || !userId || deleting) return;

    const label = room.name || t('msg_peer_default');
    const confirmed = await confirm({
      message: t('msg_delete_confirm', { name: label }),
      confirmText: t('action_delete'),
      variant: 'danger',
    });
    if (!confirmed) return;

    setDeleting(true);
    setError('');

    try {
      const response = await apiFetch(
        `/api/messenger/rooms/${room.id}?userId=${userId}`,
        { method: 'DELETE' }
      );
      await parseResponse(response);

      if (activeRoomIdRef.current === room.id) {
        backToChats();
      }
      await loadRooms(userId);
    } catch (err) {
      setError(err.message || t('msg_delete_fail'));
    } finally {
      setDeleting(false);
    }
  }, [deleting, loadRooms, confirm, t]);

  if (loading) {
    return (
      <div className="messenger-page">
        <div className="messenger-bg" aria-hidden="true" />
        <div className="messenger-shell messenger-shell-loading">
          <div className="messenger-loading">
            <div className="messenger-loading-icon">
              <MessageCircle size={28} />
            </div>
            <p>{t('msg_loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  const userId = userIdRef.current;
  const generalRoom = rooms.find((room) => room.type === 'general');
  const privateRooms = rooms.filter((room) => room.type === 'private');

  return (
    <div className={`messenger-page${activeRoom ? ' chat-open' : ''}`}>
      <div className="messenger-bg" aria-hidden="true" />
      <div className="messenger-shell">
      <aside className="messenger-sidebar">
        <div className="messenger-sidebar-header">
          <div className="messenger-brand">
            <span className="messenger-brand-icon">
              <MessageCircle size={18} />
            </span>
            <div>
              <h2>{t('msg_title')}</h2>
              <span className="messenger-user">{user?.fullName}</span>
            </div>
          </div>
        </div>

        {error && <div className="messenger-error sidebar-error">{error}</div>}

        <button
          type="button"
          className={`room-item ${activeRoom?.type === 'general' ? 'active' : ''}`}
          disabled={roomLoading}
          onClick={() => openGeneralChat(userId)}
        >
          <span className="room-icon">#</span>
          <div className="room-info">
            <strong>{t('msg_general')}</strong>
            <small>{t('msg_general_hint')}</small>
          </div>
          <RoomUnreadBadge count={generalRoom?.unreadCount} />
        </button>

        <div className="sidebar-section">
          <div className="sidebar-section-title">
            <span>{t('msg_private_chats')}</span>
            <button type="button" className="new-chat-btn" onClick={toggleUsersPicker}>
              +
            </button>
          </div>

          {showUsers && (
            <div className="users-picker">
              {users.length === 0 ? (
                <p className="users-empty">{t('msg_no_users')}</p>
              ) : (
                users.map((item) => (
                  <div key={item.id} className="user-pick-row">
                    <button
                      type="button"
                      className="user-pick-profile-btn"
                      title={t('msg_view_profile')}
                      disabled={roomLoading}
                      onClick={() => openProfile(item.id)}
                    >
                      <UserAvatar user={item} className="user-pick-avatar" />
                    </button>
                    <button
                      type="button"
                      className="user-pick-item"
                      disabled={roomLoading}
                      onClick={() => openPrivateChat(item, userId)}
                    >
                      <span className="user-pick-name">{item.fullName}</span>
                      {item.position && <small>{item.position}</small>}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {privateRooms.length === 0 ? (
            <p className="rooms-empty">{t('msg_no_rooms')}</p>
          ) : (
            privateRooms.map((room) => (
              <div key={room.id} className="room-item-wrap">
                <button
                  type="button"
                  className={`room-item ${activeRoom?.id === room.id ? 'active' : ''}`}
                  disabled={roomLoading || deleting}
                  onClick={() => selectRoom(room, userId)}
                >
                  <span className="room-icon room-icon-avatar">
                    {room.peer?.avatarUrl ? (
                      <img src={fileUrl(room.peer.avatarUrl)} alt="" />
                    ) : '@'}
                  </span>
                  <div className="room-info">
                    <strong>{room.name}</strong>
                    {room.lastMessage && (
                      <small>
                        {(room.lastMessage.messageType === 'file'
                          ? t('msg_file_prefix', { name: room.lastMessage.fileName || t('msg_attachment') })
                          : room.lastMessage.content)?.slice(0, 40)}
                      </small>
                    )}
                  </div>
                  <RoomUnreadBadge count={room.unreadCount} />
                </button>
                <button
                  type="button"
                  className="room-delete-btn"
                  title={t('msg_delete_chat')}
                  disabled={roomLoading || deleting}
                  onClick={() => deletePrivateChat(room)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="messenger-main">
        {!activeRoom ? (
          <div className="messenger-placeholder">
            <div className="messenger-placeholder-icon">
              <Users size={32} />
            </div>
            <h3>{t('msg_select_chat')}</h3>
            <p>{t('msg_select_hint')}</p>
            <button
              type="button"
              className="messenger-primary-btn"
              disabled={roomLoading}
              onClick={() => openGeneralChat(userId)}
            >
              {roomLoading ? t('common_loading') : t('msg_open_general')}
            </button>
            {!generalRoom && (
              <p className="rooms-empty" style={{ marginTop: '12px' }}>
                {t('msg_restart_hint')}
              </p>
            )}
          </div>
        ) : (
          <>
            <header className="messenger-header">
              <div className="messenger-header-left">
                <button type="button" className="back-to-chats" onClick={backToChats}>
                  {t('msg_back_chats')}
                </button>
                <div className="messenger-header-title">
                  <span className="messenger-room-badge">
                    {activeRoom.type === 'general' ? t('msg_general') : t('msg_private_chats')}
                  </span>
                  {activeRoom.type === 'private' && activeRoom.peer?.id ? (
                    <button
                      type="button"
                      className="chat-peer-link"
                      onClick={() => openProfile(activeRoom.peer.id)}
                      title={t('msg_view_profile')}
                    >
                      {activeRoom.peer?.avatarUrl ? (
                        <img
                          src={fileUrl(activeRoom.peer.avatarUrl)}
                          alt=""
                          className="chat-peer-avatar"
                        />
                      ) : (
                        <span className="chat-peer-avatar chat-peer-avatar-fallback">
                          <User size={16} />
                        </span>
                      )}
                      <span>
                        <h3>{activeRoom.name}</h3>
                        <p>{t('msg_private_visibility')}</p>
                      </span>
                    </button>
                  ) : (
                    <div>
                      <h3>{activeRoom.type === 'general' ? t('msg_general') : activeRoom.name}</h3>
                      <p>
                        {activeRoom.type === 'general'
                          ? t('msg_general_visibility')
                          : t('msg_private_visibility')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="messenger-header-actions">
                {activeRoom.type === 'private' && activeRoom.peer?.id && (
                  <button
                    type="button"
                    className="profile-chat-btn"
                    title={t('msg_view_profile')}
                    onClick={() => openProfile(activeRoom.peer.id)}
                  >
                    <User size={16} />
                  </button>
                )}
                {activeRoom.type === 'private' && (
                  <button
                    type="button"
                    className="delete-chat-btn"
                    title={t('msg_delete_chat')}
                    disabled={deleting || roomLoading}
                    onClick={() => deletePrivateChat(activeRoom)}
                  >
                    <Trash2 size={16} />
                    {deleting ? t('msg_deleting') : t('action_delete')}
                  </button>
                )}
                <Link to="/chat" className="ai-link">{t('dash_ai_modal_title')}</Link>
              </div>
            </header>

            <div className="messenger-messages" ref={messagesContainerRef}>
              {roomLoading ? (
                <div className="messages-empty">{t('common_loading')}</div>
              ) : messages.length === 0 ? (
                <div className="messages-empty">{t('msg_no_messages')}</div>
              ) : (
                messages.map((msg) => {
                  const isOwn = msg.userId === userId;
                  return (
                    <div
                      key={msg.id}
                      className={`msg-row ${isOwn ? 'own' : 'other'}`}
                    >
                      <div className="msg-body">
                        {!isOwn ? (
                          <div className="msg-meta">
                            <button
                              type="button"
                              className="msg-label msg-label-btn"
                              onClick={() => openProfile(msg.userId)}
                              title={t('msg_view_profile')}
                            >
                              {msg.senderName}
                            </button>
                            <span className="msg-time">{formatTime(msg.createdAt, locale)}</span>
                          </div>
                        ) : null}
                        <MessageContent msg={msg} />
                        {isOwn ? (
                          <span className="msg-time msg-time-own">{formatTime(msg.createdAt, locale)}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form className="messenger-composer" onSubmit={handleSend}>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_FILE_TYPES}
                className="file-input-hidden"
                onChange={handleFilePick}
                disabled={uploading || roomLoading}
              />
              <button
                type="button"
                className="attach-btn"
                title={t('msg_attach')}
                disabled={uploading || roomLoading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? '...' : <Paperclip size={18} />}
              </button>
              <input
                type="text"
                className="messenger-composer-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('msg_placeholder')}
                disabled={sending || roomLoading || uploading}
              />
              <button
                type="submit"
                className="messenger-send-btn"
                title={t('action_send')}
                disabled={sending || roomLoading || uploading || !input.trim()}
              >
                {sending ? <span className="messenger-send-dots">...</span> : <Send size={18} />}
              </button>
            </form>
          </>
        )}
      </section>

      </div>

      {profileUserId && (
        <UserProfileModal
          userId={profileUserId}
          currentUserId={userId}
          onClose={closeProfile}
          onMessage={handleProfileMessage}
        />
      )}
    </div>
  );
}

export default MessengerPage;
