var getCurrentUser = require('../middleware/context-currentUser');
var ensureLoggedIn = require('../middleware/context-ensureLoggedIn');
var isInitialized = require('../middleware/context-initialized');
var publicUsers = require('../middleware/context-publicUsers');
var pendingFriendRequests = require('../middleware/context-pendingFriendRequests');
var getRecentPosts = require('../middleware/context-getRecentPosts');
var getFriends = require('../middleware/context-getFriends');
var getFriendAccess = require('../middleware/context-getFriendAccess');
var getFriendForEndpoint = require('../middleware/context-getFriendForEndpoint');
var collectFeed = require('../middleware/context-collectFeed');
var getScrollSession = require('../middleware/context-getScrollSession');
var saveScrollSession = require('../middleware/context-saveScrollSession');

var resolveProfiles = require('../lib/resolveProfiles');
var nodemailer = require('nodemailer');
var qs = require('querystring');

var uuid = require('uuid');

var url = require('url');
var uuid = require('uuid');
var VError = require('verror').VError;
var WError = require('verror').WError;
var async = require('async');
var request = require('request');
var _ = require('lodash');
var multer = require('multer');
var path = require('path');
var pug = require('pug');


var debug = require('debug')('routes');
var debugVerbose = require('debug')('routes:verbose');

module.exports = function (server) {
  var router = server.loopback.Router();

  // my news feed
  router.get('/feed', getCurrentUser(), ensureLoggedIn(), getFriends(), getScrollSession(), collectFeed(), saveScrollSession(), function (req, res, next) {
    var ctx = req.myContext;

    res.render('pages/feed', {
      'user': ctx.get('currentUser'),
      'globalSettings': ctx.get('globalSettings'),
      'posts': ctx.get('feed')
    });
  });

  server.use(router);
};
