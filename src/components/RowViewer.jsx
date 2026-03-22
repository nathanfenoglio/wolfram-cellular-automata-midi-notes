import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { getRowAt } from "../lib/cellularAutomata";
import { SCALES } from "../lib/scales";
import { WebMidi } from "webmidi";

const DEFAULT_NOTES = [54, 48, 50, 55, 52, 57, 60, 59];
const DEFAULT_NOTES_STRING = "54, 48, 50, 55, 52, 57, 60, 59";

const SCHEDULER_LOOK_AHEAD_SEC = 0.1; // how far ahead midi notes will be scheduled in the while loop in runScheduler
const SCHEDULER_TICK_MS = 25; // how often rowScheduler is called

// format output of user specified row # with commas and brackets at specified user interval
// could take this output and use as midi output to send to daw perhaps
function formatWithGrouping(row, groupSize) {
  if (!groupSize || groupSize < 1) return row.join(", ");
  const chunks = [];
  for (let i = 0; i < row.length; i += groupSize) {
    const chunk = row.slice(i, i + groupSize);
    chunks.push("[" + chunk.join(", ") + "]");
  }
  return chunks.join(", ");
}

// cyclic rotation of 0s 1s row array
function rotateRowByStartIndex(row, startIndex) {
  const n = row.length;
  if (n === 0) return row;
  // if negative startIndex, 
  // then (startIndex % n) will be just like the positive version 
  // (whatever the remainder is) but with a negative sign 
  // so then it will be within the n range (# of cells in row)
  // and can add the # of cells in a row (n) to it 
  // to get to the positive representation of the index counting from the end of the array
  const k = ((startIndex % n) + n) % n;
  if (k === 0) return row;
  // return original row starting at calculated start index k to end
  // concatenated with the beginning of the array up to the calculated start index k
  return [...row.slice(k), ...row.slice(0, k)];
}

// parse comma-separated MIDI note values, return default notes if empty or invalid
function parseNotesInput(input) {
  if (!input || typeof input !== "string") return DEFAULT_NOTES;
  // get all notes parsed as base 10 integer 
  const parts = input.split(",").map((s) => parseInt(s.trim(), 10));
  // filter out any nans or note values outside of the 128 possible midi notes
  const valid = parts.filter(
    (n) => !isNaN(n) && n >= 0 && n <= 127
  );
  return valid.length > 0 ? valid : DEFAULT_NOTES;
}

// least common multiple of 2 #s
function lcm(a, b) {
  if (a === 0 || b === 0) return 0;
  // recursive function to get greatest common divisor
  // if 1st # is less than y then x % y = x and then x and y will be swapped for the next iteration
  // making it so that you don't need to worry about making the 1st # the larger of the 2 originally
  // if x % y = 0 then you have found the greatest common divisor and y which will be x in the next iteration 
  // y will be 0 and x will be the gcd 
  const gcd = (x, y) => (y === 0 ? x : gcd(y, x % y));
  // least common multiple will be the product of the 2 #s divided by their greatest common divisor
  // lcm formula
  return (a * b) / gcd(a, b);
}

