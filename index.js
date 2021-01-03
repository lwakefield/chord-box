const readline = require('readline');

const Tonal       = require('@tonaljs/tonal');
const midi        = require('midi');
const { isEqual, cloneDeep } = require('lodash');


const progressionToSteps = (p) => {
	return p.split('-').map(c => {
		return { ...parseChord(c), beats: 4 };
	});
};
const mkprog = (name, p) => ({ name, progression:progressionToSteps(p) });
const QUALITIES = Tonal.ChordType.symbols();
const PROGRESSION_PRESETS = [
	mkprog('those four chords (maj)', 'I-V-VIm-IV'),
	mkprog('those four chords (min)', 'Im-VI-III-VII'),
	mkprog('happy days', 'I-VIm-IV-V'),
	mkprog('sweet n cheerful', 'I-IV-V-IV'),
	mkprog('just floatin\' around #1', 'IV-V-VIm-IIIm'),
	mkprog('poptastic', 'I-IV-bVII-IV'),
	mkprog('mr peppy', 'I-IV-IIm-V'),
	mkprog('just floatin\' around #2', 'bI-IV-V-VIm'),
	mkprog('those four chords alt', 'I-III-VIm-IV'),
	mkprog('The Power Trip', 'I-bIII-VI-bIII'),
	// mkprog('Sittin\' Pretty', 'I-VI/I-V/I-V/I'),
	mkprog('The Andalusian', 'Im-VII-VI-V'),
	mkprog('The Epic Adventure', 'Im-III-IVm-IIIm'),
	mkprog('Totally Modal', 'Im-IV7-V7-Im'),
	mkprog('Funky AF', 'Im-VI7-IV7-V7'),
	// mkprog('The Smooth Mover #1', 'I-I/VII-VIm-IV'),
	// mkprog('Big-Ass Ballad', 'I-VIIom/III7-VIm-IV/V'),
	// mkprog('The Tearjerker', 'I-I7d-bVI-bIVm'),
	mkprog('Moody Tuesdays', 'Im-VI-IIdim-V7'),
	mkprog('The Smooth Mover #2', 'VIm-bV-I-V'),
	mkprog('The Old Timer', 'I-bIIIdim-IIm-V'),
	// // mkprog('one', 'I-Io7-bIV-bIVm'),
];

const patch = {
	tonic: 'C',
	octave: 4,
	length: 1,
	pstIndex: 0,
	presetDirty: false,
	progression: PROGRESSION_PRESETS[0].progression,
};
const ui = {
	mode: 'edit',
	progressionIndex: 0,
	ctl: 'deg',
}
const world = {
	play: false,
	tick: -1,
	notes: [],
	ltc: 0n,
};

const input = new midi.Input();
const output = new midi.Output();
const channel = 0;
input.ignoreTypes(false, false, false);


input.on('message', (time, msg) => {
	if (isEqual(msg, [250])) { world.play = true; world.tick = -1; tick(); }
	if (isEqual(msg, [251])) { world.play = true; }
	if (isEqual(msg, [252])) {
		world.play = false;
		world.tick = -1;
		for (const note of world.notes) {
			noteoff(note, channel);
		}
		world.notes = [];
	}

	if(!world.play) return;

	if (isEqual(msg, [248])) { tick(); }
});

console.log('Opening virtual ports...')
input.openVirtualPort("Movement");
output.openVirtualPort("Movement");
console.log('Opened virtual ports')

function getTotalBeats(steps) {
	return steps.reduce((acc, cur) => acc + cur.beats, 0);
}

function getTriggeredStep(steps, tick) {
	const len = getTotalBeats(steps);
	tick /= 24;
	tick %= len;

	let acc = 0;
	for (const step of steps) {
		if (tick === acc) return step;
		acc += step.beats;
	}

	return null;
}

function getCurrentStep(steps, tick) {
	return steps[getCurrentStep(steps, tick)];
}

function getCurrentStepIndex(steps, tick) {
	const len = getTotalBeats(steps);
	tick /= 24;
	tick %= len;

	let acc = 0;
	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		if (tick >= acc && tick < (acc + step.beats)) return i;
		acc += step.beats;
	}

	return null;
}

function tick () {
	const start = process.hrtime.bigint();
	// if (time === 0) { world.tick = -1; }

	world.tick += 1;

	const step = getTriggeredStep(patch.progression, world.tick);
	if (step) {
		const [chord] = Tonal.Progression.fromRomanNumerals(
			patch.tonic,
			[step.deg]
		);
		const { notes } = Tonal.Chord.get(chord + step.qlt);

		for (const note of world.notes) {
			noteoff(note, channel);
		}
		world.notes = notes.map(c => `${c}${patch.octave}`);
		for (const note of world.notes) {
			noteon(note, 127, channel);
		}

		world.ltc = process.hrtime.bigint() - start;

		draw();
	}
}

