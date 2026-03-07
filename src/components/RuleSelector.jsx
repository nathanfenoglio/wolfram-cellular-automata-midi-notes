import { useState, useEffect } from "react";

export function RuleSelector({ value, onChange }) {
  const [inputValue, setInputValue] = useState(String(value));

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleChange = (e) => {
    const next = e.target.value;
    // display the user's input
    setInputValue(next);

    // don't call onChange if empty string
    if (next === "") return;

    // check that input is valid (0-255)
    const v = parseInt(next, 10);
    if (!isNaN(v) && v >= 0 && v <= 255) {
      // call onChange since valid input
      onChange(v);
    }
  };

  // when user navigates away from input field
  const handleBlur = () => {
    // if input is empty, reset to current value
    if (inputValue === "") {
      setInputValue(String(value));
      return;
    }

    // if input is invalid, clamp to nearest valid value and call onChange with that value
    const v = parseInt(inputValue, 10);
    if (isNaN(v) || v < 0) {
      const clamped = 0;
      setInputValue(String(clamped));
      onChange(clamped);
    } else if (v > 255) {
      const clamped = 255;
      setInputValue(String(clamped));
      onChange(clamped);
    }
  };

  return (
    <div className="rule-selector">
      <label htmlFor="rule-input">Rule (0–255):</label>
      <input
        id="rule-input"
        type="number"
        min={0}
        max={255}
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {/* <input
        type="range"
        min={0}
        max={255}
        value={value}
        onChange={handleChange}
        className="rule-slider"
      /> */}
    </div>
  );
}
