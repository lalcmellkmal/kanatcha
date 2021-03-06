var config = require('./config').render,
    fs = require('fs'),
    imagemagick = require('imagemagick');

var questions = {};
var answers = {};
var hiragana = {};

function makeQuestion(level) {
	var q = [], bonus = level + 1;
	switch (level) {
	case 0:
		q = [0, 0, 0, 0];
		break;
	case 1:
		q = [1, 0, 0, 0];
		break;
	case 2:
		q = [2, 1, 0, 0];
		break;
	case 3:
		q = [3, 2, 0, 0];
		bonus = 0;
		break;
	}

	/* Shuffle order */
	if (bonus) {
		/* But don't move the last one if there's a bonus */
		var last = q.pop();
		shuffle(q);
		q.push(last);
	}
	else {
		shuffle(q);
	}

	var question = {q: q.map(pickFromLevel).join('')};
	if (bonus)
		question.x = pickFromLevel(bonus);
	return question;
}

function pickFromLevel(level) {
	var set = questions[level ? 'kanji0' + level : 'hiragana'];
	return set[Math.floor(set.length * Math.random())]
}

function loadQuestions(file, set) {
	questions[set] = fs.readFileSync(file, 'UTF-8').replace(/\s+/g, '');
}

function blitString(string, color, size, pos, angle, args) {
	var orig = angle;
	angle *= Math.PI / 180;
	var s = Math.sin(angle), c = Math.cos(angle);
	var mid = size/2;
	var xoff = mid - (c * mid + s * mid);
	var yoff = mid - (c * mid - s * mid);
	var mat = [c, s, -s, c, pos[0] + xoff, pos[1] - yoff];
	var skew = config.skew;
	mat[2] += Math.random() * (skew * 2) - skew;
	var spec = "text 0, 0 '" + string + "'";
	args.push('-pointsize', size, '-affine', mat.join(','), '-fill', color, '-draw', spec);
	return mat[0] * size;
}

function makeCaptcha(level, file, callback) {
	/* Design */
	var target = makeQuestion(level);
	var chars = [];
	for (var i = 0; i < target.q.length; i++)
		chars.push({color: 'black', kana: target.q[i]});
	if (target.x)
		chars.push({color: 'gray', kana: target.x});
	var tilt = config.tilt;
	chars.forEach(function (k) {
		var angle = Math.random() * (tilt[1] - tilt[0]) + tilt[0];
		if (Math.random() < 0.5)
			angle = -angle;
		k.angle = angle;
	});

	/* Render */
	var size = config.fontSize;
	var args = ['-size', config.imageSize.join('x'), 'canvas:white',
			'-font', config.font];
	var x = 0, y = size;
	chars.forEach(function (k) {
		var w = blitString(k.kana, k.color, size, [x, y], k.angle, args);
		x += w * (config.spacing + Math.random() * 0.1);
	});
	args.push('-depth', '3', '-quality', '90', '-strip', 'PNG8:' + file);
	imagemagick.convert(args, function (err, stdout, stderr) {
		if (err)
			return callback(stderr || err);
		callback(null, target);
	});
}
exports.makeCaptcha = makeCaptcha;

function loadAnswers(file) {
	fs.readFileSync(file, 'UTF-8').split('\n').forEach(function (line) {
		if (!line.trim())
			return;
		var m = line.match(/^(.):(.+)\s*$/);
		if (!m) {
			console.warn("Bad solution line: " + line);
			return;
		}
		var key = m[1];
		if (key in answers)
			console.warn("Duplicate answer for " + m[1]);
		answers[key] = m[2].split(',');
		if (file.indexOf('hiragana') >= 0)
			hiragana[key] = answers[key];
	});
}

function checkKana(thisAnswer, input) {
	if (thisAnswer && input[0] === thisAnswer)
		return 1;
	var ok = answers[thisAnswer];
	if (!ok) {
		console.warn("Unknown char in target:", target[i]);
		return false;
	}
	for (var j = 0; j < ok.length; j++) {
		var chunk = stripAnswer(ok[j]);
		if (!chunk) {
			console.warn("Empty answer?!");
			continue;
		}
		var n = chunk.length;
		if (input.slice(0, n) === chunk)
			return n;

		/* Allow (more) hiragana answers */
		var chunkPos = 0;
		for (var used = 0; used < input.length; ) {
			var romaji = hiragana[input[used++]];
			if (!romaji || !romaji[0])
				break;
			var n = romaji[0].length;
			if (chunk.substr(chunkPos, n) != romaji[0])
				break;
			chunkPos += n;
			if (chunkPos >= chunk.length)
				return used;
		}
	}
	return false;
}

function checkAnswer(target, input) {
	input = stripAnswer(input);
	for (var i = 0; i < target.q.length; i++) {
		var used = checkKana(target.q[i], input);
		if (used === false) {
			/* Timing attacks you say
			   How about you timing attack my ass? */
			return false;
		}
		input = input.slice(used);
	}
	/* Optional bonus */
	if (target.x) {
		if (checkKana(target.x, input) !== false)
			return true;
		else
			return {x: answers[target.x][0]};
	}
	return input == '';
}
exports.checkAnswer = checkAnswer;

function stripAnswer(input) {
	return input.toLowerCase().replace(/[\s\-.]+/g, '');
}

function shuffle(array) {
	for (var i = 1; i < array.length; i++) {
		var j = Math.floor(Math.random() * (i+1));
		if (j != i) {
			var swap = array[i];
			array[i] = array[j];
			array[j] = swap;
		}
	}
}

function setup() {
	var path = require('path')
	fs.readdirSync('lvl').forEach(function (txt) {
		var m = txt.match(/^(.+)\.txt$/);
		if (!m)
			return;
		loadQuestions(path.join('lvl', txt), m[1]);
	});
	fs.readdirSync('sol').forEach(function (txt) {
		loadAnswers(path.join('sol', txt));
	});
}

setup();

if (require.main === module) {
	var level = 0;
	makeCaptcha(level, 'captcha.png', function (err, q) {
		if (err)
			throw err;
		console.log('Answer?');
		process.stdin.resume();
		process.stdin.setEncoding('utf8');
		process.stdin.once('data', function (input) {
			process.stdin.pause();
			var ans = checkAnswer(q, input);
			if (ans) {
				console.log('Correct!');
				if (ans.x)
					console.log('Bonus answer was: ' + ans.x);
			}
			else {
				ans = q.q + (q.x ? ' ' + q.x : '');
				console.log('Wrong! It was ' + ans);
			}
		});
	});
}
