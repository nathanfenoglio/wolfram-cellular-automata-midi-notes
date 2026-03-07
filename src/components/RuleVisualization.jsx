import { ruleToLookup } from "../lib/cellularAutomata";

export function RuleVisualization({ rule }) {
  const lookup = ruleToLookup(rule);

  return (
    <div className="rule-visual-container">
      {/* for each of the possible 3 cell configurations */}
      {/* 7(111), 6(110), 5(101), 4(100), 3(011), 2(010), 1(001), 0(000) */}
      {[7, 6, 5, 4, 3, 2, 1, 0].map((i) => {
        // get left, center, right cell values 
        const left = (i >> 2) & 1;
        const center = (i >> 1) & 1;
        const right = i & 1;
        // get the result cell 
        const output = lookup[i];

        return (
          <div key={i} className="rule-visual-segment">
            {/* each of the above 3 cell possible configurations */}
            <div className="rule-visual-top">
              <div className={`cell ${left ? "cell-on" : "cell-off"}`} />
              <div className={`cell ${center ? "cell-on" : "cell-off"}`} />
              <div className={`cell ${right ? "cell-on" : "cell-off"}`} />
            </div>
            {/* the outcome for each of the 3 cell possible configurations */}
            <div className="rule-visual-bottom">
              <div className={`cell ${output ? "cell-on" : "cell-off"}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
