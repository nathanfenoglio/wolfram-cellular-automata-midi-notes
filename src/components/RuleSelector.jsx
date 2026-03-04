export function RuleSelector({ value, onChange }) {
  const handleChange = (e) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 0 && v <= 255) {
      onChange(v);
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
        value={value}
        onChange={handleChange}
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
