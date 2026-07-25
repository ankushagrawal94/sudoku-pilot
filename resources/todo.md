# Sudoku Pilot TODO

This is the canonical repository backlog for product and engineering follow-ups. Keep entries focused on outcomes and open decisions; move detailed implementation plans into a dedicated specification when work begins.

## Product opportunities

- [ ] **Adaptive improvement campaign**
  - Product requirements: [Adaptive Improvement Campaign v0.2](adaptive-improvement-campaign-product-v0.2.md).
  - Technical design: [Adaptive Improvement Campaign Technical Design v0.1](adaptive-improvement-campaign-technical-v0.1.md).
  - Recommend the learner's next best activity from a personal skill graph, skip or automate demonstrated mastery, introduce at most one unfamiliar technique, and adapt the sequence from recognition, assistance, retention, goals, and available time.
  - Keep “Today's personalized puzzle” as a home-screen entry point, not a one-puzzle-per-day limit. Learners can continue the campaign immediately.
  - Prove that representative learner profiles receive meaningfully different sequences before treating the feature as differentiated from a fixed campaign.

- [ ] **Optional login**
  - The account, sync, and purchase-recovery boundary is defined in the campaign [product requirements](adaptive-improvement-campaign-product-v0.2.md#local-first-and-account-behavior) and [technical design](adaptive-improvement-campaign-technical-v0.1.md#optional-sync-boundary).
  - Product requirements and implementation plan: [Optional Login and Account Sync Specification v0.1](optional-login-v0.1.md).
  - Keep sign-in optional and preserve the current local-first experience.
  - Lead with benefits that justify an account: cross-device campaign progress, purchase restoration, no repeated catalog puzzles, and recovery of learning history.
  - Implement consent, data minimization, export, deletion, and a safe migration path for existing browser data as specified before enabling the feature.

- [ ] **Evaluate technique-finding tools and coaching toggles**
  - Their role as temporary, fading campaign scaffolds is defined in the [Adaptive Improvement Campaign product requirements](adaptive-improvement-campaign-product-v0.2.md#coaching-and-tool-fading).
  - Goal: help learners reduce the visual search space and recognize a technique themselves without immediately revealing the move.
  - Current baseline: **Show line counts** displays the selected digit's occurrences in each row and column using placed values and player-entered notes. In a unit where the digit is still missing, one candidate occurrence can point toward a Hidden Single; two candidate occurrences can expose a strong link used by techniques such as Skyscraper, 2-String Kite, and W-Wing.
  - Evaluate these utilities:
    - **Unit candidate counts:** extend the current display to 3×3 blocks, distinguish counts of one, two, and three, and optionally filter the board to units with a chosen count. This can support Hidden Singles, strong-link techniques, X-Wing, and Swordfish.
    - **Bivalue/trivalue cell filter:** emphasize cells with exactly two or three candidates. This can narrow the search for Naked Pairs/Triples and the pivot or wing cells in XY-Wing, XYZ-Wing, and W-Wing.
    - **Matching candidate-set finder:** after selecting a bivalue or trivalue cell, highlight other cells with the same candidate pair or set. This can support Naked Subsets and W-Wing without identifying the completed pattern.
    - **Box-line intersection spotlight:** for a focused digit, show when all candidates in a block share one row or column, or when all candidates in a row or column fall inside one block. This directly trains the visual scan behind Pointing and Claiming Candidates.
    - **Strong-link overlay:** mark or connect the two possible positions for a focused digit in any row, column, or block. This builds on line counts for Skyscraper, 2-String Kite, W-Wing, and future chain coaching.
    - **Shared-visibility overlay:** let a learner select two or three candidate endpoints and show the cells that see all of them. This can help learners test possible eliminations for wings, Skyscraper, and 2-String Kite.
    - **Fish footprint view:** for one digit, emphasize eligible two- or three-position base lines and their shared cover lines. Explore this only after the simpler count and strong-link tools prove useful.
  - Integrate useful tools into coaching as an intermediate step between “where to look” and revealing the pattern's exact location. The coach could suggest or temporarily enable the relevant view, explain what structural fact it exposes, and leave the same control available for independent solving.
  - Guardrails:
    - Derive claims from the solver's complete legal-candidate state, or label a view clearly when it reflects only player-entered notes. Incomplete notes must never be treated as proof of a move.
    - Keep every utility optional, reversible, keyboard accessible, usable on a 320 px-wide screen, and understandable without relying on color alone.
    - Prefer tools that expose counts, candidate shapes, or visibility relationships over controls that directly identify an elimination.
    - Validate each utility with learners and product analytics before expanding the default interface.
  - Reference patterns:
    - [Sudoku Coach's candidate highlighting and drawing tools](https://sudoku.coach/en/play/hard)
    - [Sudoku Coach's explanation of finding chains from strong links](https://sudoku.coach/en/learn/x-chain)
    - [HoDoKu's allowed/excluded candidate filters and multi-candidate filtering](https://hodoku.sourceforge.net/en/docs_play.php)
