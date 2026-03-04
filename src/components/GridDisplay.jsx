export function GridDisplay({ grid }) {
  return (
    <div className="grid-container">
      <div className="grid">
        {grid.map((row, rowIndex) => (
          <div key={rowIndex} className="grid-row">
            {row.map((cell, colIndex) => (
              <div
                key={colIndex}
                // cell value will either be 0 or 1 to determine css class background white or black
                className={`cell ${cell ? "cell-on" : "cell-off"}`}
                // className={`cell ${cell ? "cell-off" : "cell-on"}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
