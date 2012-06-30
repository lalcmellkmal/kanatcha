(function () {

var $img, $prompt, $hint, $input;
var refreshReq, submitReq, challengeId;
var highlightTimer;

var $handle, $scores, $nav;
var kanjiLevel = -1;
var pollTimer, pollReq;

function loadCaptcha() {
	if (refreshReq)
		refreshReq.abort();
	challengeId = null;
	$img.attr('src', '');
	refreshReq = $.ajax('refresh', {
		data: {lev: kanjiLevel},
		dataType: 'json',
		type: 'POST',
		success: onChallenge,
		error: onError,
		complete: function () { refreshReq = null; },
	});
}

function onChallenge(data) {
	if (data.image) {
		$img.attr('src', data.image);
		$input.val('').focus();
		challengeId = data.c;
	}
	else
		fail("Couldn't obtain a kanatcha.");
}

function onError($xhr, textStatus, info) {
	fail("Connection problem.");
}

function submit() {
	var answer = $input.val();
	if (!challengeId || !answer)
		return;
	$input.val('');
	var data = {c: challengeId, a: answer};
	data.handle = $handle.val();
	localStorage.setItem('captchaName', data.handle);
	submitReq = $.ajax('solve', {
		data: data,
		dataType: 'json',
		type: 'POST',
		success: onVerdict,
		error: onError,
		complete: function () { submitReq = null; },
	});
}

function onVerdict(data) {
	advise(data);
	if (data.success) {
		$prompt.css('color', '#00d');
		if (highlightTimer)
			clearTimeout(highlightTimer);
		highlightTimer = setTimeout(function () {
			$prompt.css('color', 'inherit');
			highlightTimer = 0;
		}, 1000);
	}
	if (data.name && data.score) {
		var found = false;
		$scores.find('th').each(function () {
			if ($(this).text() == data.name) {
				$(this).next().text(data.score);
				found = true;
			}
		});
		if (!found)
			addScoreRow(data);
	}
	loadCaptcha();
}

function fail(message) {
	$prompt.text(message).css({color: 'red'});
	$hint.hide();
}

function advise(info) {
	if (info.msg)
		$prompt.text(info.msg).css({color: 'inherit'});
	if (info.bonus)
		$hint.text(info.bonus.q + " = " + info.bonus.a).show();
	else
		$hint.hide();
}

function install($target) {
	$img = $('<img>', {width: 250, height: 80});
	$prompt = $('<span>Type in the kana.</span>');
	$hint = $('<span/>', {css: {color: 'gray'}}).hide();
	$input = $('<input>', {width: 240}).on('keydown', function (event) {
		if (event.which == 13) {
			submit();
			event.stopPropagation();
		}
	});
	$target.append($prompt, ' ', $hint, '<br>', $img, '<br>', $input);
	loadCaptcha();
}

function addScoreRow(info) {
	var $name = $('<th/>').text(info.name);
	var $score = $('<td/>').text(info.score);
	$('<tr/>').append($name, $score).appendTo($scores);
}

function getScores() {
	if (pollReq)
		pollReq.abort();
	if (pollTimer)
		clearTimeout(pollTimer);

	var level = kanjiLevel;
	pollReq = $.ajax('scores', {
		data: {level: level},
		dataType: 'json',
		success: function (data) {
			$scores.empty();
			var $header = $('<th/>').text(levelName(level) + ' top scores');
			$('<tr colspan=2>').append($header).appendTo($scores);
			for (var i = 0; i < data.scores.length; i++)
				addScoreRow(data.scores[i]);
		},
		complete: function () {
			pollReq = null;
			pollTimer = setTimeout(function () {
				pollTimer = 0;
				getScores();
			}, 10 * 1000);
		},
	});
}

function levelName(level) {
	return level ? 'Kanji Level ' + level : 'Hiragana';
}

function setupNav() {
	$nav = $('nav').append('Level: ');
	for (var i = 0; i <= config.maxLevel; i++)
		$nav.append($('<a>', {href: i, text: i || 'hiragana'}), ' ');
	$nav.on('click', 'a', function (event) {
		event.preventDefault();
		changeLevel($(event.target).attr('href'));
		loadCaptcha();
	});
	changeLevel(localStorage.getItem('captchaLevel') || 0);
}

function changeLevel(n) {
	n = parseInt(n, 10);
	if (n == kanjiLevel)
		return;
	$('.selected').removeClass('selected');
	$nav.find('a[href='+n+']').addClass('selected');
	kanjiLevel = n;
	localStorage.setItem('captchaLevel', n);
	getScores();
}

$(function () {
	setupNav();
	$handle = $('#name').val(localStorage.getItem('captchaName'));
	$scores = $('<table/>').css('float', 'right').prependTo('body');
	getScores();
	install($('#kanatcha'));
});

})();
