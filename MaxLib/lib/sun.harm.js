//////// Max Initialisation
inlets = 1;

//////// library functions
var lib;

//////// Declare JS vars
var _basenote;
var _basefreq;
var _numbag;
var _denombag;
var _rng;
var _chordnotes;
var _ratio_set;
var _held_note_set;
var _octave_range;
var _all_candidates;
var _notetrig;
var _chordtrig;
var _seedtrig;
var _octaves_up;
var _octaves_down;
var _bagsize;

function loadbang() {
  //Init global vars in this function to ease debugging.
  //You might need to retrigger init by sending a loadbang msg.
  
  //////// library functions
  lib = {}
  
  sun_include(lib, "sun.library.js");
  
  //////// assign inititals values to JS vars
  _basenote = 69;
  _basefreq = 440;
  _numbag = new Object;
  _numbag.weights = new Array;
  _numbag.val = new Array;
  _denombag = new Object;
  _denombag.weights = new Array;
  _denombag.val = new Array;
  _rng = new lib.PseudoRandom();
  _chordnotes = 0;
  _ratio_set = new Array;
  _held_note_set = new Array;
  _octave_range = [0,0];
  _all_candidates;
  _notetrig = true;
  _chordtrig = false;
  _seedtrig = false;
  _octaves_up = 0;
  _octaves_down = 0;
  
  
  //we choose a bag size so we can set default contents
  _bagsize = 3;
  
  if (jsarguments.length >=2) {
    _bagsize = jsarguments[1];
  }
  for (var i=0; i < _bagsize; i++) {
    _numbag.weights[i] = 0;
    _numbag.val[i] = 1;
    _denombag.weights[i] = 0;
    _denombag.val[i] = 1;
  }
}
/////// handling messages
// number lists are presumed to be MIDI notes
function base(note) {
  _maintain_basenote(note);
  if (_notetrig) { bang();};
}
// numerator val or weights lists
function num() {
  var ar = arrayfromargs(arguments);
  _handle_bag_poking(_numbag, ar);
}
// denominator val or weights lists
function denom() {
  var ar = arrayfromargs(arguments);
  _handle_bag_poking(_denombag, ar);
}
// scale ranges
function up(dist) {
  _octaves_up = Math.floor(dist);
};
function down(dist) {
  _octaves_down = Math.floor(dist);
};
//PRNG seeding
function seed(seed) {
  _rng = new lib.PseudoRandom(seed);
  if (_seedtrig) { bang(); };
};

//actually generate a new pitch set
function bang() {
  var new_note_set;
  _ratio_set = _generate_ratio_set();
  new_note_set = _squash_ratio_set_to_midi(_ratio_set);
  _play_notes(new_note_set);
};
function chordnotes(num) {
  _chordnotes = num;
  if (_chordtrig) { bang();};
}
function chordtrig(bool) {
  if (bool) { _chordtrig = true; }
  else { _chordtrig = false; };
}
function notetrig(bool) {
  if (bool) { _notetrig = true; }
  else { _notetrig = false; };
}
function seedtrig(bool) {
  if (bool) { _seedtrig = true; }
  else { _seedtrig = false; };
}
function pause() {
  //transport stopped. halt all hung notes
  for (var note in _held_note_set) {
    _stop_note(note);
  };
}
function play() {
  //transport resumed. retrigger notes?
}
/////// internal logic

function _handle_bag_poking(which_bag, ar) {
  //break bag refernce into pieces:
  var selector = ar[0];
  ar = ar.slice(1);
  if (selector==='weight') {
    _maintain_ratiobag_weights(ar, which_bag);
  } else if (selector==='val') {
    _maintain_ratiobag_val(ar, which_bag);
  } else {
    throw("unknown selector " + selector);
  }
}
function _maintain_basenote(note) {
  _basenote = note;
  _basefreq = lib.mtof(_basenote);
};

function _maintain_ratiobag_weights(list, bag) {
  bag.weights[list[0]] = list[1];
};

function _maintain_ratiobag_val(list, bag) {
  bag.val[list[0]] = list[1];
};

function _generate_ratio_set() {
  var new_pitch_set = new Array;
  var num_cdf;
  var denom_cdf;
  var num;
  var denom;
  
  num_cdf = lib.cdf(_numbag.weights);
  denom_cdf = lib.cdf(_denombag.weights);
  
  if (num_cdf === null || denom_cdf === null) {
    // generate empty note array if our weights are 0
    post("bailed- no weights array");
    post();
    return [];
  }
  for (var i=0; i < _chordnotes; i++) {
    num = _numbag.val[lib.index_cdf(num_cdf, _rng.random())];
    denom = _denombag.val[lib.index_cdf(denom_cdf, _rng.random())];
    new_pitch_set.push([num, denom]);
  };
  return new_pitch_set;
};
function _squash_ratio_set_to_midi(ratio_set) {
  //convert ratios to MIDI notes. May involve shrinking note list.
  //handling octave wrapping is easy in MIDI domain so we do it here
  var note_set = {};
  var note_list = ratio_set.map(function(xy) {
    var octavise = 0;
    octavise = 12 * _rng.randint(_octaves_down, _octaves_up + 1);
    var candidate_note = lib.real_modulo(
      Math.floor(lib.ftom((xy[0]/xy[1]) * _basefreq) + 0.5) - _basenote,
      12
    ) + _basenote + octavise;
    if (candidate_note>127) {
      candidate_note = candidate_note - 12 * Math.ceil((candidate_note-127)/12);
    } else if (candidate_note<0) {
      candidate_note = candidate_note - 12 * Math.floor(candidate_note/12);
    }
    return candidate_note;
  });
  note_list.forEach(function(val, idx) {
    note_set[val] = true;
  });
  return note_set;
};
function _play_notes(new_note_set) {
  var notes_to_stop = [];
  var notes_to_start = [];
  for (var note in new_note_set) {
    if (!_held_note_set.hasOwnProperty(note)) {
      notes_to_start.push(note);
    };
  };
  for (var note in _held_note_set) {
    if (!new_note_set.hasOwnProperty(note)) {
      notes_to_stop.push(note);
    };
  };
  notes_to_start.forEach(_start_note);
  notes_to_stop.forEach(_stop_note);
};

function _start_note(note) {
  //if the given note is not playing already, play it.
  outlet(0, +note, 100);
  _held_note_set[note] = 100;
}
function _stop_note(note) {
  //if the given note is playing, stop it.
  outlet(0, +note, 0);
  delete _held_note_set[note];
}
