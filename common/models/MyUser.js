var loopback = require('loopback');
var server = require('../../server/server');
var uploadable = require('../../server/lib/uploadable')();
var async = require('async');
var admin = require('digitopia-admin');
var uuid = require('uuid');
var VError = require('verror').VError;
var WError = require('verror').WError;
var async = require('async');
var mailer = require('../../server/lib/mail');
var qs = require('querystring');

var debug = require('debug')('user');
var debugVerbose = require('debug')('user:verbose');

module.exports = function (MyUser) {

	if (process.env.ADMIN) {
		admin.setUpRoleToggleAPI(MyUser);
	}

	// on login set access_token cookie with same ttl as loopback's accessToken
	MyUser.afterRemote('login', function setLoginCookie(context, accessToken, next) {
		var res = context.res;
		var req = context.req;
		if (accessToken != null) {
			if (accessToken.id != null) {
				res.cookie('access_token', accessToken.id, {
					signed: req.signedCookies ? true : false,
					maxAge: 1000 * accessToken.ttl
				});
			}
		}
		return next();
	});

	// toast the session cookie
	MyUser.afterRemote('logout', function removeLoginCookie(context, accessToken, next) {
		var res = context.res;
		var req = context.req;
		res.clearCookie('access_token', {
			signed: req.signedCookies ? true : false
		});
		return next();
	});

	// send email for password reset loop
	MyUser.on('resetPasswordRequest', function (info) {
		var url = server.locals.config.publicHost + '/?access_token=' + info.accessToken.id;
		url += '#password-reset-form';
		var options = {
			'to': info.email,
			'from': 'noreply@myantisocial.net',
			'subject': 'Password Reset Request.',
			'url': url
		};

		mailer(server, 'emails/reset-password', options, function (err) {
			if (err) {
				var e = new WError(err, 'could not send verification email');
				debug(e.toString());
				debug(e.stack);
			}
		});
	});

	// set up uploadable gear for MyUser model
	MyUser.on('attached', function () {

		// on Upload make versions for various UI uses
		var versions = {
			'background': [{
				suffix: 'large',
				quality: 90,
				maxHeight: 2048,
				maxWidth: 2048,
			}, {
				suffix: 'thumb',
				quality: 90,
				maxHeight: 300,
				maxWidth: 300,
			}],
			'photo': [{
				suffix: 'large',
				quality: 90,
				maxHeight: 1024,
				maxWidth: 1024,
			}, {
				suffix: 'thumb',
				quality: 90,
				maxHeight: 300,
				maxWidth: 300,
				aspect: '1:1'
			}]
		};

		// add uploadable endpoints to MyUser
		uploadable(MyUser, 'MyUser', versions);
	});

	MyUser.register = function (email, password, ctx, next) {
		var req = ctx.req;
		var res = ctx.res;
		async.waterfall([
			function (cb) { // is this the first user on the server?
				req.app.models.MyUser.find(function (err, users) {
					if (err) {
						return cb(err);
					}
					cb(null, users.length === 0);
				});
			},
			function (isFirstUser, cb) { // create the user
				createUser(req.body.email, req.body.password, isFirstUser, function (err, user) {
					if (err) {
						var e = new VError(err, 'create user error');
						return cb(e);
					}

					cb(null, user);
				});
			},
			function (user, cb) { // do email verification loop
				debugVerbose('generate verification token');
				req.app.models.MyUser.generateVerificationToken(user, {}, function (err, token) {
					if (err) {
						var e = new VError(err, 'generate verification token');
						return cb(e);
					}
					user.verificationToken = token;
					user.save(function (err) {
						if (err) {
							var e = new VError(err, 'save verification token');
							return cb(e);
						}
						cb(null, user, token);
					});
				});
			},
			function (user, token, cb) { // send verification email
				debugVerbose('send verification email');

				var url = server.locals.config.publicHost + '/api/MyUsers/confirm' + '?' + qs.stringify({
					'uid': '' + user.id,
					'redirect': '/',
					'token': token
				});

				var options = {
					'to': user.email,
					'from': 'mrhodes@myantisocial.net',
					'subject': 'Thanks for registering.',
					'user': user,
					'url': url
				};

				mailer(server, 'emails/verify', options, function (err) {
					if (err) {
						var e = new VError(err, 'could not send verification email');
						return cb(e);
					}
					cb(null, user);
				});
			},
			function (user, cb) { // log in
				debugVerbose('create access token');

				var twoWeeks = 60 * 60 * 24 * 7 * 2;
				user.createAccessToken(twoWeeks, {}, function (err, accessToken) {
					if (err) {
						var e = new VError(err, 'create access token');
						return cb(e);
					}
					cb(null, user, accessToken);
				});
			}
		], function (err, user, accessToken) { // done
			if (err) {
				var e = new WError(err, 'could not register');
				debug(e.toString());
				debug(e.stack);
				return next(e);
			}

			res.cookie('access_token', accessToken.id, {
				signed: req.signedCookies ? true : false,
				maxAge: 1000 * accessToken.ttl
			});

			debugVerbose('return result');

			return next(null, {
				'flashLevel': 'info',
				'flashMessage': 'Welcome!',
				'hijaxLocation': '/settings',
				'didLogIn': true
			});
		});
	};

	// create a user, if superuser set up admin roles
	function createUser(email, password, superuser, next) {
		var theUser = null;

		var adminUser = {
			'email': email,
			'password': password
		};

		debugVerbose('createUser', adminUser);

		async.series([
			function createUser(cb) {
				server.models.MyUser.create(adminUser, function (err, user) {
					if (err) {
						var e = new VError(err, 'create user error');
						return cb(e);
					}
					theUser = user;
					cb();
				});
			},
			function createAdminRole(cb) {
				if (!superuser) {
					return setImmediate(cb);
				}

				server.models.Role.create({
					name: 'admin'
				}, function (err, role) {
					if (err) {
						var e = new VError(err, 'create admin role error');
						return cb(e);
					}
					role.principals.create({
						principalType: server.models.RoleMapping.USER,
						principalId: theUser.id
					}, function (err, principal) {
						if (err) {
							var e = new VError(err, 'create admin rolemapping error');
							return cb(e);
						}
						cb();
					});
				});
			},
			function createSuperuserRole(cb) {
				if (!superuser) {
					return setImmediate(cb);
				}

				server.models.Role.create({
					name: 'superuser'
				}, function (err, role) {
					if (err) {
						var e = new VError(err, 'create superuser role error');
						return cb(e);
					}
					role.principals.create({
						principalType: server.models.RoleMapping.USER,
						principalId: theUser.id
					}, function (err, principal) {
						if (err) {
							var e = new VError(err, 'create superuser rolemapping error');
							return cb(e);
						}
						cb();
					});
				});
			}
		], function (err) {
			if (err) {
				var e = new VError(err, 'create user');
				return next(e);
			}
			next(null, theUser);
		});
	}

	MyUser.remoteMethod(
		'register', {
			http: {
				path: '/register',
				verb: 'post'
			},
			accepts: [{
				arg: 'email',
				description: 'email',
				type: 'string',
				required: true,
				http: {
					source: 'body'
				}
			}, {
				arg: 'password',
				description: 'password',
				type: 'string',
				required: true,
				http: {
					source: 'body'
				}
			}, {
				arg: 'options',
				type: 'object',
				http: {
					source: 'context'
				}
			}],
			returns: {
				arg: 'result',
				type: 'object'
			}
		}
	);

	// check if username is in use on this server
	MyUser.isunique = function (field, value, ctx, cb) {
		var myContext = ctx.req.myContext;
		var currentUser = myContext.get('currentUser');

		var match = {};
		match[field] = value;

		var filter = {};
		if (currentUser) {
			filter = {
				'id': {
					'neq': currentUser.id
				}
			};
		}

		MyUser.find({
			'where': {
				'and': [match, filter]
			},
			'limit': 1
		},  function (err, users) {
			return cb(err, users.length);
		});
	};

	MyUser.remoteMethod(
		'isunique', {
			http: {
				path: '/isunique',
				verb: 'get'
			},
			accepts: [{
				arg: 'field',
				type: 'string',
				required: true,
				http: {
					source: 'query'
				}
			}, {
				arg: 'value',
				type: 'string',
				required: true,
				http: {
					source: 'query'
				}
			}, {
				arg: 'options',
				type: 'object',
				http: {
					source: 'context'
				}
			}],
			returns: {
				arg: 'found',
				type: 'string'
			}
		}
	);
};
