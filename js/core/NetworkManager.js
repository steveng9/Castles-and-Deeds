/*
Castles & Deeds
NetworkManager.js  —  PeerJS (WebRTC DataChannel) transport for live multiplayer.

Lifted from Zerlin's proven NetworkManager and kept GAME-AGNOSTIC: it only moves
typed messages ({type, data}) between host and peers. Castles & Deeds is turn-ish
(1-4 players), so unlike Zerlin's 20Hz action sync the plan is host-authoritative
GameState snapshots sent on each committed move (see MULTIPLAYER_PLAN once written).

For now this is wired but unused — the Setup scene is local. Host = the player who
creates the room; others join by code. STUN-only (free, no infrastructure).

NOTE: Zerlin was strictly 2-player. Castles & Deeds needs up to 4, so the host
must accept MULTIPLE connections — `conns[]` instead of a single `conn`. See the
`broadcast()` helper. Per-peer routing/seat assignment is a TODO.
*/
class NetworkManager {
  constructor() {
    this.peer = null;
    this.conns = [];          // host: all peer connections; client: [hostConn]
    this.isHost = false;
    this.isConnected = false;
    this.roomCode = null;

    this.onConnected = null;      // (conn) => {}
    this.onDisconnected = null;   // (conn) => {}
    this.onMessage = null;        // (msg, conn) => {}  msg = {type, data}
    this.onRoomReady = null;      // (code) => {}
    this.onError = null;          // (err) => {}
  }

  host() {
    this.isHost = true;
    this.roomCode = NetworkManager._generateCode();
    this.peer = new Peer(this.roomCode, NetworkManager._peerConfig());
    this.peer.on('open', (id) => { if (this.onRoomReady) this.onRoomReady(id); });
    this.peer.on('connection', (conn) => this._setup(conn));
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        this.peer.destroy();
        this.roomCode = NetworkManager._generateCode();
        this.host();
        return;
      }
      if (this.onError) this.onError(err);
    });
  }

  join(code) {
    this.isHost = false;
    this.roomCode = code.toUpperCase().trim();
    this.peer = new Peer(NetworkManager._peerConfig());
    this.peer.on('open', () => this._setup(this.peer.connect(this.roomCode)));
    this.peer.on('error', (err) => { if (this.onError) this.onError(err); });
  }

  // Host: send to every peer. Client: send to host.
  broadcast(type, data) {
    for (const c of this.conns) if (c && c.open) c.send({ type, data });
  }
  send(type, data) { this.broadcast(type, data); }

  disconnect() {
    for (const c of this.conns) { try { c.close(); } catch (e) {} }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} }
    this.conns = [];
    this.peer = null;
    this.isConnected = false;
  }

  _setup(conn) {
    conn.on('open', () => {
      this.conns.push(conn);
      this.isConnected = true;
      if (this.onConnected) this.onConnected(conn);
    });
    conn.on('data', (msg) => { if (msg && msg.type && this.onMessage) this.onMessage(msg, conn); });
    conn.on('close', () => {
      this.conns = this.conns.filter(c => c !== conn);
      if (this.conns.length === 0) this.isConnected = false;
      if (this.onDisconnected) this.onDisconnected(conn);
    });
    conn.on('error', (err) => { if (this.onError) this.onError(err); });
  }

  static _generateCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  static _peerConfig() {
    return { config: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ] } };
  }
}

if (typeof window !== 'undefined') window.NetworkManager = NetworkManager;
