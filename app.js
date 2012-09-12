
/**
 * Module dependencies.
 */

var express = require('express'),
    socketio = require('socket.io'),
    routes = require('./routes/root'),
    http = require('http'),
    path = require('path'),
    connect = require('connect');

var app = express(),
    server = http.createServer(app),
    io = socketio.listen(server);

var MongoStore = require('connect-mongodb'),
    sessionStore = new MongoStore({ url: 'mongodb://localhost/project3' }),
    Session = connect.middleware.session.Session;

// Override cookie.parse
var parseCookie = function (cookies) {
  var obj = require('cookie').parse(cookies);
  for (var key in obj) {
    obj[key] = obj[key].split(":")[1].split(".")[0];
  }
  return obj;
};


app.configure(function(){
  app.set('port', process.env.PORT || 8080);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({
    secret: "hogehoge"
  , store: sessionStore
  , cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }  // 1 week
  }));
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});


app.configure('development', function(){
  app.use(express.errorHandler());
});

/**
 * Routing
 */
// User
app.get('/', routes.user.index);
app.post('/', routes.user.login);
app.get('/user/new', routes.user.new);
app.post('/user/create', routes.user.create);
app.post('/user/delete', routes.user.delete);
app.get('/user/logout', routes.user.logout);
// Presentation
app.get('/presentation/new', routes.presentation.new);
app.post('/presentation/create', routes.presentation.create);
app.post('/presentation/delete', routes.presentation.delete);
app.get('/:uid/:pid/show', routes.presentation.show);
app.get('/:uid/:pid/edit', routes.presentation.edit);
app.get('/:uid/:pid/stat', routes.presentation.stat);
// Admin
app.get('/admin', routes.admin.index);
app.post('/admin', routes.admin.login);
app.get('/admin/new', routes.admin.new);
app.post('/admin/create', routes.admin.create);
app.get('/admin/user', routes.admin.user);
app.get('/admin/presentation', routes.admin.presentation);
app.get('/admin/logout', routes.admin.logout);

server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

// Socket.IO Configuration
io.configure(function () {
  io.set('authorization', function (handshakeData, callback) {
    if (handshakeData.headers.cookie) {
      // Get cookie from handshakeData
      var cookie = handshakeData.headers.cookie;
      // Get express.sid from cookie
      var sessionID = parseCookie(cookie)['connect.sid'];
      handshakeData.sessionID = sessionID;

      // Get session from storage
      sessionStore.get(sessionID, function (err, session) {
        if (err) {
          callback(err.message, false);
        } else {
          // Save session data
          handshakeData.session = new Session(handshakeData, session);
          // Authorized OK
          callback(null, true);
        }
      });
   } else {
      return callback('Cannot find cookie', false);
    }
  });
});

//  FIXME: Cannot work handshake.session.reload
/*
io.sockets.on('connection', function (socket) {
  var _SESSION_UPDATE_INTERVAL = 3 * 1000;  //  3 seconds

  var handshake = socket.handshake;
  console.log('Connect:', handshake.sessionID);  //  For debug

  var updateSessionTimerId = setInterval(function () {
    //  Reload session
    handshake.session.reload(function () {
      //  Update lastAccess and maxAge
      handshake.session.touch().save();
      console.log('Update:', handshake.sessionID);  //  For debug
    });
  }, _SESSION_UPDATE_INTERVAL);

  socket.on('disconnect', function () {
    console.log('Disconnect:', handshake.sessionID);  //  For debug
    clearInterval(updateSessionTimerId);
  });
});
*/

// TODO: Optimize
var _userData = {},
    _pageCount = {},
    _reactionCount = {
      good: []
    , bad : []
    };
/*    _room = {};


var room = io
  .of('/room')
  .on('connection', function (socket) {
  console.log('emitte');
  //success connection
  socket.emit('connected');
  socket.on('room', function (data) {
    _room.user_id = data.user_id ,
    _room.presentation_id = data.presentation_id
    console.log('emitted data is:', _room.user_id);
  });
});*/

