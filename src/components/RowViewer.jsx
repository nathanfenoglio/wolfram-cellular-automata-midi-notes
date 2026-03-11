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

// display user's row of cellular automata as 0s 1s
// send midi notes based on row pattern of 0s 1s converted to user specified scale
export function RowViewer({ rule, grid }) {
  const [rowIndexInput, setRowIndexInput] = useState("0");
  const [groupingInput, setGroupingInput] = useState("");

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

  // formatted output for user specified row 
  const displayValue = useMemo(() => {
    if (!isValid) return "—";
    const row =
      rowIndex < grid.length ? grid[rowIndex] : getRowAt(rule, rowIndex);
    return formatWithGrouping(row, hasGrouping ? grouping : 0);
  }, [rule, grid, rowIndex, isValid, hasGrouping, grouping]);

  // input onChange handlers
  const handleRowChange = (e) => setRowIndexInput(e.target.value);
  const handleGroupingChange = (e) => setGroupingInput(e.target.value);
  const handleNotesChange = (e) => setNotesInput(e.target.value);
  const handleTempoChange = (e) => setTempoInput(e.target.value);

  // check input when user leaves row index input box
  const handleRowBlur = () => {
    if (rowIndexInput === "") {
      setRowIndexInput("0");
      return;
    }
    const v = parseInt(rowIndexInput, 10);
    if (isNaN(v) || v < 0) setRowIndexInput("0");
  };

  // check input when user leaves grouping input box
  const handleGroupingBlur = () => {
    if (groupingInput === "") return;
    const v = parseInt(groupingInput, 10);
    if (isNaN(v) || v < 1) setGroupingInput("");
  };

  // check input when user leaves tempo input box
  const handleTempoBlur = () => {
    if (tempoInput === "") {
      setTempoInput("120");
      return;
    }
    const v = parseInt(tempoInput, 10);
    if (isNaN(v) || v < 1) setTempoInput("120");
    else if (v > 300) setTempoInput("300");
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
      const row =
        rowIndex < grid.length ? grid[rowIndex] : getRowAt(rule, rowIndex);
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
  ]); 
  // dependencies for useCallback, includes everything that is used inside the function that comes from outside the function scope
  // will recreate the function if any of these dependencies change, otherwise will reuse the same function instance

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
