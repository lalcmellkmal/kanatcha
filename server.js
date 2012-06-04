var connect = require('connect'),
    fs = require('fs'),
    kanatcha = require('./kanatcha'),
    urlParse = require('url').parse;

var indexHtml = fs.readFileSync('index.html');

var db = require('redis').createClient();

var TIMEOUT = 60;

var app = connect();
app.use(connect.static('pub'));
app.use(connect.bodyParser());
app.use(function (req, resp, next) {
	var u = urlParse(req.url, true);
	var verb = req.method.toUpperCase();
	var notHead = (verb != 'HEAD') ? true : '';
	if (u.pathname == '/') {
		resp.writeHead(200, {'Content-Type': 'text/html'});
		resp.end(notHead && indexHtml);
	}
	else if (u.pathname == '/refresh' && verb == 'POST') {
		/* TODO: worker thread etc. instead of on-demand */
		generate(function (err, id) {
			if (err) {
				console.error(err);
				resp.writeHead(500);
				resp.end('Oops');
				return;
			}
			var info = {
				c: id,
				image: 'image?c=' + encodeURIComponent(id),
			};
			resp.writeHead(200, {
				'Content-Type': 'application/json',
				'Expires': 'Thu, 01 Jan 1970 00:00:00 GMT',
				'Cache-Control': 'no-cache',
			});
			resp.end(JSON.stringify(info));
		});
	}
	else if (u.pathname == '/image' && verb == 'GET' && u.query.c) {
		var externalId = u.query.c;
		if (!sanityCheckExternalId(externalId)) {
			resp.writeHead(404);
			resp.end();
			return;
		}
		db.get('kanatcha:c:' + externalId, function (err, info) {
			if (err || !info) {
				if (err)
					console.error(err);
				resp.writeHead(404);
				resp.end();
				return;
			}
			info = JSON.parse(info);
			var filename = imageFilename(info.id);
			var image = fs.createReadStream(filename);
			image.once('open', function () {
				resp.writeHead(200, {'Content-Type': 'image/png'});
				image.pipe(resp);
			});
			image.once('error', function (err) {
				console.error(err);
				resp.writeHead(404);
				resp.end();
			});
		});
	}
	else if (u.pathname == '/solve' && verb == 'POST') {
		var input = req.body.a, externalId = req.body.c;
		if (!sanityCheckExternalId(externalId) || !input) {
			resp.writeHead(404);
			resp.end();
		}
		var key = 'kanatcha:c:' + externalId;
		var m = db.multi().get(key).del(key);
		m.exec(function (err, rs) {

			function respond(message, extra) {
				if (!extra)
					extra = {};
				extra.msg = message;
				resp.writeHead(200, {'Content-Type': 'application/json'});
				resp.end(JSON.stringify(extra));
			}

			if (err) {
				console.error(err);
				respond('Server error.');
				return;
			}
			var info = rs[0];
			if (!info || rs[1] != 1) {
				respond('Already attempted or expired.');
				return;
			}
			info = JSON.parse(info);
			if (!info.target) {
				respond('Internal error.');
				return;
			}
			deleteImage(imageFilename(info.id));
			if (!kanatcha.checkAnswer(info.target, input)) {
				respond('Incorrect.');
				return;
			}
			respond('Correct!', {success: true});
		});
	}
	else
		next();
});

function randomLetters() {
	return (Math.floor(Math.random() * 1e16) + 1e16).toString(36).slice(1);
}

function generateExternalId() {
	return randomLetters() + randomLetters() + randomLetters();
}

function sanityCheckExternalId(id) {
	return typeof id == 'string' && id.match(/^[a-z0-9]{10,40}$/);
}

function imageFilename(id) {
	return 'imgs/captcha' + id + '.png';
}

function generate(cb) {
	db.incr('kanatcha:idCtr', function (err, internalId) {
		if (err)
			return cb(err);
		var filename = imageFilename(internalId);
		kanatcha.makeCaptcha(filename, function (err, target) {
			if (err)
				return cb(err);
			var externalId = generateExternalId();
			var info = {id: internalId, target: target};

			/* Poor man's clean-up */
			db.setex('kanatcha:c:' + externalId, TIMEOUT, JSON.stringify(info), function (err) {
				if (err) {
					deleteImage(filename);
					return cb(err);
				}
				setTimeout(deleteImage.bind(null, filename), TIMEOUT * 1000);
				cb(null, externalId);
			});
		});
	});
}

function deleteImage(filename) {
	fs.unlink(filename, function (err) {});
}

if (require.main === module) {
	app.listen(8000);
}
