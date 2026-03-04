// Wolfram 1D cellular automata rule logic

// there are certain rules where it draws a checker board pattern instead of just black
// 251 for instance
// 243 for instance should be 1 diagonal line going to the right but ends up being a triangle checkerboard pattern
// think that it's the way the logic deals with the furthest to the right cell update calculation
// think that it's like 010 is the start middle above state that is looked at
// but also 001 is the start left and 100 is the start right and maybe that part's not valid
// so maybe could check if like step is 1 then should only be looking at 1 + 2 above cells 
// and if a cell doesn't exist to make 3 above left middle right cells then 0
// all of the notable ones display correctly though

// put binary representation of rule # into array (reversed order from how the binary representation looks)
export function ruleToLookup(ruleNumber) {
  const lookup = new Array(8);
  for (let i = 0; i < 8; i++) {
    // read binary representation of rule # from right to left and save in lookup array
    // so will be reversed looking in lookup
    // each digit is either 1 or 0 and anded with 1 masks (gets the furthest to the right digit) 
    // so lookup will be organized representing the update that should be applied for the above cell configurations:
    // (0, 0, 0), (0, 0, 1), (0, 1, 0), (0, 1, 1), (1, 0, 0), (1, 0, 1), (1, 1, 0), (1, 1, 1)
    // and for rule 30 for instance that would be (it will be the reverse of the binary representation 00011110 = 30)
    //     0          1          1          1          1          0          0          0
    lookup[i] = (ruleNumber >> i) & 1;
  }
  return lookup;
}

// calculate next row's cell values 
// automata expands 1 cell to the left and 1 cell to the right with each iteration (+ 2 elements)
function nextRowExpanding(currentRow, lookup) {
  // currentRow is the last row that was built
  const L = currentRow.length;
  const row = new Array(L + 2);
  // edge case new furthest to the left cell
  row[0] = lookup[(0 << 2) | (0 << 1) | currentRow[0]];
  // middle cells
  for (let i = 1; i <= L; i++) { // start at index 1 already calculated 0th furthest to the left index
    // get above left cell's value if it is index 1 then there is no above left cell so it will be 0 
    const left = i >= 2 ? currentRow[i - 2] : 0;
    // get above center cell's value
    const center = currentRow[i - 1];
    // get above right cell's value 
    // if index is next to last cell that we are adding for this row there is no above right cell so it will be 0 
    const right = i < L ? currentRow[i] : 0;
    // calculate index to look up the result from the rule for
    // by forming binary representation of above cell values like left|center|right
    // so if above left was 0 and above center was 0 and above right was 1 001
    // then would look up the rule (0 or 1) for that above cell configuration at index 1
    // so if above left was 1 and above center was 0 and above right was 1 101
    // then would look up the rule (0 or 1) for that above cell configuration at index 5 (101 = 5)
    row[i] = lookup[(left << 2) | (center << 1) | right];
  }
  // edge case new furthest to the right cell
  row[L + 1] = lookup[(currentRow[L - 1] << 2) | (0 << 1) | 0];
  return row;
}

// get new row to add and add to grid
export function applyRule(grid, ruleNumber) {
  const lookup = ruleToLookup(ruleNumber);
  const lastRow = grid[grid.length - 1];
  const newRow = nextRowExpanding(lastRow, lookup);
  return [...grid, newRow];
}

// initial grid starts with 1 cell with value 1
export function createInitialGrid() {
  return [[1]];
}

// get the values for 1 row specified by the user to display as 0s 1s can be used for rhythm patterns or whatever
// by repeatedly applying the rule until reaching the specified row
export function getRowAt(ruleNumber, rowIndex) {
  let grid = createInitialGrid();
  while (grid.length <= rowIndex) {
    grid = applyRule(grid, ruleNumber);
  }
  return grid[rowIndex];
}

export function getReverseRule(origRule) {
  // left <-> right swap mirror
  // counting right to left and starting with index 0
  // swap 1 001 and 4 100
  const bin1 = (origRule >> 1) & 1;
  const bin4 = (origRule >> 4) & 1;
  // set bit 1 to whatever bit 4 was
  let mirrorRule = (origRule & ~(1 << 1)) | (bin4 << 1);
  // set bit 4 to whatever bit 1 was
  mirrorRule = (mirrorRule & ~(1 << 4) | (bin1 << 4));
  // swap 3 011 and 6 110
  const bin3 =  (origRule >> 3) & 1;
  const bin6 = (origRule >> 6) & 1;
  // set bit 6 to whatever bit 3 was
  mirrorRule = (mirrorRule & ~(1 << 6)) | (bin3 << 6);
  // clear bit 3 then set it to whatever bit 6 was
  mirrorRule = (mirrorRule & ~(1 << 3)) | (bin6 << 3);
  return mirrorRule;
}

// doesn't seem to be working correctly for all cases
export function getSwapBlackWhite(origRule) {
  const origRuleStr = origRule.toString(2).padStart(8, '0');
  console.log("origRuleStr");
  console.log(origRuleStr);
  
  // reverse original 8 bit #
  const reversed = [...origRuleStr].reverse().join('');
  console.log(reversed);

  const swapped = 255 - parseInt(reversed, 2);
  return swapped;
}

// compose finding reverse rule and then swapping black and white functions 
// to get reverse and black and white swapped associated rule
export function getReverseSwapBlackWhite(origRule) {
  return getSwapBlackWhite(getReverseRule(origRule));
}
