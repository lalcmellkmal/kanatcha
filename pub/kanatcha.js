(function () {

var $img, $prompt, $input;
var refreshReq, submitReq, challengeId;
var highlightTimer;

var $handle, $scores;
var pollTimer;

function loadCaptcha() {
	if (refreshReq)
		refreshReq.abort();
	challengeId = null;
	$img.attr('src', '');
	refreshReq = $.ajax('refresh', {
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
	advise(data.msg);
	if (data.success) {
		$prompt.css('color', '#00d');
		if (highlightTimer)
			clearTimeout(highlightTimer);
		highlightTimer = setTimeout(function () {
			$prompt.css('color', 'inherit');
			highlightTimer = 0;
		}, 1000);
	}
	loadCaptcha();
}

function fail(message) {
	$prompt.text(message).css({color: 'red'});
}

function advise(message) {
	$prompt.text(message).css({color: 'inherit'});
}

function install($target) {
	$img = $('<img>').css({width: 200, height: 80});
	$prompt = $('<p>Type in the kana.</p>');
	$input = $('<input>').on('keydown', function (event) {
		if (event.which == 13) {
			submit();
			event.stopPropagation();
		}
	});
	$target.append($prompt, $img, '<br>', $input);
	loadCaptcha();
}

function getScores() {
	$.ajax('scores', {
		dataType: 'json',
		success: function (data) {
			$scores.empty();
			for (var i = 0; i < data.scores.length; i++) {
				var info = data.scores[i];
				var $name = $('<th/>').text(info.name);
				var $score = $('<td/>').text(info.score);
				$('<tr/>').append($name, $score).appendTo($scores);
			}
		},
		complete: function () {
			pollTimer = setTimeout(getScores, 30 * 1000);
		},
	});
}

$(function () {
	$handle = $('#name');
	$scores = $('<table/>').css('float', 'right').appendTo('body');
	getScores();

	install($('<div/>').appendTo('body'));
});

})();
