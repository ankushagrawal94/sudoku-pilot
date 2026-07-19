# Suduko Assistant App

I want to build a Sudoku assistant that helps me solve Sudoku puzzles. I want to remove the repetitive elements of solving a Sudoku and focus only on improving my game.

One way to use it with a screenshot of a Sudoku from another app. I want to be able to ask it what all of the possible next moves are given the information I have. It should correctly identify what technique I should have used to solve this.

Another benefit would be a practice mode that helps us find a particular move. (e.g. I want to practice skyscrapers, so find me a puzzle and get the board state (w/ notes) to a place where I need to find a skyscraper next).

Think about this as creating a personalized sudoku coach for you.

**Experience Requirements**

- Start a new puzzle
    - Choose difficulty
    - Choose what techniques it should or should not require
- Import a puzzle (from a screenshot)
    - The screenshot may have both pencil notes and filled in items. I need the app to understand the difference and appropriately model the two.
- On a puzzle…
    - input a number
    - input a pencil note
    - undo
    - erase
    - hint w/ all possible next moves
    - fill in all pencil notes
    - run through a set of selected techniques (e.g. hidden single, skyscraper, etc) until I cannot go any further with the selected techniques
    - shade the row, column and block when selecting a cell
    - when selecting a number (or cell with a number filled in), highlight in yellow all digits in all cells that have that number
- When offering the list of hints…
    - First show me a card with all of the possible moves, named. Then, allow me to swipe between the hints (AKA all possible next moves).
    - On each hint…
        - Explain the technique that’s being used to help solve this puzzle.
        - Highlight in green the numbers & pencil notes that are used to make a determination
        - Highlight in red the pencil notes that can be eliminated.
        - Offer an “apply” button to have the computer apply the eliminations
        - Offer an “x” or cancel button to not apply the hint.

**Components We May Need**

- Data Structure to store Sudoku Puzzle w/ notes
- Sudoku Generator (create puzzles)
    - Ideally, we should be able to create these with a set difficulty.
    - Difficulty is determined by the techniques needed to solve it.
    - A naive approach to this might be to create a random puzzle and keep applying the easiest solving techniques until you get stuck, then level up, and try again. The puzzle’s level is determined by the hardest technique required. (easy, medium, hard, expert, extreme).
- Step by Step Solver
    - Every step the solver takes should be a move from it’s known move database.
    - At each step it should list all possible next moves. The result of a move can be adding notes to a set of cells, removing notes from a set of cells, or filling in a candidate.

**Technical Details**

- Use Javascript and HTML.
- I just need to run this locally in a browser for now. Eventually, I’d want to deploy this.
- I want this to be mobile friendly and responsive.
- Write clean code with distinct functions and comments explaining what’s happening. Lean on simplicity in the written code.

**Techniques by Level**

- Extreme:
    - X-Wing
    - Swordfish
    - Skyscraper
    - 2-String Kite
    - XY-Wing
    - XYZ-Wing
    - W-Wing
- Expert:
    - Last Digit
    - Hidden Single
    - Naked Single
    - Pointing Candidates
    - Claiming Candidates
    - Hidden Pair
    - Hidden Triple
    - Naked Pair
    - Naked Triple
    - Naked Quadruple
- Hard
    - **Last Digit**
        - It's the simplest technique of all: find a block, a row, or a column with only one empty cell and fill it with the missing number.
    - **Hidden Single**
        - Choose a number and look for a block, a row, or a column with only one cell where this number can be placed. Look in blocks first – it takes less effort.
    - **Naked Single**
        - Look for a cell where there is only one number that can be placed in that cell.
    - **Pointing Candidates**
        - Consider each block. Find cells in that block where a certain number can be placed. If these cells are confined to a row or column, in that row or column, this number cannot appear outside that block.
        - This technique itself does not allow you to put a number into a cell. However, it helps to eliminate candidates from cells.
    - **Claiming Candidates**
        - Consider each row. Find cells in that row where a certain number can be placed. If these cells are confined to a block, in that block, this number cannot appear outside that row. The same works for columns.
        - This technique too does not allow you to put a number into a cell. It helps to eliminate candidates from cells.
    - **Hidden Pair**
        - Consider a block, a row, or a column. If there are two numbers that can be placed only in two cells and these cells are the same for both numbers, then no other numbers than these two may appear in those two cells.
        - This technique is the most difficult of all the techniques for solving Hard Sudoku. Use it only when nothing else works.

**Goals:**

1. Find puzzles that allow us to practice a set of techniques... (e.g. skyscraper and xy-wings)
2. Go as far as you can in the puzzle using selected tricks, allowing us to work on the techniques we care about.
3. For a given puzzle, we want to know all known next steps instead of just one.