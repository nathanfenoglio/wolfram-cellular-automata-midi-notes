import { useState, useCallback, useEffect } from "react";
import { RuleSelector } from "./components/RuleSelector";
import { GridDisplay } from "./components/GridDisplay";
import { RuleVisualization } from "./components/RuleVisualization";
import { Controls } from "./components/Controls";
import { RowViewer } from "./components/RowViewer";
import {
  applyRule,
  createInitialGrid,
  getReverseRule,
  getSwapBlackWhite,
  getReverseSwapBlackWhite,
} from "./lib/cellularAutomata";
import "./App.css";

function App() {
  const initialRule = 30; // default rule 30
  const [rule, setRule] = useState(initialRule); 
  // could add option for user to seed original row with whatever values they desire...
  const [grid, setGrid] = useState(() => createInitialGrid()); // initialize grid with single cell which is 1
  const [mirrorRule, setMirrorRule] = useState();
  const [blackWhiteSwappedRule, setBlackWhiteSwappedRule] = useState();
  const [reverseSwapBlackWhiteRule, setReverseSwapBlackWhiteRule] = useState();
  const [isSending, setIsSending] = useState(false);

  // reset grid when user changes rule
  const handleRuleChange = useCallback((newRule) => {
    setRule(newRule);
    setGrid(createInitialGrid());

    const mirrorRule = getReverseRule(newRule);
    setMirrorRule(mirrorRule);

    const blackWhiteSwappedRule = getSwapBlackWhite(newRule);
    setBlackWhiteSwappedRule(blackWhiteSwappedRule);

    const reverseSwapBlackWhiteRule = getReverseSwapBlackWhite(newRule);
    setReverseSwapBlackWhiteRule(reverseSwapBlackWhiteRule);
  }, []);

  // apply rule adding row to grid displayed
  const handleStep = useCallback(() => {
    setGrid((prev) => applyRule(prev, rule));
  }, [rule]);

  const handleReset = useCallback(() => {
    setGrid(createInitialGrid());
  }, []);

  // calculate and display initial rule equivalence rules when page loads
  useEffect(() => {
    handleRuleChange(initialRule);
  }, [handleRuleChange]);

  return (
    <div className="app">
      {/* rule input, step/reset controls, auto run option, display row 0, 1s */}
      <header className="header">
        <h1>1D Cellular Automata Midi Sequencer</h1>
        {/* <h1>Midi Note Sequencer</h1> */}
        <RuleSelector value={rule} onChange={handleRuleChange} />
        {/* visual display of the rule showing all of the possible previous row 3 cell configurations and the outcome cell value of the rule  */}
        <RuleVisualization rule={rule} />
      </header>
      {/* visual step, reset, auto-run controls */}
      <div className="header2-visual">
        <div className="header2-container">
          <Controls
            onStep={handleStep}
            onReset={handleReset}
            isSending={isSending}
          />
        </div>
      </div>
      
      {/* row input, note grouping input, display specified row, */}
      {/* midi note scale input, tempo input, midi output selection, send midi button */}
      <div className="header2-visual">
        <div className="header2-container"> 
          {/* pass midi note isSending and setIsSending to RowViewer */}
          <RowViewer
            rule={rule}
            grid={grid}
            isSending={isSending}
            setIsSending={setIsSending}
          />
        </div>
      </div>

      {/* equivalence rules and rule visual representation */}
      <div className="header2-visual">
        {/* visual display of the rule showing all of the possible previous row 3 cell configurations and the outcome cell value of the rule  */}
        <div className="header2-container">
          {/* mirror equivalence rule */}
          <div className="rule-container">
            <label>mirror rule:</label>
            <p>{mirrorRule}</p>
          </div>
          {/* black/white swapped equivalence rule */}
          <div className="rule-container">
            <label>black/white swapped rule:</label>
            <p>{blackWhiteSwappedRule}</p>
          </div>
          {/* reversed and black/white swapped equivalence rule */}
          <div className="rule-container">
            <label>reverse black/white swapped rule:</label>
            <p>{reverseSwapBlackWhiteRule}</p>
          </div>
        </div>
      </div>

      {/* rule display grid */}
      <main className="main">
        <div className="scroll-inner">
          <GridDisplay grid={grid} />
        </div>
      </main>
    </div>
  );
}

export default App;