// display user's row of cellular automata as 0s 1s and all sorts of other data and controls for user to manipulate
// send midi notes based on row pattern of 0s 1s converted to user specified scale
export function RowViewer({ rule, grid, isSending, setIsSending }) {
  const [rowIndexInput, setRowIndexInput] = useState("0");
  const [groupingInput, setGroupingInput] = useState("");
  const [removeFromLeftInput, setRemoveFromLeftInput] = useState("0");
  const [removeFromRightInput, setRemoveFromRightInput] = useState("0");
  const [startIndexInput, setStartIndexInput] = useState("0");

  const rowIndex = parseInt(rowIndexInput, 10);
  const isValidRow = !isNaN(rowIndex) && rowIndex >= 0;
  const grouping = parseInt(groupingInput, 10);
  const hasGrouping = !isNaN(grouping) && grouping >= 1;

  // midi notes, tempo, midi out, etc
  const [notesInput, setNotesInput] = useState(DEFAULT_NOTES_STRING);
  const [scaleSelection, setScaleSelection] = useState(""); // dropdown menu scale selection
  const [tempoInput, setTempoInput] = useState("240"); // default tempo 240 BPM
  const [outputIndex, setOutputIndex] = useState(0); // midi output index from user's available outputs to send midi messages to
  const [outputs, setOutputs] = useState([]); // all available midi outputs from user's device
  const [webMidiEnabled, setWebMidiEnabled] = useState(false); // user must enable WebMidi to allow the browser to access midi devices and send midi messages 

  // refs for midi scheduler and audio context 
  // so that they can be accessed and modified inside the runScheduler function 
  // and cleanup function in useEffect 
  // without needing to include them in the dependencies of the useCallback for the runScheduler function  
  // which would cause it to be recreated on every render 
  // which would cause problems for the timing of the scheduler and midi messages being sent
  const displayRef = useRef(null);
  const audioContextRef = useRef(null);
  const schedulerTimeoutRef = useRef(null);
  const schedulerRef = useRef(null);

  // get or create audio context from the browser
  function getAudioContext() {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  }

  // looping function every SCHEDULER_TICK_MS 
  // called in handleSendStop function when user selects to send midi 
  function runScheduler() {
    // get scheduler refs current values 
    // isRunning, nextStepTime, rowStepIndex, noteIndex, row, notes, stepMs, output
    const s = schedulerRef.current;
    if (!s || !s.isRunning) return;

    const ctx = getAudioContext(); // get or create audio context
    const nowSec = ctx.currentTime;
    // calculate horizon time for scheduling as many notes in that time frame
    const horizonSec = nowSec + SCHEDULER_LOOK_AHEAD_SEC;

    // schedule as many midi notes as the recalculated each cycle nextStepTime
    // is within the 0.1 second window
    // SCHEDULER_TICK_MS is 0.25 so will look ahead 4x as far for each tick
    // creating a sort of buffer to always be able to schedule the note(s) to be played at the correct time
    // even if browser is busy
    while (s.nextStepTime < horizonSec) {
      // nextStepTime was calculated based on how long the previous note would take to play
      const stepTime = s.nextStepTime;
      const { row, notes, stepMs, output, rowStepIndex, noteIndex } = s;

      if (row[rowStepIndex] === 1) {
        const note = notes[noteIndex % notes.length];
        // calculate difference in the time to play next note and now
        const delayMs = Math.max(0, (stepTime - nowSec) * 1000);
        try {
          // send play note message with time to play in future by delayMs
          output.playNote(note, { duration: stepMs, time: `+${Math.round(delayMs)}` });
        } catch (e) {
          console.error("playNote failed:", e);
        }
        // set next note index for next note
        s.noteIndex = (noteIndex + 1) % notes.length;
      }

      // set next row step index (next hit or rest in time) 
      s.rowStepIndex = (rowStepIndex + 1) % row.length;
      // calculate next step's time to wait on how long this note will take to play 
      s.nextStepTime += stepMs / 1000;
    }

    // run function every specified SCHEDULER_TICK_MSs
    if (s.isRunning) {
      schedulerTimeoutRef.current = setTimeout(runScheduler, SCHEDULER_TICK_MS);
    }
  }

  // formatted output for user specified row, its length, and # of hits (1s)
  const { displayRow0s1s, rowLength, hitCount } = useMemo(() => {
    if (!isValidRow) {
      return { displayRow0s1s: "—", rowLength: 0, hitCount: 0 };
    }
    let row =
      rowIndex < grid.length ? grid[rowIndex] : getRowAt(rule, rowIndex);
    
    // if user specified to remove notes (the 0s 1s not the midi note values)
    // from the left or right, remove elements from the left or right of row
    const trimLeft = Math.max(0, parseInt(removeFromLeftInput, 10) || 0);
    const trimRight = Math.max(0, parseInt(removeFromRightInput, 10) || 0);
    row = row.slice(trimLeft, trimRight > 0 ? -trimRight : undefined);

    // cyclically rotate row array to user's specified start index
    const startIndex = parseInt(startIndexInput, 10) || 0;
    row = rotateRowByStartIndex(row, startIndex);

    return {
      displayRow0s1s: formatWithGrouping(row, hasGrouping ? grouping : 0),
      rowLength: row.length,
      hitCount: row.filter((c) => c === 1).length,
    };
  }, [ // useMemo dependencies
    rule,
    grid,
    rowIndex,
    isValidRow,
    hasGrouping,
    grouping,
    removeFromLeftInput,
    removeFromRightInput,
    startIndexInput,
  ]);

  // input onChange handlers
  const handleRowChange = (e) => setRowIndexInput(e.target.value);
  const handleGroupingChange = (e) => setGroupingInput(e.target.value);
  const handleNotesChange = (e) => setNotesInput(e.target.value);
  const handleTempoChange = (e) => setTempoInput(e.target.value);

  // set notes to value in SCALES dictionary for user selected scale
  const handleScaleSelect = (e) => {
    const scaleName = e.target.value;
    setScaleSelection(scaleName);
    if (scaleName && SCALES[scaleName]) {
      const notes = SCALES[scaleName];
      setNotesInput(notes.join(", "));
    }
  };

  // transpose all notes down by 1 when user presses button
  const handleTransposeDown = () => {
    const notes = parseNotesInput(notesInput);
    if (notes.length === 0) return;
    // do not allow trasnpsing down past note 0
    if (Math.min(...notes) === 0) return;
    const newNotes = notes.map((n) => n - 1);
    setNotesInput(newNotes.join(", "));
  };

  // transpose all notes up by 1 when user presses button
  const handleTransposeUp = () => {
    const notes = parseNotesInput(notesInput);
    if (notes.length === 0) return;
    // do not allow transposing up past note 127
    if (Math.max(...notes) === 127) return;
    const newNotes = notes.map((n) => n + 1);
    setNotesInput(newNotes.join(", "));
  };

  // check/set input when user leaves row index input box
  const handleRowBlur = () => {
    if (rowIndexInput === "") {
      setRowIndexInput("0");
      return;
    }
    const v = parseInt(rowIndexInput, 10);
    if (isNaN(v) || v < 0) setRowIndexInput("0");
  };

  // check/set input when user leaves grouping input box
  const handleGroupingBlur = () => {
    if (groupingInput === "") return;
    const v = parseInt(groupingInput, 10);
    if (isNaN(v) || v < 1) setGroupingInput("");
  };

  // check/set input when user leaves tempo input box
  const handleTempoBlur = () => {
    if (tempoInput === "") {
      setTempoInput("240");
      return;
    }
    const v = parseInt(tempoInput, 10);
    // NOT SURE IF I WANT TO LIMIT BPM TO 300...
    if (isNaN(v) || v < 1) setTempoInput("240");
    else if (v > 300) setTempoInput("300");
  };

  // check/set input when user leaves "remove from left" input box
  const handleRemoveFromLeftBlur = () => {
    if (removeFromLeftInput === "") {
      setRemoveFromLeftInput("0");
      return;
    }
    const v = parseInt(removeFromLeftInput, 10);
    if (isNaN(v) || v < 0) setRemoveFromLeftInput("0");
  };

  // check/set input when user leaves remove from right input box
  const handleRemoveFromRightBlur = () => {
    if (removeFromRightInput === "") {
      setRemoveFromRightInput("0");
      return;
    }
    const v = parseInt(removeFromRightInput, 10);
    if (isNaN(v) || v < 0) setRemoveFromRightInput("0");
  };

  // check/set input when user leaves start index input box
  const handleStartIndexBlur = () => {
    if (startIndexInput === "") {
      setStartIndexInput("0");
      return;
    }
    const v = parseInt(startIndexInput, 10);
    if (isNaN(v)) setStartIndexInput("0");
  };

  // work around to have ctrl + a highlight all of only the row output box
  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      e.preventDefault();
      e.stopPropagation();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(displayRef.current);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  // start or stop sending of midi notes 
  const handleSendStop = useCallback(async () => {
    // stop sending if currently sending
    if (isSending) {
      if (schedulerRef.current) schedulerRef.current.isRunning = false;
      if (schedulerTimeoutRef.current) {
        clearTimeout(schedulerTimeoutRef.current);
        schedulerTimeoutRef.current = null;
      }
      setIsSending(false);

      // send note-off for any notes in notes array that may still be sounding
      try {
        const output = WebMidi.outputs[outputIndex];
        if (output) {
          const notes = parseNotesInput(notesInput);
          for (const note of notes) {
            output.stopNote(note);
          }
        }
      } catch (err) {
        console.error("WebMidi note-off on stop:", err);
      }
      return;
    }

    // if user entered row index to send midi messages is not valid, return
    if (!isValidRow) return;

    try {
      if (!webMidiEnabled) {
        // user must manually grant permission
        await WebMidi.enable();
        setWebMidiEnabled(true);
        // get available midi outputs from user's device
        setOutputs([...WebMidi.outputs]);
      }

      const output = WebMidi.outputs[outputIndex]; // outputIndex is initially 0
      if (!output) {
        console.warn("No MIDI output selected");
        return;
      }

      // if visual of grid has already been calculated for row, just grab it
      // otherwise calculate from cellularAutomata.js getRowAt function
      let row =
        rowIndex < grid.length ? grid[rowIndex] : getRowAt(rule, rowIndex);

      // remove elements from beginning and/or end of row if user specified
      const trimLeft = Math.max(0, parseInt(removeFromLeftInput, 10) || 0);
      const trimRight = Math.max(0, parseInt(removeFromRightInput, 10) || 0);
      row = row.slice(trimLeft, trimRight > 0 ? -trimRight : undefined);

      // cyclically rotate row array to user's specified start index
      const startIndex = parseInt(startIndexInput, 10) || 0;
      row = rotateRowByStartIndex(row, startIndex);

      // user entered scale to cycle through
      const notes = parseNotesInput(notesInput);
      // user entered tempo BPM defaults to 240, min 1, max 300
      // NOT SURE IF I WANT MAX 300 OR CAN MAKE LARGER
      // IDK MIGHT SET IT WAY LOWER I DON'T SEEM TO RUN INTO TROUBLE WITH LOOP BE MIDI <= 170 BPM
      // OR MAY CHANGE FROM 16TH NOTES TO 8TH NOTES
      // THEN I SUPPOSE THE SAFE MAX WOULD BE <= 340 
      const tempo = Math.max(1, Math.min(300, parseInt(tempoInput, 10) || 240));
      // NOT SURE THAT I LIKE HOW THE TEMPO IS BEING HANDLED, IT SEEMS SLOW
      // I DON'T SEE MUCH DIFFERENCE WHEN ADJUSTING WHAT TEMPO IS MULTIPLIED BY
      // ARE THE NOTES BEING RECEIVED BY THE OTHER APPLICATION WITH THE CORRECT TIMING?
      // const stepMs = 60_000 / (tempo * 4); // 16th notes
      const stepMs = 60_000 / (tempo * 2); // 8th notes
      // const stepMs = 60_000 / (tempo * 0.25); 

      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // set initial values of schedulerRef to get the loop going
      schedulerRef.current = {
        isRunning: true,
        nextStepTime: ctx.currentTime,
        rowStepIndex: 0,
        noteIndex: 0,
        row,
        notes,
        stepMs,
        output,
      };

      setIsSending(true);
      // run midi note send scheduler loop
      runScheduler();
    } catch (err) {
      console.error("WebMidi error:", err);
      setIsSending(false);
    }
  }, [
    isSending,
    setIsSending,
    isValidRow,
    webMidiEnabled,
    outputIndex,
    rule,
    grid,
    rowIndex,
    notesInput,
    tempoInput,
    removeFromLeftInput,
    removeFromRightInput,
    startIndexInput,
  ]);
  // dependencies for useCallback, includes everything that is used inside the function that comes from outside the function scope
  // will recreate the function if any of these dependencies change, otherwise will reuse the same function instance

  // reset start index when rule or row index changes
  useEffect(() => {
    setStartIndexInput("0");
  }, [rule, rowIndexInput]);

  useEffect(() => {
    // useEffect with no dependencies fires once when the component loads
    // a return function is fired once when the component unmounts
    // so this will clear the audio context when the app is closed
    return () => {
      if (schedulerRef.current) schedulerRef.current.isRunning = false;
      if (schedulerTimeoutRef.current) {
        clearTimeout(schedulerTimeoutRef.current);
        schedulerTimeoutRef.current = null;
      }
      if (audioContextRef.current?.state !== "closed") {
        audioContextRef.current?.close();
      }
    };
  }, []);

  // when user navigates away from notes input box
  const handleNotesBlur = () => {
    const trimmed = notesInput.trim();
    // set notes as default notes if input is blank
    if (trimmed === "") {
      setNotesInput(DEFAULT_NOTES_STRING);
      setScaleSelection("");
      return;
    }
    // validate note array input
    // split at comma (requires user to be responsible for entering comma separated note values)
    // discard any nans or note values not in (0-127)
    const valid = trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n) && n >= 0 && n <= 127);
    if (valid.length === 0) {
      setNotesInput(DEFAULT_NOTES_STRING);
    }
  };

  // randomize order of notes when user presses button
  const handleRandomizeNotes = () => {
    const notes = parseNotesInput(notesInput);
    // for each note swap with another random note already in notes
    for (let i = notes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [notes[i], notes[j]] = [notes[j], notes[i]];
    }
    setNotesInput(notes.join(", "));
  };

  return (
    <div className="row-viewer">
      {/* user input for row to display as 0s 1s and send as midi */}
      <label htmlFor="row-input">Row:</label>
      <input
        id="row-input"
        type="number"
        min={0}
        value={rowIndexInput}
        onChange={handleRowChange}
        onBlur={handleRowBlur}
      />
      {/* user input for # of notes to group with brackets */}
      <label htmlFor="grouping-input">Group:</label>
      <input
        id="grouping-input"
        type="number"
        min={1}
        placeholder="—"
        value={groupingInput}
        onChange={handleGroupingChange}
        onBlur={handleGroupingBlur}
      />
      {/* 0s 1s display of rule */}
      <div
        ref={displayRef}
        className="row-display"
        tabIndex={0}
        // ctrl + a to highlight just this field work around
        onKeyDown={handleKeyDown}
      >
        {displayRow0s1s}
      </div>
      
      {/* cyclically rotate row 0s 1s array to user specified start index */}
      <div className="start-index-controls">
        <label htmlFor="start-index-input">start index</label>
        <input
          id="start-index-input"
          type="number"
          value={startIndexInput}
          onChange={(e) => setStartIndexInput(e.target.value)}
          onBlur={handleStartIndexBlur}
        />
      </div>

      {/* display # of cells in row 
      (will be the # of 16th notes (or however you think about the note values) before repeat) */}
      <div className="row-length-controls">
        <label className="row-length-label"># row cells</label>
        <span className="row-length-value">
          {isValidRow ? rowLength : "—"}
        </span>
        {/* remove from left/remove from right */}
        <div className="remove-from-left-right-controls">
          {/* user input for how many notes to remove from left */}
          <label htmlFor="remove-left-input">remove from left</label>
          <input
            id="remove-left-input"
            type="number"
            min={0}
            value={removeFromLeftInput}
            onChange={(e) => setRemoveFromLeftInput(e.target.value)}
            onBlur={handleRemoveFromLeftBlur}
          />
          {/* user input for how many notes to remove from right */}
          <label htmlFor="remove-right-input">remove from right</label>
          <input
            id="remove-right-input"
            type="number"
            min={0}
            value={removeFromRightInput}
            onChange={(e) => setRemoveFromRightInput(e.target.value)}
            onBlur={handleRemoveFromRightBlur}
          />
        </div>
      </div>

      <div className="midi-controls">
        <div className="midi-row-scale-select">
          {/* scale selection dropdown menu */}
          <label htmlFor="scale-select">Scale:</label>
          <select
            id="scale-select"
            className="scale-select"
            value={scaleSelection}
            onChange={handleScaleSelect}
          >
            <option value="">Select a scale...</option>
            {Object.keys(SCALES).sort().map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="midi-row-notes-tempo">
          {/* MIDI notes input */}
          <label htmlFor="notes-input">MIDI notes:</label>
          <input
            id="notes-input"
            type="text"
            className="notes-input"
            placeholder={DEFAULT_NOTES_STRING}
            value={notesInput}
            onChange={handleNotesChange}
            onBlur={handleNotesBlur}
          />
          {/* transpose midi notes up/down buttons */}
          <div className="midi-transpose-controls">
            {/* transpose */}
            <label>transpose:</label>
            {/* transpose midi notes down arrow button */}
            <button
              type="button"
              className="transpose-btn transpose-down-btn"
              onClick={handleTransposeDown}
              aria-label="Transpose down"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 11L3 6h10l-5 5z" />
              </svg>
            </button>
            {/* transpose midi notes up arrow button */}
            <button
              type="button"
              className="transpose-btn transpose-up-btn"
              onClick={handleTransposeUp}
              aria-label="Transpose up"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 5l5 5H3l5-5z" />
              </svg>
            </button>
          </div>
          {/* Tempo (BPM) */}
          <label htmlFor="tempo-input">Tempo (BPM):</label>
          <input
            id="tempo-input"
            type="number"
            min={1}
            max={300}
            className="tempo-input"
            value={tempoInput}
            onChange={handleTempoChange}
            onBlur={handleTempoBlur}
          />
        </div>
        {/* option for user to randomize the order of the midi notes */}
        <div className="randomize-and-cycle-data">
          {(() => {
            const notesCount = parseNotesInput(notesInput).length;
            const lcmVal = lcm(hitCount, notesCount);
            // divide least common multiple of # of hits and # of notes
            // by the # of hits to get 
            // the # of times before the 1st note of the sequence will start on the 1st hit of the row
            const repeatsAfter =
              isValidRow && hitCount > 0 ? lcmVal / hitCount : null;
            return (
              <>
                <button
                  type="button"
                  className="randomize-notes-button"
                  onClick={handleRandomizeNotes}
                >
                  randomize notes order
                </button>
                <label className="row-meta-label"># hits</label>
                <span className="row-meta-value">{isValidRow ? hitCount : "—"}</span>
                <label className="row-meta-label"># notes in seq</label>
                <span className="row-meta-value">{notesCount}</span>
                <label className="row-meta-label">repeats after</label>
                <span className="row-meta-value">
                  {repeatsAfter != null ? repeatsAfter : "—"}
                </span>
              </>
            );
          })()}
        </div>
        <div className="midi-row-output-send">
          <label htmlFor="output-select">Output:</label>
          <select
            id="output-select"
            className="output-select"
            value={outputIndex}
            onChange={(e) => setOutputIndex(Number(e.target.value))}
            disabled={!webMidiEnabled || outputs.length === 0}
          >
            {outputs.length === 0 ? (
              <option value={0}>
                {webMidiEnabled ? "No outputs" : "Click SEND MIDI first"}
              </option>
            ) : (
              outputs.map((out, i) => (
                <option key={out.id} value={i}>
                  {out.name || out.id || `Output ${i}`}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            className="send-midi-button"
            onClick={handleSendStop}
            disabled={!isValidRow}
          >
            {isSending ? "STOP" : "SEND MIDI"}
          </button>
        </div>
      </div>
    </div>
  );
}