var presentation = io
  .of('/presentation/')
  .on('connection', function (socket) {
    
    socket.on('init', function(req){
	var room = req.user_id + '/' + req.presentation_id;
	socket.set('room', room);
	socket.join(room);
	_pageCount[room] = {presenter: [], listner: []};
	console.log(_pageCount.room);
    });
    

    var sessionID = socket.id;
    console.log('Presentation connect:', sessionID);  // For debug


    socket.on('page', function (data) {
    socket.get('room', function(err, _room){
      room = _room;
    });
      socket.broadcast.to(room).emit('page', data);
    });

    socket.on('sync page', function (data) {
    socket.get('room', function(err, _room){
      room = _room;
    });
      var arr,
          presenterIndex;
      arr = _pageCount.presenter;
      presenterIndex = arr.indexOf(Math.max.apply(null, arr));
      if (data !== presenterIndex) {
        socket.to(room).emit('sync page', presenterIndex);
        console.log('Sync page:', presenterIndex);  // For debug
      }
    });

    socket.on('location', function (data) {
      socket.get('room', function(err, _room){
	  room = _room;
	});
      presentation.to(room).emit('location', data);
    });

    socket.on('clear', function (data) {
      socket.get('room', function(err, _room){
	  room = _room;
	});
      presentation.to(room).emit('clear', data);
    });

    socket.on('count', function (data) {
      socket.get('room', function(err, _room){
	  room = _room;
	});
      var arr = _pageCount[room][data.userType];
      for (var i = 0, length = data.pageNum + 1; i < length; i++) {
        arr[i] = arr[i] || 0;
      }
      // arr[data.pageNum] = arr[data.pageNum] || 0;
      switch (data.action) {
        case 'count':
          arr[data.pageNum]++;
          // io.of('/statistics').emit('statistics', _pageCount);
          presentation.to(room).emit('user count', _pageCount[room]);
          console.log(_pageCount[room]);
          break;
        case 'discount':
          arr[data.pageNum]--;
          break;
      }
      _userData[sessionID] = {
        userType: data.userType
      , pageNum : data.pageNum
      };
      console.log(data.action, _userData);  // For debug
    });

    socket.on('reaction', function (data) {
      socket.get('room', function(err, _room){
        room = _room;
      });
      var arr = _reactionCount[data.type];
      for (var i = 0, length = data.pageNum + 1; i < length; i++) {
        arr[i] = arr[i] || 0;
      }
      // arr[data.pageNum] = arr[data.pageNum] || 0;
      arr[data.pageNum]++;
      presentation.to(room).emit('reaction count', _reactionCount);
      console.log(_reactionCount);  // For debug
    });

    socket.on('get reaction', function () {
      socket.get('room', function(err, _room){
        room = _room;
      });
      presentation.to(room).emit('reaction count', _reactionCount);
    });

    socket.on('reset reaction', function (data) {
      socket.get('room', function(err, _room){
        room = _room;
      });
      _reactionCount = {
        good: []
      , bad : []
      };
      presentation.to(room).emit('reaction count', _reactionCount);
    });

    socket.on('reset', function () {
      socket.get('room', function(err, _room){
        room = _room;
      });
      console.log('Reset');  // For debug
      _pageCount = {};
      _reactionCount = {
        good: []
      , bad : []
      };
      for (var key in _userData) {
        delete _userData[key];
      }
      presentation.to(room).emit('reset');
    });

    socket.on('disconnect', function () {
      socket.get('room', function(err, _room){
        room = _room;
      });
      console.log('Presentation disconnect:', sessionID);  // For debug
      var data, arr;
      // If not after 'reset'
      if (_userData[sessionID]) {
        data = _userData[sessionID];
        arr = _pageCount[room][data.userType];
        if (arr[data.pageNum]) {
          arr[data.pageNum]--;
          console.log('discount', _userData);  // For debug
        }
        delete _userData[sessionID];
      }
      // io.of('/statistics').emit('statistics', _pageCount);
      socket.leave(room);
      presentation.to(room).emit('user count', _pageCount[room]);
      console.log(_pageCount);
    });

var statistics = io
  .of('/statistics')
  .on('connection', function (socket) {
    socket.on('init', function(req){
	var room = req.user_id + '/' + req.presentation_id;
	socket.set('room', room);
	socket.join(room);
    });

    var _SHOW_COUNT_INTERVAL = 3000;

    // Show count when statistics page is loaded
    socket.emit('statistics', _pageCount);

    // Show count at regular intervals
    var showCountTimerId = setInterval(function () {
      socket.emit('statistics', _pageCount);
    }, _SHOW_COUNT_INTERVAL);

    socket.on('disconnect', function () {
      clearInterval(showCountTimerId);
    });
  });
});