function cleanup () {
	for (const note of world.notes) {
		noteoff(note, channel);
	}
	world.notes = [];
	input.closePort();
	output.closePort();
}
process.on('exit', () => { cleanup(); });

function noteon (note, vel=127, channel=0) {
	output.sendMessage([
		144 | channel, 
		Tonal.Midi.toMidi(note),
		vel
	]);
}
function noteoff (note, channel=0) {
	output.sendMessage([
		128 | channel, 
		Tonal.Midi.toMidi(note),
		0
	]);
}

function draw () {
	const chords = patch.progression;
	const currentIndex = getCurrentStepIndex(patch.progression, world.tick);

	const rev = (val) => '\x1b[7m' + val + '\033[27m';
	const udl = (val) => '\x1b[4m' + val + '\033[24m';
	const clreol = '\x1b[K';
	const mvorigin = '\x1b[H';
	const clrscn = '\x1b[2J';
	const dimon = '\x1b[2m';
	const dimoff = '\x1b[22m';

	const chordline = chords.map((v,k) => {
		v = (v.deg+v.qlt).padEnd(7, ' ');
		if (k === currentIndex) v = udl(v);
		if (k === ui.progressionIndex) v = rev(v);
		return v;
	}).join(' ');

        process.stdout.write(mvorigin);
        process.stdout.write(clrscn);
	process.stdout.write('\n');
	if (ui.mode !== 'edit') { process.stdout.write(dimon); }
	process.stdout.write(' ' + chordline + clreol + '\n');
	if (ui.mode !== 'edit') { process.stdout.write(dimoff); }

	process.stdout.write(clreol + '\n');

	let chord = patch.progression[ui.progressionIndex];

	if (ui.mode !== 'ctl') { process.stdout.write(dimon); }

	// --- Degree ---
	let deg = 'deg: ' + chord.deg;
	deg = deg.padEnd(7);
	if (ui.ctl === 'deg') deg = rev(deg);
	process.stdout.write(' ' + deg)

	// --- Quality ---
	let qlt = 'qlt: ' + (chord.qlt || '-');
	qlt = qlt.padEnd(7);
	if (ui.ctl === 'qlt') qlt = rev(qlt);
	process.stdout.write(' ' + qlt)

	// --- Length/Beats ---
	let len = 'len: ' + chord.beats;
	len = len.padEnd(7);
	if (ui.ctl === 'len') len = rev(len);
	process.stdout.write(' ' + len)

	// --- Inversion ---
	let inv = 'inv: ' + (null || '-');
	inv = inv.padEnd(7);
	if (ui.ctl === 'inv') inv = rev(inv);
	process.stdout.write(' ' + inv)

	// --- Spread ---
	let spr = 'spr: ' + (null || '-');
	spr = spr.padEnd(7);
	if (ui.ctl === 'spr') spr = rev(spr);
	process.stdout.write(' ' + spr)

	// --- Preset ---
	let pst = 'pst: ';
	if (patch.presetDirty) pst += '-';
	if (!patch.presetDirty) pst += (PROGRESSION_PRESETS[patch.pstIndex].name);
	if (ui.ctl === 'pst') pst = rev(pst);
	process.stdout.write(clreol + '\n ' + pst);

	// --- Tonic ---
	let tnc = 'tnc: ' + patch.tonic;
	tnc = tnc.padEnd(7);
	if (ui.ctl === 'tnc') tnc = rev(tnc);
	process.stdout.write('\n ' + tnc)

	// --- Octave ---
	let oct = 'oct: ' + patch.octave;
	oct = oct.padEnd(7);
	if (ui.ctl === 'oct') oct = rev(oct);
	process.stdout.write(' ' + oct)

	// --- Add ---
	let add = 'add'.padEnd(7);
	if (ui.ctl === 'add') add = rev(add);
	process.stdout.write('\n ' + add);

	// --- Delete ---
	let del = 'del'.padEnd(7);
	if (ui.ctl === 'del') del = rev(del);
	process.stdout.write(' ' + del);


	if (ui.mode !== 'ctl') { process.stdout.write(dimoff); }

	// --- Latency ---
	let ltc = (`ltc: ${(Number(world.ltc) / 1_000_000).toFixed(2)}ms`);
	process.stdout.write('\n\n' + dimon + ltc + dimoff);
}

