Faye.Transport.WebSocket = Faye.extend(Faye.Class(Faye.Transport, {
  UNCONNECTED:  1,
  CONNECTING:   2,
  CONNECTED:    3,

  batching:     false,
  
  request: function(messages, timeout) {
    this._timeout = this._timeout || timeout;
    this._messages = this._messages || {};
    Faye.each(messages, function(message) {
      this._messages[message.id] = message;
    }, this);
    this.withSocket(function(socket) { socket.send(Faye.toJSON(messages)) });
  },
  
  withSocket: function(callback, scope) {
    this.callback(callback, scope);
    this.connect();
  },
  
  connect: function() {
    this._state = this._state || this.UNCONNECTED;
    if (this._state !== this.UNCONNECTED) return;
    
    this._state = this.CONNECTING;
    
    var ws = Faye.ENV.WebSocket || Faye.ENV.MozWebSocket;
    this._socket = new ws(Faye.Transport.WebSocket.getSocketUrl(this._endpoint));
    var self = this;
    
    this._socket.onopen = function() {
      delete self._timeout;
      self._state = self.CONNECTED;
      self.setDeferredStatus('succeeded', self._socket);
    };
    
    this._socket.onmessage = function(event) {
      var messages = [].concat(JSON.parse(event.data));
      Faye.each(messages, function(message) {
        delete self._messages[message.id];
      });
      self.receive(messages);
    };
    
    this._socket.onclose = function() {
      var wasConnected = (self._state === self.CONNECTED);
      self.setDeferredStatus('deferred');
      self._state = self.UNCONNECTED;
      delete self._socket;
      
      if (wasConnected) return self.resend();
      
      Faye.ENV.setTimeout(function() { self.connect() }, 1000 * self._timeout);
      self._timeout = self._timeout * 2;
    };
  },
  
  resend: function() {
    var messages = Faye.map(this._messages, function(id, msg) { return msg });
    this.request(messages);
  }
}), {
  WEBSOCKET_TIMEOUT: 1000,
  
  getSocketUrl: function(endpoint) {
    return Faye.URI.parse(endpoint).toURL().replace(/^http(s?):/ig, 'ws$1:');
  },
  
  isUsable: function(endpoint, callback, scope) {
    var ws = Faye.ENV.WebSocket || Faye.ENV.MozWebSocket;
    if (!ws) return callback.call(scope, false);
    
    var connected = false,
        called    = false,
        socketUrl = this.getSocketUrl(endpoint),
        socket    = new ws(socketUrl);
    
    socket.onopen = function() {
      connected = true;
      socket.close();
      callback.call(scope, true);
      called = true;
      socket = null;
    };
    
    var notconnected = function() {
      if (!called && !connected) callback.call(scope, false);
      called = true;
    };
    
    socket.onclose = socket.onerror = notconnected;
    Faye.ENV.setTimeout(notconnected, this.WEBSOCKET_TIMEOUT);
  }
});

Faye.extend(Faye.Transport.WebSocket.prototype, Faye.Deferrable);
Faye.Transport.register('websocket', Faye.Transport.WebSocket);
