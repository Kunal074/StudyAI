/**
 * collab.js
 * ─────────────────────────────────────────────
 * Socket.io client wrapper for real-time collaborative notes.
 * Loaded before app.js — exposes window.collab
 *
 *  collab.connect(token, user, callbacks) → join the shared note room
 *  collab.disconnect()                    → leave and cleanup
 *  collab.isConnected()                   → check status
 */

(function () {

  let socket      = null;
  let currentRoom = null;

  const collab = {

    /**
     * Connect to a shared note room.
     * @param {string} token      — the share token (room identifier)
     * @param {object} user       — { name } of the current user
     * @param {object} callbacks  — { onUserJoined, onUserLeft, onNewComment }
     */
    connect(token, user, callbacks = {}) {
      // Disconnect any existing connection first
      if (socket) {
        socket.disconnect();
        socket = null;
      }

      try {
        // io() is provided by socket.io/socket.io.js served by the server
        socket = io({ transports: ['websocket', 'polling'] });

        socket.on('connect', () => {
          currentRoom = token;
          socket.emit('join_note', { token, user });
          console.log('[collab] Connected to room:', token);
        });

        socket.on('user_joined', (u) => callbacks.onUserJoined?.(u));
        socket.on('user_left',   (u) => callbacks.onUserLeft?.(u));
        socket.on('new_comment', (c) => callbacks.onNewComment?.(c));

        socket.on('disconnect', () => {
          console.log('[collab] Disconnected from room:', currentRoom);
          currentRoom = null;
        });

        socket.on('connect_error', (err) => {
          console.warn('[collab] Connection error:', err.message);
        });

      } catch (err) {
        console.warn('[collab] Socket.io not available:', err.message);
      }
    },

    /** Disconnect from the current room. */
    disconnect() {
      if (socket) {
        socket.disconnect();
        socket      = null;
        currentRoom = null;
      }
    },

    /** Returns true if socket is actively connected. */
    isConnected() {
      return socket?.connected ?? false;
    }
  };

  window.collab = collab;

})();
