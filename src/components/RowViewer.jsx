import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { getRowAt } from "../lib/cellularAutomata";
import { WebMidi } from "webmidi";

// const DEFAULT_NOTES = [60, 62, 64, 65, 67, 69, 71, 72];
// const DEFAULT_NOTES_STRING = "60, 62, 64, 65, 67, 69, 71, 72";

const DEFAULT_NOTES = [54, 48, 50, 55, 52, 57, 60, 59];
const DEFAULT_NOTES_STRING = "54, 48, 50, 55, 52, 57, 60, 59";

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
  // lcm formula
  return (a * b) / gcd(a, b);
}

// display user's row of cellular automata as 0s 1s
// send midi notes based on row pattern of 0s 1s converted to user specified scale
export function RowViewer({ rule, grid }) {
  const [rowIndexInput, setRowIndexInput] = useState("0");
  const [groupingInput, setGroupingInput] = useState("");
  const [removeFromLeftInput, setRemoveFromLeftInput] = useState("0");
  const [removeFromRightInput, setRemoveFromRightInput] = useState("0");
  const [startIndexInput, setStartIndexInput] = useState("0");

  const rowIndex = parseInt(rowIndexInput, 10);
  const isValid = !isNaN(rowIndex) && rowIndex >= 0;
  const grouping = parseInt(groupingInput, 10);
  const hasGrouping = !isNaN(grouping) && grouping >= 1;

  // midi notes, tempo, midi out, etc
  const [notesInput, setNotesInput] = useState(DEFAULT_NOTES_STRING);
  const [tempoInput, setTempoInput] = useState("120"); // default tempo 120 BPM
  const [outputIndex, setOutputIndex] = useState(0);
  const [outputs, setOutputs] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [webMidiEnabled, setWebMidiEnabled] = useState(false);

  // useRef to store interval ID for sending MIDI notes, 
  // and for the display element to handle ctrl + A
  const intervalRef = useRef(null);
  const displayRef = useRef(null);

  // formatted output for user specified row, its length, and # of hits (1s)
  const { displayValue, rowLength, hitCount } = useMemo(() => {
    if (!isValid) {
      return { displayValue: "—", rowLength: 0, hitCount: 0 };
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
      displayValue: formatWithGrouping(row, hasGrouping ? grouping : 0),
      rowLength: row.length,
      hitCount: row.filter((c) => c === 1).length,
    };
  }, [ // useMemo dependencies
    rule,
    grid,
    rowIndex,
    isValid,
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
      setTempoInput("120");
      return;
    }
    const v = parseInt(tempoInput, 10);
    // NOT SURE IF I WANT TO LIMIT BPM TO 300...
    if (isNaN(v) || v < 1) setTempoInput("120");
    else if (v > 300) setTempoInput("300");
  };

  // check/set input when user leaves remove from left input box
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
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setIsSending(false);
      return;
    }

    // if user entered row index to send midi messages is not valid, return
    if (!isValid) return;

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
      // user entered tempo BPM defaults to 120, min 1, max 300
      // NOT SURE IF I WANT MAX 300 OR CAN MAKE LARGER
      const tempo = Math.max(1, Math.min(300, parseInt(tempoInput, 10) || 120));
      // NOT SURE THAT I LIKE HOW THE TEMPO IS BEING HANDLED, IT SEEMS SLOW
      // I DON'T SEE MUCH DIFFERENCE WHEN ADJUSTING WHAT TEMPO IS MULTIPLIED BY
      // ARE THE NOTES BEING RECEIVED BY THE OTHER APPLICATION WITH THE CORRECT TIMING?
      const stepMs = 60_000 / (tempo * 4); // 16th notes
      // const stepMs = 60_000 / (tempo * 0.25); 

      let rowStepIndex = 0;
      let noteIndex = 0;

      setIsSending(true);
      // set interval for when midi note will be sent
      intervalRef.current = setInterval(() => {
        // send a midi note only when the cell value is 1
        if (row[rowStepIndex] === 1) {
          // get note from notes array of possible notes
          const note = notes[noteIndex % notes.length];
          // WebMidi.outputs[index_of_output_device].playNote method
          // 1st param: note can be like "C4" or 0-127
          // other options available: duration, channels, attack, rawAttack, release, rawRelease, time 
          output.playNote(note, { duration: stepMs });
          // increment note index to play next note of user's notes array
          noteIndex = (noteIndex + 1) % notes.length;
        }
        // increment row step index to go to next cell of row to play
        rowStepIndex = (rowStepIndex + 1) % row.length;
      }, stepMs);
    } catch (err) {
      console.error("WebMidi error:", err);
      setIsSending(false);
    }
  }, [ 
    isSending,
    isValid,
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

  // cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // when user navigates away from notes input box
  const handleNotesBlur = () => {
    const trimmed = notesInput.trim();
    // set notes as default notes if input is blank
    if (trimmed === "") {
      setNotesInput(DEFAULT_NOTES_STRING);
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
    if (valid.length === 0) setNotesInput(DEFAULT_NOTES_STRING);
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
        {displayValue}
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
          {isValid ? rowLength : "—"}
        </span>
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

      <div className="midi-controls">
        <div className="midi-row-notes-tempo">
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
              isValid && hitCount > 0 ? lcmVal / hitCount : null;
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
                <span className="row-meta-value">{isValid ? hitCount : "—"}</span>
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
            disabled={!isValid}
          >
            {isSending ? "STOP" : "SEND MIDI"}
          </button>
        </div>
      </div>
    </div>
  );
}