function interactive () {
	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);

	process.stdin.on('keypress', (_, key) => {
		const k = key.sequence;
		if (k === '\u0003') { process.exit(0); }
		else if (k === '\t') { ui.mode = ui.mode === 'edit' ? 'ctl' : 'edit'; }
		else if (ui.mode === 'edit' && k === 'h') { progressionHandler(k) }
		else if (ui.mode === 'edit' && k === 'l') { progressionHandler(k) }
		else if (ui.mode === 'ctl'  && k === 'h') { ctlHandler(k) }
		else if (ui.mode === 'ctl'  && k === 'l') { ctlHandler(k) }

		if (ui.ctl === 'deg' && k === 'k') degHandler(key.sequence);
		if (ui.ctl === 'deg' && k === 'j') degHandler(key.sequence);

		if (ui.ctl === 'qlt' && k === 'k') qltHandler(key.sequence);
		if (ui.ctl === 'qlt' && k === 'j') qltHandler(key.sequence);

		if (ui.ctl === 'pst' && k === 'k') pstHandler(key.sequence);
		if (ui.ctl === 'pst' && k === 'j') pstHandler(key.sequence);

		if (ui.ctl === 'tnc' && k === 'k') tncHandler(key.sequence);
		if (ui.ctl === 'tnc' && k === 'j') tncHandler(key.sequence);

		if (ui.ctl === 'oct' && k === 'k') octHandler(key.sequence);
		if (ui.ctl === 'oct' && k === 'j') octHandler(key.sequence);

		if (ui.ctl === 'len' && k === 'k') lenHandler(key.sequence);
		if (ui.ctl === 'len' && k === 'j') lenHandler(key.sequence);

		if (ui.ctl === 'add' && k === '\r') {
			const selected = { ...patch.progression[ui.progressionIndex] }

			patch.progression.splice(ui.progressionIndex, 0, selected);
			ui.progressionIndex += 1;
		}

		if (ui.ctl === 'del' && k === '\r' && patch.progression.length > 1) {
			patch.progression.splice(ui.progressionIndex, 1);
			ui.progressionIndex -= 1;
			if (ui.progressionIndex < 0) ui.progressionIndex = 0
		}

		draw();
	});

	draw();
}

function progressionHandler (key) {
	if (key === 'h')      { ui.progressionIndex -= 1 }
	else if (key === 'l') { ui.progressionIndex += 1 }

	if (ui.progressionIndex < 0) ui.progressionIndex = patch.progression.length - 1;
	if (ui.progressionIndex >= patch.progression.length) ui.progressionIndex = 0;
}

function ctlHandler (k) {
	const ctls = 'deg,qlt,len,pst,tnc,oct,add,del'.split(',');
	ui.ctl = select(ui.ctl, ctls,((k==='l'&&1) || (k==='h'&&-1) || 0));
}

function degHandler (k) {
	const degrees = 'I,bII,II,bIII,III,bIV,IV,bV,V,bVI,VI,bVII,VII'.split(',');
	const chord = patch.progression[ui.progressionIndex];
	const newDeg = select(chord.deg, degrees, ((k==='k'&&1) || (k==='j'&&-1) || 0));

	patch.presetDirty = true;
	patch.progression[ui.progressionIndex].deg = newDeg;
}

function qltHandler (k) {
	const qualities = [''].concat(QUALITIES);
	const chord = patch.progression[ui.progressionIndex];
	const newQlt = select(chord.qlt, qualities, ((k==='k'&&1) || (k==='j'&&-1) || 0));

	patch.presetDirty = true;
	patch.progression[ui.progressionIndex].qlt = newQlt;
}

function lenHandler (k) {
	const lengths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
	const beats = patch.progression[ui.progressionIndex].beats;
	const newBeats = select(beats, lengths, ((k==='k'&&1) || (k==='j'&&-1) || 0));

	patch.presetDirty = true;
	patch.progression[ui.progressionIndex].beats = newBeats;
}


function pstHandler (k) {
	patch.pstIndex += ((k==='k'&&1) || (k==='j'&&-1) || 0);
	if (patch.pstIndex < 0) patch.pstIndex = PROGRESSION_PRESETS.length - 1;
	if (patch.pstIndex >= PROGRESSION_PRESETS.length) patch.pstIndex = 0;

	patch.presetDirty = false;
	patch.progression = cloneDeep(PROGRESSION_PRESETS[patch.pstIndex].progression);
}

function tncHandler (k) {
	const tonics = 'A,B,C,D,E,F,G'.split(',');
	patch.tonic = select(patch.tonic, tonics, ((k==='k'&&1) || (k==='j'&&-1) || 0));
}

function octHandler (k) {
	const octaves = [0, 1, 2, 3, 4, 5, 6, 7, 8]
	patch.octave = select(patch.octave, octaves, ((k==='k'&&1) || (k==='j'&&-1) || 0));
}

function parseChord (chord) {
	const qrgx = QUALITIES.map(v => v.replace('+', '\\+')).join('|');
	const rgx = new RegExp(`^(?<deg>b?(I|II|III|IV|V|VI|VII))(?<qlt>(${qrgx})?)$`)
	const { groups } = chord.match(rgx);
	return groups;
}

function select (curr, choices, dir) {
	let currIndex = choices.indexOf(curr);
	currIndex += dir;
	if (currIndex < 0) currIndex = 0;
	if (currIndex >= choices.length) currIndex = choices.length - 1;

	return choices[currIndex];
}

interactive();
