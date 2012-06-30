var fs = require('fs'),
    imagemagick = require('imagemagick');

var config = {
	COUNT: 4,
	FONT: 'hiragino.otf',
	FONT_SIZE: 60,
	IMAGE_SIZE: [200, 80],
	SKEW: 0.4,
	SPACING: 0.7,
	TILT: [5, 10],
};

var questions = {};
var answers = {};

function loadQuestions(file, set) {
	questions[set] = fs.readFileSync(file, 'UTF-8').replace(/\s+/g, '');
}

function pickKana(set) {
	set = questions[set];
	return set[Math.floor(set.length * Math.random())];
}

function blitString(string, size, pos, angle, args) {
	var orig = angle;
	angle *= Math.PI / 180;
	var s = Math.sin(angle), c = Math.cos(angle);
	var mid = size/2;
	var xoff = mid - (c * mid + s * mid);
	var yoff = mid - (c * mid - s * mid);
	var mat = [c, s, -s, c, pos[0] + xoff, pos[1] - yoff];
	var skew = config.SKEW;
	mat[2] += Math.random() * (skew * 2) - skew;
	var spec = "text 0, 0 '" + string + "'";
	args.push('-pointsize', size, '-affine', mat.join(','), '-draw', spec);
	return mat[0] * size;
}

function makeCaptcha(file, callback) {
	var size = config.FONT_SIZE;
	var args = ['-size', config.IMAGE_SIZE.join('x'), 'canvas:white',
			'-font', config.FONT];
	var target = '';
	var x = 0, y = size;
	var tilt = config.TILT;
	for (var i = 0; i < config.COUNT; i++) {
		var kana = pickKana('hiragana');
		target += kana;
		var angle = Math.random() * (tilt[1] - tilt[0]) + tilt[0];
		if (Math.random() < 0.5)
			angle = -angle;
		var w = blitString(kana, size, [x, y], angle, args);
		x += w * (config.SPACING + Math.random() * 0.1);
	}
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
		if (m[1] in answers)
			console.warn("Duplicate answer for " + m[1]);
		answers[m[1]] = m[2].split(',');
	});
}

function checkAnswer(target, input) {
	var i, j;
	input = input.toLowerCase().replace(/\s+/g, '');
	for (i = 0; i < target.length; i++) {
		var thisAnswer = target[i];
		if (thisAnswer && input[0] === thisAnswer) {
			input = input.slice(1);
			continue;
		}
		var ok = answers[thisAnswer];
		if (!ok) {
			console.warn("Unknown char in target:", target[i]);
			return false;
		}
		for (j = 0; j < ok.length; j++) {
			var chunk = ok[j];
			if (!chunk) {
				console.warn("Empty answer?!");
				continue;
			}
			var n = chunk.length;
			if (input.slice(0, n) === chunk) {
				input = input.slice(n);
				break;
			}
		}
		if (j == ok.length) {
			/* Timing attacks you say
			   How about you timing attack my ass? */
			return false;
		}
	}
	return input == '';
}
exports.checkAnswer = checkAnswer;

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
	makeCaptcha('captcha.png', console.log.bind(console));
}
