import { useState, useMemo, useRef, useCallback } from "react";
import { getRowAt } from "../lib/cellularAutomata";

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

export function RowViewer({ rule, grid }) {
  const [rowIndexInput, setRowIndexInput] = useState("0");
  const [groupingInput, setGroupingInput] = useState("");
  const displayRef = useRef(null);

  const rowIndex = parseInt(rowIndexInput, 10); // base 10 parsing of user input for row index
  const isValid = !isNaN(rowIndex) && rowIndex >= 0; // check that row input is valid
  const grouping = parseInt(groupingInput, 10); // base 10 parsing of user input for grouping size
  const hasGrouping = !isNaN(grouping) && grouping >= 1; // check that grouping # input is valid

  const displayValue = useMemo(() => {
    // display dash if empty or user input is invalid
    if (!isValid) return "—";
    // get row from grid if user entered row already happens to have been calculated to display
    // else calculate row with getRowAt function from lib/cellularAutomata
    const row =
      rowIndex < grid.length ? grid[rowIndex] : getRowAt(rule, rowIndex);
    // format the row with bracket groupings
    return formatWithGrouping(row, hasGrouping ? grouping : 0);
  }, [rule, grid, rowIndex, isValid, hasGrouping, grouping]);

  const handleRowChange = (e) => setRowIndexInput(e.target.value);
  const handleGroupingChange = (e) => setGroupingInput(e.target.value);

  // when user navigates away from row input field
  const handleRowBlur = () => {
    // if empty reset to 0
    if (rowIndexInput === "") {
      setRowIndexInput("0");
      return;
    }
    // if invalid reset to 0
    const v = parseInt(rowIndexInput, 10);
    if (isNaN(v) || v < 0) {
      setRowIndexInput("0");
    }
  };

  // when user navigates away from grouping input field
  const handleGroupingBlur = () => {
    // if empty reset to empty
    if (groupingInput === "") return;
    // if invalid reset to empty
    const v = parseInt(groupingInput, 10);
    if (isNaN(v) || v < 1) {
      setGroupingInput("");
    }
  };

  // controlling when control + a is pressed in display box to select only the display box's contents
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

  return (
    <div className="row-viewer">
      <label htmlFor="row-input">Row:</label>
      <input
        id="row-input"
        type="number"
        min={0}
        value={rowIndexInput}
        onChange={handleRowChange}
        onBlur={handleRowBlur}
      />
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
      <div
        ref={displayRef}
        className="row-display"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {displayValue}
      </div>
    </div>
  );
}
