import { useState, useCallback, useEffect } from "react";
import { RuleSelector } from "./components/RuleSelector";
import { GridDisplay } from "./components/GridDisplay";
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

  // reset grid when user changes rule
  const handleRuleChange = useCallback((newRule) => {
    setRule(newRule);
    setGrid(createInitialGrid());
    const mirrorRule = getReverseRule(newRule);
    console.log(mirrorRule);
    setMirrorRule(mirrorRule);

    const blackWhiteSwappedRule = getSwapBlackWhite(newRule);
    console.log(blackWhiteSwappedRule);
    setBlackWhiteSwappedRule(blackWhiteSwappedRule);

    const reverseSwapBlackWhiteRule = getReverseSwapBlackWhite(newRule);
    console.log(reverseSwapBlackWhiteRule);
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
        <h1>Wolfram Cellular Automata</h1>
        <RuleSelector value={rule} onChange={handleRuleChange} />
        <Controls
          onStep={handleStep}
          onReset={handleReset}
        />
        <RowViewer rule={rule} grid={grid} />
      </header>
      
      {/* equivalence rules (the 3 symmetric rules to the current rule being displayed) */}
      <div className="equivalence-rules-container">
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
