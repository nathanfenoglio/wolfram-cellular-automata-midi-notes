import { useState, useEffect } from "react";

export function Controls({ onStep, onReset, isRunning }) {
  const [autoRun, setAutoRun] = useState(false);

  useEffect(() => {
    if (!autoRun) return;
    // run rule every 100ms when auto-run is enabled
    const id = setInterval(onStep, 100);
    return () => clearInterval(id);
  }, [autoRun, onStep]);

  return (
    <div className="controls">
      <button onClick={onStep} disabled={autoRun}>
        Step
      </button>
      <button onClick={onReset}>Reset</button>
      <label>
        <input
          type="checkbox"
          checked={autoRun}
          onChange={(e) => setAutoRun(e.target.checked)}
        />
        Auto-run
      </label>
    </div>
  );
}
